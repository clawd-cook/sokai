import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

describe("registry-jdesign module", () => {
  it("exports createJdesignRegistry and keeps peer imports", () => {
    const src = readFileSync(join(here, "../src/registry-jdesign.ts"), "utf8");
    expect(src).toContain("export function createJdesignRegistry");
    expect(src).toContain("@jd/jdesign-vue");
    expect(src).toContain("@jd/jdesign-vue-pro");
  });
});
