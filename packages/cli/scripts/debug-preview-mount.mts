import { startPreviewServer } from "@sokai/runtime/server";
import { chromium } from "playwright";
import { resolve } from "node:path";

async function main() {
  const root = resolve(import.meta.dirname, "../..");
  const server = await startPreviewServer({
    schemaPath: "/tmp/sokai-page.schema.json",
    bundleDir: resolve(root, "fixtures/compose-pool/sample-v1"),
    port: 0,
    mock: true,
  });
  console.log("url", server.baseUrl);
  const schema = await fetch(server.baseUrl + "/schema.json").then((r) => r.json());
  console.log("schema root provenance", (schema as any).root?.provenance);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
  page.on("console", (m) => console.log("CONSOLE", m.type(), m.text()));
  await page.goto(server.baseUrl, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  console.log(
    "has data-sokai-region",
    (await page.content()).includes("data-sokai-region"),
  );
  console.log(
    "app text",
    await page.locator("#app").innerText().catch((e) => String(e)),
  );
  await browser.close();
  await server.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
