import { access, mkdtemp, readFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parsePageSchema } from "@sokai/session";
import { findRepoRoot, runCli } from "../src/main.js";

describe("cli schema", () => {
  it("builds page schema from sample-v1 without LLM", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "sokai-cli-"));
    const out = join(outDir, "page.schema.json");
    const code = await runCli([
      "schema",
      "--bundle",
      "fixtures/compose-pool/sample-v1",
      "--out",
      out,
      "--no-llm",
    ]);
    expect(code).toBe(0);
    const schema = parsePageSchema(JSON.parse(await readFile(out, "utf8")));
    expect(schema.root).toBeTruthy();
    expect(schema.partial).not.toBe(true);
  });

  it("writes relative --out under repo root when cwd is packages/cli", async () => {
    const root = await findRepoRoot(dirname(fileURLToPath(import.meta.url)));
    const cliDir = join(root, "packages/cli");
    const relOut = `.sokai-cli-out-${process.pid}-${Date.now()}.json`;
    const atRoot = join(root, relOut);
    const atPackage = join(cliDir, relOut);
    const prev = process.cwd();
    process.chdir(cliDir);
    try {
      const code = await runCli([
        "schema",
        "--bundle",
        "fixtures/compose-pool/sample-v1",
        "--out",
        relOut,
        "--no-llm",
      ]);
      expect(code).toBe(0);
      const schema = parsePageSchema(JSON.parse(await readFile(atRoot, "utf8")));
      expect(schema.root).toBeTruthy();
      await expect(access(atPackage)).rejects.toThrow();
    } finally {
      process.chdir(prev);
      await unlink(atRoot).catch(() => undefined);
      await unlink(atPackage).catch(() => undefined);
    }
  });
});
