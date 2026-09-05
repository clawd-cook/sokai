import type { Page } from "playwright";

/** Pilot list rows reuse the same action id; take the first match for backtest. */
export function sokaiActionLocator(page: Page, actionId: string) {
  return page.locator(`[data-sokai-action="${actionId}"]`).first();
}
