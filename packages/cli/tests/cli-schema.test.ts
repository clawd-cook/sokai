import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parsePageSchema } from "@sokai/session";
import { runCli } from "../src/main.js";

async function findRepoRoot(start: string): Promise<string> {
  const { access } = await import("node:fs/promises");
  let dir = start;
  for (;;) {
    try {
      await access(join(dir, "fixtures/compose-pool/sample-v1/meta.json"));
      return dir;
    } catch {
      const parent = dirname(dir);
      if (parent === dir) {
        throw new Error("repo root with fixtures/compose-pool/sample-v1 not found");
      }
      dir = parent;
    }
  }
}

describe("cli schema", () => {
  it("builds page schema from sample-v1 without LLM", async () => {
    const root = await findRepoRoot(dirname(fileURLToPath(import.meta.url)));
    const prev = process.cwd();
    process.chdir(root);
    try {
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
    } finally {
      process.chdir(prev);
    }
  });
});
