import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { readSessionBundle } from "@sokai/session";
import { createRecorderForPage } from "../src/recorder.js";

describe("createRecorderForPage", () => {
  it("records click actions and network then writes bundle on stop", async () => {
    const dir = await mkdtemp(join(tmpdir(), "sokai-rec-"));
    const handlers: Record<string, Function[]> = {};
    const page = {
      url: () => "https://example.com/compose-pool",
      viewportSize: () => ({ width: 1280, height: 720 }),
      on: (event: string, fn: Function) => {
        handlers[event] = handlers[event] ?? [];
        handlers[event]!.push(fn);
      },
      evaluate: vi.fn(async () => ({
        role: "document",
        name: "合成池管理",
        children: [{ role: "table", name: "data" }],
      })),
      screenshot: vi.fn(async () => Buffer.from([1, 2, 3])),
    };

    const rec = await createRecorderForPage(page as any, dir, {
      pilotTag: "compose-pool-list",
    });

    // simulate action + response via whatever public test hook recorder exposes
    await rec.trackAction({
      id: "a1",
      timestamp: 1,
      type: "click",
      target: { strategy: "role", role: "button", name: "搜索" },
    });
    await rec.trackNetwork({
      id: "n1",
      timestamp: 2,
      method: "POST",
      url: "https://example.com/api/list",
      status: 200,
      requestHeaders: { authorization: "secret" },
      responseHeaders: {},
      requestBody: "{}",
      responseBody: '{"list":[]}',
    });
    await rec.captureKeyframe("after-search");

    const out = await rec.stop();
    expect(out).toBe(dir);
    const bundle = await readSessionBundle(dir);
    expect(bundle.actions).toHaveLength(1);
    expect(bundle.network[0]?.requestHeaders.authorization).toBe("[REDACTED]");
    expect(bundle.index.keyframes.length).toBeGreaterThanOrEqual(1);
  });
});
