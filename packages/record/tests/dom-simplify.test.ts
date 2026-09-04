import { describe, expect, it } from "vitest";
import { simplifyDom } from "../src/dom-simplify.js";

describe("simplifyDom", () => {
  it("drops script nodes and limits depth", () => {
    const input = {
      role: "document",
      name: "合成池管理",
      children: [
        { tag: "script", children: [{ tag: "text", name: "evil" }] },
        {
          role: "form",
          name: "search",
          children: [{ role: "textbox", name: "品池 ID", attrs: { id: "pool" } }],
        },
      ],
    };
    const out = simplifyDom(input, 3) as any;
    expect(JSON.stringify(out)).not.toContain("evil");
    expect(out.children.some((c: any) => c.role === "form")).toBe(true);
  });
});
