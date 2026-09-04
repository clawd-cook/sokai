import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { runBacktest, type BacktestDriver } from "@sokai/backtest";
import { parsePageSchema } from "@sokai/session";
import { findRepoRoot, runCli } from "../src/main.js";

const here = dirname(fileURLToPath(import.meta.url));

describe("cli backtest", () => {
  it("prints help and exits 0", async () => {
    const code = await runCli(["backtest", "--help"]);
    expect(code).toBe(0);
  });

  it("replays sample-v1 with a fake driver after generating schema", async () => {
    const root = await findRepoRoot(here);
    const bundle = join(root, "fixtures/compose-pool/sample-v1");
    const outDir = await mkdtemp(join(tmpdir(), "sokai-cli-bt-"));
    const schemaPath = join(outDir, "page.schema.json");

    const code = await runCli([
      "schema",
      "--bundle",
      bundle,
      "--out",
      schemaPath,
      "--no-llm",
    ]);
    expect(code).toBe(0);
    expect(parsePageSchema(JSON.parse(await readFile(schemaPath, "utf8"))).root).toBeTruthy();

    const fake: BacktestDriver = {
      async start() {},
      async clickAction() {},
      async click() {},
      async fill() {},
      async assertRegion() {},
      async close() {},
    };
    const report = await runBacktest({
      bundleDir: bundle,
      schemaPath,
      driver: fake,
    });
    expect(report.summary.failed).toBe(0);
  });
});

// Manual Playwright path (not run in CI — Vite + Chromium):
// pnpm sokai -- schema --bundle fixtures/compose-pool/sample-v1 --out /tmp/page.schema.json --no-llm
// pnpm sokai -- backtest --bundle fixtures/compose-pool/sample-v1 --schema /tmp/page.schema.json
