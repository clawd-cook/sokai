import { describe, expect, it } from "vitest";
import type { ActionEntry } from "@sokai/session";
import { filterActions } from "../src/filter-actions.js";

describe("filterActions", () => {
  it("removes scroll and keydown without value; keeps click/fill/select/navigate", () => {
    const actions: ActionEntry[] = [
      { id: "a1", timestamp: 1, type: "scroll" },
      { id: "a2", timestamp: 2, type: "keydown" },
      { id: "a3", timestamp: 3, type: "keydown", value: "Enter" },
      {
        id: "a4",
        timestamp: 4,
        type: "click",
        target: { strategy: "role", role: "button", name: "搜索" },
      },
      {
        id: "a5",
        timestamp: 5,
        type: "fill",
        target: { strategy: "label", label: "品池 ID" },
        value: "x",
      },
      {
        id: "a6",
        timestamp: 6,
        type: "select",
        target: { strategy: "label", label: "状态" },
        value: "启用",
      },
      { id: "a7", timestamp: 7, type: "navigate", url: "https://example.com" },
    ];

    const filtered = filterActions(actions);
    expect(filtered.map((a) => a.id)).toEqual(["a3", "a4", "a5", "a6", "a7"]);
  });
});
