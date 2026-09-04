import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  writePageSchema,
  writeSessionBundle,
  type ActionEntry,
  type LocatorHint,
  type PageSchema,
} from "@sokai/session";
import { runBacktest, type BacktestDriver } from "../src/index.js";

const schema: PageSchema = {
  schemaVersion: 1,
  id: "marketing.coupon.composePool.list",
  title: "合成池管理",
  dataSources: [],
  root: {
    id: "root",
    type: "Page",
    provenance: "rule",
    props: {},
    children: [
      {
        id: "region-search",
        type: "SearchForm",
        provenance: "rule",
        props: { title: "search" },
        children: [
          {
            id: "action-search-btn",
            type: "Button",
            provenance: "rule",
            props: { label: "搜索" },
            actionId: "action-search",
          },
        ],
      },
      {
        id: "region-table",
        type: "Table",
        provenance: "rule",
        props: { columns: [{ label: "品池 ID", prop: "id" }] },
        children: [
          {
            id: "action-update",
            type: "Button",
            provenance: "rule",
            props: { label: "更新" },
            actionId: "action-open-blacklist-dialog",
          },
        ],
      },
    ],
  },
};

function mockMissError(fingerprint: string): Error & { fingerprint: string } {
  const err = new Error(`Mock miss: ${fingerprint}`) as Error & { fingerprint: string };
  err.name = "MockMissError";
  err.fingerprint = fingerprint;
  return err;
}

function createRecordingDriver(options?: {
  failOnClick?: string;
  missOnClick?: { actionId: string; fingerprint: string };
}): BacktestDriver & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async start() {
      calls.push("start");
    },
    async clickAction(actionId: string) {
      calls.push(`clickAction:${actionId}`);
      if (options?.missOnClick?.actionId === actionId) {
        throw mockMissError(options.missOnClick.fingerprint);
      }
      if (options?.failOnClick === actionId) {
        throw new Error(`forced fail on ${actionId}`);
      }
    },
    async click(hint: LocatorHint) {
      calls.push(`click:${JSON.stringify(hint)}`);
    },
    async fill(hint: LocatorHint, value: string) {
      calls.push(`fill:${JSON.stringify(hint)}=${value}`);
    },
    async assertRegion(regionId: string) {
      calls.push(`assertRegion:${regionId}`);
    },
    async close() {
      calls.push("close");
    },
  };
}

async function writeFixture(
  dir: string,
  actions?: ActionEntry[],
  pageSchema: PageSchema = schema,
): Promise<{ schemaPath: string; bundleDir: string }> {
  const schemaPath = join(dir, "page.schema.json");
  const bundleDir = join(dir, "bundle");
  await writePageSchema(schemaPath, pageSchema);
  await writeSessionBundle(bundleDir, {
    meta: {
      schemaVersion: 1,
      url: "https://example.com/compose-pool",
      viewport: { width: 1280, height: 720 },
      startedAt: "2026-09-05T00:00:00.000Z",
      endedAt: "2026-09-05T00:01:00.000Z",
      pilotTag: "compose-pool-list",
    },
    actions: actions ?? [
      {
        id: "a1",
        timestamp: 1,
        type: "click",
        target: { strategy: "role", role: "button", name: "搜索" },
      },
      {
        id: "a2",
        timestamp: 2,
        type: "click",
        target: { strategy: "role", role: "button", name: "更新" },
      },
    ],
    network: [],
    index: { schemaVersion: 1, keyframes: [] },
    keyframes: [],
    domSnapshots: [],
  });
  return { schemaPath, bundleDir };
}

function actionSteps(report: { steps: Array<{ actionId: string }> }) {
  return report.steps.filter((step) => !step.actionId.startsWith("assert:"));
}

