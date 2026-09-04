import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  assertSkeletonHasCriticalRegions,
  buildSkeletonFromDom,
  enrichWithModel,
  mapDataSources,
} from "../src/index.js";
import type { LlmClient } from "../src/llm.js";

const here = dirname(fileURLToPath(import.meta.url));

describe("schema rules", () => {
  it("builds compose-pool skeleton with stable region ids", async () => {
    const dom = JSON.parse(
      await readFile(join(here, "fixtures/compose-pool-dom.json"), "utf8"),
    );
    const root = buildSkeletonFromDom(dom);
    assertSkeletonHasCriticalRegions(root);
    const types = collectTypes(root);
    expect(types).toEqual(
      expect.arrayContaining(["Heading", "SearchForm", "Table", "Pagination", "Dialog"]),
    );
    expect(findByType(root, "SearchForm")?.id).toBe("region-search");
    expect(findByType(root, "Table")?.id).toBe("region-table");
  });

  it("fails hard when table missing", () => {
    const root = buildSkeletonFromDom({
      role: "document",
      children: [{ role: "form", name: "search", children: [] }],
    });
    expect(() => assertSkeletonHasCriticalRegions(root)).toThrow(/table/i);
  });

  it("enrichment cannot rename rule ids and marks partial on llm failure", async () => {
    const dom = JSON.parse(
      await readFile(join(here, "fixtures/compose-pool-dom.json"), "utf8"),
    );
    const root = buildSkeletonFromDom(dom);
    const skeleton = {
      schemaVersion: 1,
      id: "marketing.coupon.composePool.list",
      title: "合成池管理",
      root,
      dataSources: mapDataSources([
        {
          id: "n1",
          timestamp: 0,
          method: "POST",
          url: "https://x.com/api/combinatePool/page",
          status: 200,
          requestHeaders: {},
          responseHeaders: {},
          responseBody: "{}",
        },
      ]),
    };
    const badLlm: LlmClient = {
      async completeJson() {
        throw new Error("timeout");
      },
    };
    const partial = await enrichWithModel(skeleton, { domText: "…", llm: badLlm });
    expect(partial.partial).toBe(true);
    expect(findByType(partial.root, "SearchForm")?.id).toBe("region-search");

    const goodLlm: LlmClient = {
      async completeJson() {
        return {
          patches: [
            {
              id: "region-table",
              props: { columns: [{ label: "品池 ID", prop: "combinateMsPoolId" }] },
            },
            { id: "hacked-new-id", props: { title: "nope" } },
          ],
        };
      },
    };
    const enriched = await enrichWithModel(
      { ...skeleton, partial: false },
      { domText: "…", llm: goodLlm },
    );
    expect(findByType(enriched.root, "Table")?.props.columns).toEqual([
      { label: "品池 ID", prop: "combinateMsPoolId" },
    ]);
    expect(findById(enriched.root, "hacked-new-id")).toBeUndefined();
  });

  it("marks partial on soft-invalid model JSON without mutating skeleton", async () => {
    const dom = JSON.parse(
      await readFile(join(here, "fixtures/compose-pool-dom.json"), "utf8"),
    );
    const root = buildSkeletonFromDom(dom);
    const skeleton = {
      schemaVersion: 1,
      id: "marketing.coupon.composePool.list",
      title: "合成池管理",
      root,
      dataSources: [],
      partial: false,
    };
    const softInvalidLlm: LlmClient = {
      async completeJson() {
        return null;
      },
    };
    const soft = await enrichWithModel(skeleton, { domText: "…", llm: softInvalidLlm });
    expect(soft.partial).toBe(true);
    expect(findByType(soft.root, "SearchForm")?.id).toBe("region-search");
    expect(findByType(soft.root, "Table")?.id).toBe("region-table");
    expect(soft.root).toEqual(skeleton.root);
  });
});

function collectTypes(node: any): string[] {
  return [node.type, ...(node.children ?? []).flatMap(collectTypes)];
}
function findByType(node: any, type: string): any {
  if (node.type === type) return node;
  for (const c of node.children ?? []) {
    const f = findByType(c, type);
    if (f) return f;
  }
}
function findById(node: any, id: string): any {
  if (node.id === id) return node;
  for (const c of node.children ?? []) {
    const f = findById(c, id);
    if (f) return f;
  }
}
