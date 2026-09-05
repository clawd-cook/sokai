import { afterEach, describe, expect, it } from "vitest";
import { resolveCliPath } from "../src/main.js";

describe("cli preview", () => {
  let close: (() => Promise<void>) | undefined;

  afterEach(async () => {
    await close?.();
    close = undefined;
  });

  it("imports @sokai/runtime/server and serves schema without Node loading .vue", async () => {
    const { startPreviewServer } = await import("@sokai/runtime/server");
    const schemaPath = await resolveCliPath(
      "fixtures/compose-pool/sample-v1/page.schema.json",
    );
    const bundleDir = await resolveCliPath("fixtures/compose-pool/sample-v1");
    const handle = await startPreviewServer({
      schemaPath,
      bundleDir,
      port: 0,
      mock: true,
    });
    close = () => handle.close();

    expect(handle.baseUrl).toMatch(/^http:\/\//);
    const res = await fetch(`${handle.baseUrl}/schema.json`);
    expect(res.ok).toBe(true);
    const body = (await res.json()) as { id?: string };
    expect(body.id).toBeTruthy();
  });
});
