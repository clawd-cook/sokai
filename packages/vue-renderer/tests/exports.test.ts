import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("package export split", () => {
  it("default entry does not import jdesign", () => {
    const index = readFileSync(join(pkgRoot, "src/index.ts"), "utf8");
    expect(index).not.toMatch(/jdesign|createJdesignRegistry/i);

    const pkg = JSON.parse(readFileSync(join(pkgRoot, "package.json"), "utf8")) as {
      exports: Record<string, { types?: string; import?: string }>;
    };
    expect(pkg.exports["./jdesign"]).toEqual({
      types: "./dist/jdesign.d.ts",
      import: "./dist/jdesign.js",
    });

    const tsdown = readFileSync(join(pkgRoot, "tsdown.config.ts"), "utf8");
    expect(tsdown).toContain("src/jdesign.ts");
  });

  it("jdesign subpath re-exports createJdesignRegistry", () => {
    const src = readFileSync(join(pkgRoot, "src/jdesign.ts"), "utf8");
    expect(src).toContain("createJdesignRegistry");
    expect(src).toMatch(/registry-jdesign/);
  });
});
