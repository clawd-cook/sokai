import type { BacktestDriver, PlaywrightDriverOptions } from "./types.js";

export { filterActions } from "./filter-actions.js";
export {
  locateAction,
  targetName,
  collectActionIds,
  collectRegionIds,
  criticalRegionIds,
  CRITICAL_REGION_IDS,
  NAME_TO_ACTION_ID,
} from "./locate.js";
export type { LocatePlan } from "./locate.js";
export { runBacktest } from "./run.js";
export type { RunBacktestOptions } from "./run.js";
export type { BacktestDriver, PlaywrightDriverOptions } from "./types.js";

/**
 * Lazy Playwright driver factory. Importing `@sokai/backtest` does not load
 * Vue / `@sokai/runtime` mount paths; the driver is loaded only when called.
 */
export async function createPlaywrightDriver(
  options: PlaywrightDriverOptions,
): Promise<BacktestDriver> {
  const { createPlaywrightDriver: create } = await import(
    /* @vite-ignore */ "./playwright-driver.js"
  );
  return create(options);
}
