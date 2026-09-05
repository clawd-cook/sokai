import { describe, expect, it, vi } from "vitest";
import { defineHandlers } from "../src/handlers.js";

describe("defineHandlers", () => {
  it("returns the same map and preserves call behavior", async () => {
    const search = vi.fn();
    const handlers = defineHandlers({
      "action-search": search,
    });
    await handlers["action-search"]();
    expect(search).toHaveBeenCalledOnce();
    expect(Object.keys(handlers)).toEqual(["action-search"]);
  });
});
