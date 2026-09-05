import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { writeSessionBundle } from "@sokai/session";
import {
  resolveBacktestTarget,
  runBacktest,
  type BacktestDriver,
} from "../src/run.js";

const KNOWN_ACTION_IDS = [
  "action-search",
  "action-reset",
  "action-page-next",
  "action-export",
  "action-open-blacklist-dialog",
];

async function writeMiniBundle(dir: string): Promise<void> {
  await writeSessionBundle(dir, {
    meta: {
      schemaVersion: 1,
      url: "http://example.test/list",
      viewport: { width: 1280, height: 720 },
      startedAt: "2026-09-05T00:00:00.000Z",
      endedAt: "2026-09-05T00:01:00.000Z",
      pilotTag: "compose-pool-list",
    },
    actions: [
      {
        id: "a1",
        timestamp: 1,
        type: "click",
        target: { strategy: "role", role: "button", name: "搜索" },
      },
    ],
    network: [],
    index: { schemaVersion: 1, keyframes: [] },
    keyframes: [],
    domSnapshots: [],
  });
}

describe("runBacktest targetUrl", () => {
  it("runs without schemaPath when targetUrl + driver provided", async () => {
    const bundleDir = await mkdtemp(join(tmpdir(), "sokai-tu-"));
    await writeMiniBundle(bundleDir);
    const clickAction = vi.fn();
    const start = vi.fn();
    const driver: BacktestDriver = {
      async start() {
        start();
      },
      async clickAction(id) {
        clickAction(id);
      },
      async click() {},
      async fill() {},
      async assertRegion() {},
      async close() {},
    };
    const report = await runBacktest({
      bundleDir,
      targetUrl: "http://127.0.0.1:9/",
      driver,
      knownActionIds: KNOWN_ACTION_IDS,
    });
    expect(start).toHaveBeenCalled();
    expect(clickAction).toHaveBeenCalledWith("action-search");
    expect(report.summary.partialSchema).toBe(false);
    expect(report.mode).toBe("live");
  });

  it("resolveBacktestTarget prefers targetUrl over schemaPath when no driver", () => {
    expect(
      resolveBacktestTarget({
        targetUrl: "http://127.0.0.1:9/",
        schemaPath: "/tmp/page.schema.json",
      }),
    ).toEqual({ kind: "external", targetUrl: "http://127.0.0.1:9/" });
  });

  it("resolveBacktestTarget uses schemaPath for the preview driver", () => {
    expect(resolveBacktestTarget({ schemaPath: "/tmp/page.schema.json" })).toEqual({
      kind: "preview",
      schemaPath: "/tmp/page.schema.json",
    });
  });

  it("throws when neither driver, targetUrl, nor schemaPath is provided", () => {
    expect(() => resolveBacktestTarget({})).toThrow(
      /schemaPath or targetUrl \(or an injected driver\)/,
    );
  });
});