describe("runBacktest", () => {
  it("replays mapped clicks with fake driver and writes report", async () => {
    const dir = await mkdtemp(join(tmpdir(), "sokai-backtest-"));
    const { schemaPath, bundleDir } = await writeFixture(dir);
    const outPath = join(dir, "report.json");
    const driver = createRecordingDriver();

    const report = await runBacktest({
      bundleDir,
      schemaPath,
      mode: "mock",
      outPath,
      driver,
    });

    expect(report.summary.failed).toBe(0);
    expect(report.summary.passed).toBeGreaterThan(0);
    expect(driver.calls).toContain("clickAction:action-search");
    expect(driver.calls).toContain("clickAction:action-open-blacklist-dialog");
    expect(driver.calls).toContain("assertRegion:region-search");
    expect(driver.calls).toContain("assertRegion:region-table");
    expect(driver.calls[0]).toBe("start");
    expect(driver.calls.at(-1)).toBe("close");

    const written = JSON.parse(await readFile(outPath, "utf8"));
    expect(written.summary.failed).toBe(0);
    expect(written.steps).toHaveLength(report.steps.length);
  });

  it("records both steps when second click fails and failFast is false", async () => {
    const dir = await mkdtemp(join(tmpdir(), "sokai-backtest-fail-"));
    const { schemaPath, bundleDir } = await writeFixture(dir);
    const driver = createRecordingDriver({
      failOnClick: "action-open-blacklist-dialog",
    });

    const report = await runBacktest({
      bundleDir,
      schemaPath,
      mode: "mock",
      failFast: false,
      driver,
    });

    const clicks = actionSteps(report);
    expect(clicks).toHaveLength(2);
    expect(clicks[0]?.ok).toBe(true);
    expect(clicks[1]?.ok).toBe(false);
    expect(report.summary.failed).toBeGreaterThanOrEqual(1);
    expect(driver.calls).toContain("clickAction:action-search");
    expect(driver.calls).toContain("clickAction:action-open-blacklist-dialog");
    expect(driver.calls).toContain("assertRegion:region-search");
  });

  it("records networkMiss fingerprint on MockMissError and continues", async () => {
    const dir = await mkdtemp(join(tmpdir(), "sokai-backtest-miss-"));
    const { schemaPath, bundleDir } = await writeFixture(dir);
    const driver = createRecordingDriver({
      missOnClick: { actionId: "action-search", fingerprint: "POST /combinatePool/page" },
    });

    const report = await runBacktest({
      bundleDir,
      schemaPath,
      mode: "mock",
      failFast: false,
      driver,
    });

    const clicks = actionSteps(report);
    expect(clicks).toHaveLength(2);
    expect(clicks[0]).toMatchObject({
      ok: false,
      networkMiss: "POST /combinatePool/page",
    });
    expect(clicks[1]?.ok).toBe(true);
  });

  it("marks pagination next unlocatable when action-page-next is absent", async () => {
    const dir = await mkdtemp(join(tmpdir(), "sokai-backtest-page-"));
    const { schemaPath, bundleDir } = await writeFixture(dir, [
      {
        id: "a-next",
        timestamp: 1,
        type: "click",
        target: { strategy: "role", role: "button", name: "下一页" },
      },
    ]);
    const driver = createRecordingDriver();

    const report = await runBacktest({
      bundleDir,
      schemaPath,
      mode: "mock",
      driver,
    });

    const [step] = actionSteps(report);
    expect(step?.ok).toBe(false);
    expect(step?.error).toMatch(/unlocatable/);
    expect(step?.error).toMatch(/action-page-next/);
    expect(driver.calls).not.toContain("clickAction:action-page-next");
  });

  it("clicks action-page-next when pagination exists in schema", async () => {
    const dir = await mkdtemp(join(tmpdir(), "sokai-backtest-page-ok-"));
    const withPager: PageSchema = {
      ...schema,
      root: {
        ...schema.root,
        children: [
          ...(schema.root.children ?? []),
          {
            id: "region-pagination",
            type: "Pagination",
            provenance: "rule",
            props: {},
            children: [
              {
                id: "action-next",
                type: "Button",
                provenance: "rule",
                props: { label: "下一页" },
                actionId: "action-page-next",
              },
            ],
          },
        ],
      },
    };
    const { schemaPath, bundleDir } = await writeFixture(
      dir,
      [
        {
          id: "a-next",
          timestamp: 1,
          type: "click",
          target: { strategy: "role", role: "button", name: "下一页" },
        },
      ],
      withPager,
    );
    const driver = createRecordingDriver();

    const report = await runBacktest({
      bundleDir,
      schemaPath,
      mode: "mock",
      driver,
    });

    expect(actionSteps(report)[0]?.ok).toBe(true);
    expect(driver.calls).toContain("clickAction:action-page-next");
  });

  it("fills the recorded field hint", async () => {
    const dir = await mkdtemp(join(tmpdir(), "sokai-backtest-fill-"));
    const { schemaPath, bundleDir } = await writeFixture(dir, [
      {
        id: "a-fill",
        timestamp: 1,
        type: "fill",
        target: { strategy: "label", label: "品池 ID" },
        value: "pool-1",
      },
    ]);
    const driver = createRecordingDriver();

    const report = await runBacktest({
      bundleDir,
      schemaPath,
      mode: "mock",
      driver,
    });

    expect(actionSteps(report)[0]?.ok).toBe(true);
    expect(driver.calls.some((call) => call.startsWith("fill:") && call.endsWith("=pool-1"))).toBe(
      true,
    );
  });
});
