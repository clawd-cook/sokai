import type {
  BacktestDriver,
  ExternalUrlDriverOptions,
  PlaywrightDriverOptions,
} from "./types.js";

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
export { DEFAULT_ACTION_IDS, resolveBacktestTarget, runBacktest } from "./run.js";
export type { BacktestTarget, RunBacktestOptions } from "./run.js";
export type {
  BacktestDriver,
  ExternalUrlDriverOptions,
  PlaywrightDriverOptions,
} from "./types.js";

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

/**
 * Lazy live-URL driver. Does not import `@sokai/runtime`.
 */
export async function createExternalUrlDriver(
  options: ExternalUrlDriverOptions,
): Promise<BacktestDriver> {
  const { createExternalUrlDriver: create } = await import("./external-url-driver.js");
  return create(options);
}
