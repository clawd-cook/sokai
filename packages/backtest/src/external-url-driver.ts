import type { LocatorHint } from "@sokai/session";
import { chromium, type Browser, type Page } from "playwright";
import type { BacktestDriver, ExternalUrlDriverOptions } from "./types.js";

export type { ExternalUrlDriverOptions };

function locatorFor(page: Page, hint: LocatorHint) {
  switch (hint.strategy) {
    case "role":
      return page.getByRole(hint.role as Parameters<Page["getByRole"]>[0], {
        name: hint.name,
      });
    case "label":
      return page.getByLabel(hint.label);
    case "css":
      return page.locator(hint.selector);
    case "testId":
      return page.getByTestId(hint.testId);
  }
}

/**
 * Chromium driver for a live business URL (no @sokai/runtime preview).
 * Clicks/asserts use data-sokai-action / data-sokai-region attributes.
 */
export function createExternalUrlDriver(options: ExternalUrlDriverOptions): BacktestDriver {
  let browser: Browser | undefined;
  let page: Page | undefined;

  return {
    async start() {
      browser = await chromium.launch({ headless: options.headed !== true });
      page = await browser.newPage();
      await page.goto(options.targetUrl, { waitUntil: "networkidle" });
    },

    async clickAction(actionId: string) {
      if (!page) throw new Error("External URL driver not started");
      await page.locator(`[data-sokai-action="${actionId}"]`).click({ timeout: 5000 });
    },

    async click(hint: LocatorHint) {
      if (!page) throw new Error("External URL driver not started");
      await locatorFor(page, hint).click({ timeout: 5000 });
    },

    async fill(hint: LocatorHint, value: string) {
      if (!page) throw new Error("External URL driver not started");
      const loc = locatorFor(page, hint);
      const tag = await loc
        .evaluate((el) => el.tagName.toLowerCase())
        .catch(() => "");
      if (tag === "select") {
        await loc.selectOption(value, { timeout: 5000 });
      } else {
        await loc.fill(value, { timeout: 5000 });
      }
    },

    async assertRegion(regionId: string) {
      if (!page) throw new Error("External URL driver not started");
      const selector = `[data-sokai-region="${regionId}"]`;
      const count = await page.locator(selector).count();
      if (count === 0) {
        throw new Error(`missing region: ${regionId} (selector ${selector})`);
      }
    },

    async close() {
      await page?.close().catch(() => undefined);
      await browser?.close().catch(() => undefined);
      page = undefined;
      browser = undefined;
    },
  };
}
