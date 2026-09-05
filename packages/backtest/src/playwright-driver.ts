import type { LocatorHint } from "@sokai/session";
import { chromium, type Browser, type Page } from "playwright";
import {
  startPreviewServer,
  type PreviewServerHandle,
} from "@sokai/runtime/server";
import {
  MOCK_MISS_BINDING,
  MockMissSink,
  PREVIEW_READY_SELECTOR,
  mockMissFromMessage,
  mockMissFromPageError,
  wrapPreviewFetchForMockMiss,
  type MockMissPayload,
} from "./page-bridge.js";
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
 * Page-side MockMissError is bridged via exposeBinding + fetch wrap + pageerror.
 */
export function createPlaywrightDriver(options: PlaywrightDriverOptions): BacktestDriver {
  let server: PreviewServerHandle | undefined;
  let browser: Browser | undefined;
  let page: Page | undefined;
  const sink = new MockMissSink();

  async function settleAndThrowMockMiss() {
    if (!page) return;
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          queueMicrotask(() => {
            setTimeout(resolve, 0);
          });
        }),
    );
    await page
      .waitForFunction(
        () =>
          ((globalThis as unknown as { __sokaiMockFetchInFlight?: number })
            .__sokaiMockFetchInFlight ?? 0) === 0,
        { timeout: 5000 },
      )
      .catch(() => undefined);
    const err = sink.take();
    if (err) throw err;
  }

  function beginUserAction() {
    sink.beginStep();
  }

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

      await page.exposeBinding(
        MOCK_MISS_BINDING,
        (_source, payload: MockMissPayload) => {
          sink.remember(payload);
        },
      );
      page.on("pageerror", (err) => {
        sink.remember(
          mockMissFromPageError({
            name: err.name,
            message: err.message,
          }),
        );
      });
      page.on("console", (msg) => {
        if (msg.type() === "error") {
          sink.remember(mockMissFromMessage(msg.text()));
        }
      });

      await page.goto(server.baseUrl, { waitUntil: "networkidle" });
      try {
        await page.waitForSelector(PREVIEW_READY_SELECTOR, { timeout: 30_000 });
      } catch (err) {
        const body = await page.locator("body").innerText().catch(() => "(no body)");
        throw new Error(
          `Preview hooks not ready (${PREVIEW_READY_SELECTOR}). Page body:\n${body}\nCause: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
      await page.evaluate(wrapPreviewFetchForMockMiss);
      // Drop load-time pageerror/console misses so they cannot poison step 1.
      sink.beginStep();
    },

    async clickAction(actionId: string) {
      if (!page) throw new Error("Playwright driver not started");
      beginUserAction();
      const selector = `[data-sokai-action="${actionId}"]`;
      await page.locator(selector).click({ timeout: 5000 });
      await settleAndThrowMockMiss();
    },

    async click(hint: LocatorHint) {
      if (!page) throw new Error("Playwright driver not started");
      beginUserAction();
      await locatorFor(page, hint).click({ timeout: 5000 });
      await settleAndThrowMockMiss();
    },

    async fill(hint: LocatorHint, value: string) {
      if (!page) throw new Error("Playwright driver not started");
      beginUserAction();
      const loc = locatorFor(page, hint);
      const tag = await loc
        .evaluate((el) => el.tagName.toLowerCase())
        .catch(() => "");
      if (tag === "select") {
        await loc.selectOption(value, { timeout: 5000 });
      } else {
        await loc.fill(value, { timeout: 5000 });
      }
      await settleAndThrowMockMiss();
    },

    async assertRegion(regionId: string) {
      if (!page) throw new Error("Playwright driver not started");
      beginUserAction();
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
      sink.beginStep();
    },
  };
}
