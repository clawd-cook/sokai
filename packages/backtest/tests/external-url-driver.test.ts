import { readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createExternalUrlDriver } from "../src/external-url-driver.js";

const here = dirname(fileURLToPath(import.meta.url));

const DUPLICATE_ACTION_HTML = `<!doctype html>
<html lang="zh-CN">
  <body>
    <div data-sokai-region="region-table">
      <button data-sokai-action="action-open-blacklist-dialog" data-row="pool-1">更新</button>
      <button data-sokai-action="action-open-blacklist-dialog" data-row="pool-2">更新</button>
    </div>
    <script>
      document.querySelectorAll("[data-sokai-action]").forEach((el) => {
        el.addEventListener("click", () => {
          fetch("/clicked", { method: "POST", body: el.getAttribute("data-row") });
        });
      });
    </script>
  </body>
</html>`;

async function serveDuplicateActions(): Promise<{
  url: string;
  clicked: string[];
  close: () => Promise<void>;
}> {
  const clicked: string[] = [];
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    if (req.method === "POST" && req.url === "/clicked") {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => {
        clicked.push(Buffer.concat(chunks).toString("utf8"));
        res.writeHead(204);
        res.end();
      });
      return;
    }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(DUPLICATE_ACTION_HTML);
  });
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  return {
    url: `http://127.0.0.1:${port}/`,
    clicked,
    close: () =>
      new Promise((resolve) => {
        server.close(() => resolve());
      }),
  };
}

describe("clickAction locator sharing", () => {
  it("playwright-driver uses the same sokaiActionLocator helper", () => {
    const src = readFileSync(join(here, "../src/playwright-driver.ts"), "utf8");
    expect(src).toContain("sokaiActionLocator");
    expect(src).not.toMatch(/page\.locator\(`\[data-sokai-action="\$\{actionId\}"\]`\)\.click/);
  });
});

describe("createExternalUrlDriver clickAction", () => {
  it("clicks the first data-sokai-action when several rows share the same id", async () => {
    const { url, clicked, close } = await serveDuplicateActions();
    const driver = createExternalUrlDriver({ targetUrl: url });
    try {
      await driver.start();
      await driver.clickAction("action-open-blacklist-dialog");
      await expect.poll(() => clicked).toEqual(["pool-1"]);
    } finally {
      await driver.close();
      await close();
    }
  });
});
