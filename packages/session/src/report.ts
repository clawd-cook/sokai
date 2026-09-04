import { writeFile } from "node:fs/promises";
import type { BacktestReport } from "./types.js";

export async function writeBacktestReport(path: string, report: BacktestReport): Promise<void> {
  await writeFile(path, JSON.stringify(report, null, 2) + "\n", "utf8");
}
