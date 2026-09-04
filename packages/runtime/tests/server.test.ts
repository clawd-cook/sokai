/** @vitest-environment node */
import { afterEach, describe, expect, it } from "vitest";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startPreviewServer } from "../src/server.js";

describe("startPreviewServer", () => {
  let close: (() => Promise<void>) | undefined;
  let dir: string | undefined;

  afterEach(async () => {
    await close?.();
    close = undefined;
    if (dir) {
      await rm(dir, { recursive: true, force: true });
      dir = undefined;
    }
  });

  it("serves schema.json from Vite createServer", async () => {
    dir = join(tmpdir(), `sokai-runtime-server-${Date.now()}`);
    await mkdir(dir, { recursive: true });
    const schemaPath = join(dir, "page.schema.json");
    await writeFile(
      schemaPath,
      JSON.stringify({
        schemaVersion: 1,
        id: "preview-smoke",
        title: "smoke",
        dataSources: [],
        root: { id: "root", type: "Page", provenance: "rule", props: {} },
      }),
    );

    const server = await startPreviewServer({ schemaPath, port: 0, mock: false });
    close = () => server.close();

    expect(server.baseUrl).toMatch(/^http:\/\//);
    const res = await fetch(`${server.baseUrl}/schema.json`);
    expect(res.ok).toBe(true);
    expect(await res.json()).toMatchObject({ id: "preview-smoke" });
  });
});
