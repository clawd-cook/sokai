import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertValidBundleDir,
  readSessionBundle,
  writeSessionBundle,
} from "../src/bundle.js";

describe("session bundle IO", () => {
  it("writes and reads meta, actions, network, index", async () => {
    const dir = await mkdtemp(join(tmpdir(), "sokai-bundle-"));
    await writeSessionBundle(dir, {
      meta: {
        schemaVersion: 1,
        url: "https://example.com/compose-pool",
        viewport: { width: 1280, height: 720 },
        startedAt: "2026-09-05T00:00:00.000Z",
        endedAt: "2026-09-05T00:01:00.000Z",
        pilotTag: "compose-pool-list",
      },
      actions: [
        {
          id: "a1",
          timestamp: 10,
          type: "click",
          target: { strategy: "role", role: "button", name: "搜索" },
        },
      ],
      network: [
        {
          id: "n1",
          timestamp: 11,
          method: "POST",
          url: "https://example.com/api/list",
          status: 200,
          requestHeaders: {},
          responseHeaders: { "content-type": "application/json" },
          requestBody: "{}",
          responseBody: '{"list":[]}',
        },
      ],
      index: {
        schemaVersion: 1,
        keyframes: [
          {
            id: "k1",
            file: "keyframes/k1.png",
            domFile: "dom/k1.json",
            actionFrom: "a1",
            actionTo: "a1",
            at: 10,
          },
        ],
      },
      keyframes: [{ name: "k1.png", bytes: new Uint8Array([137, 80, 78, 71]) }],
      domSnapshots: [{ name: "k1.json", json: { role: "document", name: "合成池管理" } }],
    });

    const rawMeta = await readFile(join(dir, "meta.json"), "utf8");
    expect(JSON.parse(rawMeta).pilotTag).toBe("compose-pool-list");

    const loaded = await readSessionBundle(dir);
    expect(loaded.actions).toHaveLength(1);
    expect(loaded.network[0]?.url).toContain("/api/list");
    expect(loaded.index.keyframes[0]?.file).toBe("keyframes/k1.png");

    await assertValidBundleDir(dir);
  });

  it("assertValidBundleDir fails without actions", async () => {
    const dir = await mkdtemp(join(tmpdir(), "sokai-bad-"));
    await writeSessionBundle(dir, {
      meta: {
        schemaVersion: 1,
        url: "https://example.com",
        viewport: { width: 800, height: 600 },
        startedAt: "2026-09-05T00:00:00.000Z",
        endedAt: "2026-09-05T00:00:01.000Z",
        pilotTag: "compose-pool-list",
      },
      actions: [],
      network: [],
      index: { schemaVersion: 1, keyframes: [] },
      keyframes: [],
      domSnapshots: [],
    });
    // delete actions by rewriting empty invalid: assert requires non-empty actions file existence — empty array still has file; use missing file case:
    const { unlink } = await import("node:fs/promises");
    await unlink(join(dir, "actions.jsonl"));
    await expect(assertValidBundleDir(dir)).rejects.toThrow(/actions/i);
  });
});
