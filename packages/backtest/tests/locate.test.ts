import { describe, expect, it } from "vitest";
import type { PageSchema } from "@sokai/session";
import { criticalRegionIds, locateAction } from "../src/locate.js";

const emptySchema: PageSchema = {
  schemaVersion: 1,
  id: "partial.no-regions",
  title: "empty",
  dataSources: [],
  root: { id: "root", type: "Page", provenance: "rule", props: {} },
};

describe("criticalRegionIds", () => {
  it("always returns region-search and region-table even when schema omits them", () => {
    expect(criticalRegionIds(emptySchema)).toEqual(["region-search", "region-table"]);
  });
});

describe("locateAction", () => {
  it("falls back to CSS hint when name is unmapped", () => {
    const plan = locateAction(
      {
        id: "a-css",
        timestamp: 1,
        type: "click",
        target: { strategy: "css", selector: ".el-button--primary" },
      },
      new Set(),
    );
    expect(plan).toEqual({
      kind: "clickHint",
      hint: { strategy: "css", selector: ".el-button--primary" },
    });
  });

  it("is unlocatable when click has no name or hint", () => {
    const plan = locateAction({ id: "a-none", timestamp: 1, type: "click" }, new Set());
    expect(plan.kind).toBe("unlocatable");
  });
});
