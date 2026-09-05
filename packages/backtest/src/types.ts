import type { LocatorHint } from "@sokai/session";

/**
 * Browser/driver abstraction for replaying recorded actions.
 * Unit tests inject a fake; production uses createPlaywrightDriver.
 */
export interface BacktestDriver {
  start(): Promise<void>;
  clickAction(actionId: string): Promise<void>;
  /** Fallback click by recorded locator (CSS / role+name / etc.). */
  click?(hint: LocatorHint): Promise<void>;
  fill(hint: LocatorHint, value: string): Promise<void>;
  assertRegion(regionId: string): Promise<void>;
  close(): Promise<void>;
}

export interface PlaywrightDriverOptions {
  schemaPath: string;
  bundleDir: string;
  mode: "mock" | "live";
  headed?: boolean;
}

/** Live Chromium driver that navigates an already-running business URL. */
export interface ExternalUrlDriverOptions {
  targetUrl: string;
  headed?: boolean;
}
