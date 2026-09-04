import { describe, expect, it } from "vitest";
import { mountPreview } from "../src/mount.js";
import type { PageSchema } from "@sokai/session";

const schema: PageSchema = {
  schemaVersion: 1,
  id: "marketing.coupon.composePool.list",
  title: "合成池管理",
  dataSources: [],
  root: {
    id: "root",
    type: "Page",
    provenance: "rule",
    props: {},
    children: [
      {
        id: "region-search",
        type: "SearchForm",
        provenance: "rule",
        props: { title: "search" },
        children: [
          {
            id: "action-search-btn",
            type: "Button",
            provenance: "rule",
            props: { label: "搜索" },
            actionId: "action-search",
          },
        ],
      },
      {
        id: "region-table",
        type: "Table",
        provenance: "rule",
        props: { columns: [{ label: "品池 ID", prop: "id" }] },
        children: [
          {
            id: "action-update",
            type: "Button",
            provenance: "rule",
            props: { label: "更新" },
            actionId: "action-open-blacklist-dialog",
          },
        ],
      },
    ],
  },
};

describe("mountPreview", () => {
  it("exposes data-sokai-action hooks", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const app = mountPreview(el, schema, { mock: false });
    expect(el.querySelector('[data-sokai-action="action-search"]')).toBeTruthy();
    expect(
      el.querySelector('[data-sokai-action="action-open-blacklist-dialog"]'),
    ).toBeTruthy();
    expect(el.querySelector('[data-sokai-region="region-search"]')).toBeTruthy();
    expect(el.querySelector('[data-sokai-region="region-table"]')).toBeTruthy();
    app.unmount();
  });

  it("renders placeholder for Unknown without throwing", () => {
    const el = document.createElement("div");
    const s = structuredClone(schema);
    s.root.children!.push({
      id: "x",
      type: "Unknown",
      provenance: "rule",
      props: { note: "mystery" },
    });
    expect(() => mountPreview(el, s, { mock: false })).not.toThrow();
  });

  it("does not invent action-page-next on Pagination without actionId", () => {
    const el = document.createElement("div");
    const s = structuredClone(schema);
    s.root.children!.push({
      id: "region-pagination",
      type: "Pagination",
      provenance: "rule",
      props: {},
    });
    const app = mountPreview(el, s, { mock: false });
    expect(el.querySelector('[data-sokai-region="region-pagination"]')).toBeTruthy();
    expect(el.querySelector('[data-sokai-action="action-page-next"]')).toBeNull();
    app.unmount();
  });
});
