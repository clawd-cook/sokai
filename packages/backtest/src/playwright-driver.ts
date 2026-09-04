import type { LocatorHint } from "@sokai/session";
import { chromium, type Browser, type Page } from "playwright";
import { startPreviewServer, type PreviewServerHandle } from "@sokai/runtime";
import type { BacktestDriver, PlaywrightDriverOptions } from "./types.js";

export type { PlaywrightDriverOptions };

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
 * Default driver: Vite preview via startPreviewServer + Playwright Chromium.
 */
export function createPlaywrightDriver(options: PlaywrightDriverOptions): BacktestDriver {
  let server: PreviewServerHandle | undefined;
  let browser: Browser | undefined;
  let page: Page | undefined;

  return {
    async start() {
      server = await startPreviewServer({
        schemaPath: options.schemaPath,
        bundleDir: options.bundleDir,
        port: 0,
        mock: options.mode !== "live",
      });
      browser = await chromium.launch({ headless: options.headed !== true });
      page = await browser.newPage();
      await page.goto(server.baseUrl, { waitUntil: "domcontentloaded" });
    },

    async clickAction(actionId: string) {
      if (!page) throw new Error("Playwright driver not started");
      const selector = `[data-sokai-action="${actionId}"]`;
      await page.locator(selector).click({ timeout: 5000 });
    },

    async click(hint: LocatorHint) {
      if (!page) throw new Error("Playwright driver not started");
      await locatorFor(page, hint).click({ timeout: 5000 });
    },

    async fill(hint: LocatorHint, value: string) {
      if (!page) throw new Error("Playwright driver not started");
      await locatorFor(page, hint).fill(value, { timeout: 5000 });
    },

    async assertRegion(regionId: string) {
      if (!page) throw new Error("Playwright driver not started");
      const selector = `[data-sokai-region="${regionId}"]`;
      const count = await page.locator(selector).count();
      if (count === 0) {
        throw new Error(`missing region: ${regionId} (selector ${selector})`);
      }
    },

    async close() {
      await page?.close().catch(() => undefined);
      await browser?.close().catch(() => undefined);
      await server?.close().catch(() => undefined);
      page = undefined;
      browser = undefined;
      server = undefined;
    },
  };
}
