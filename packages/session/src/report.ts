import { writeFile } from "node:fs/promises";
import { REPORT_SCHEMA_VERSION } from "./types.js";
import type { BacktestReport } from "./types.js";

export async function writeBacktestReport(path: string, report: BacktestReport): Promise<void> {
  const normalized: BacktestReport = {
    ...report,
    schemaVersion: report.schemaVersion ?? REPORT_SCHEMA_VERSION,
  };
  await writeFile(path, JSON.stringify(normalized, null, 2) + "\n", "utf8");
}
