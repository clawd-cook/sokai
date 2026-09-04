import { afterEach, describe, expect, it, vi } from "vitest";
import { mountPreview } from "../src/mount.js";
import type { NetworkEntry, PageSchema } from "@sokai/session";

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

const listNetwork: NetworkEntry[] = [
  {
    id: "n1",
    timestamp: 0,
    method: "POST",
    url: "https://example.com/api/combinatePool/page",
    status: 200,
    requestHeaders: {},
    responseHeaders: { "content-type": "application/json" },
    responseBody: '{"list":[]}',
  },
];

const schemaWithList: PageSchema = {
  ...schema,
  dataSources: [
    {
      id: "ds-post-api-combinatePool-page",
      method: "POST",
      urlPattern: "/api/combinatePool/page",
      networkEntryId: "n1",
    },
  ],
};

describe("mountPreview", () => {
  let restoreFetch: (() => void) | undefined;

  afterEach(() => {
    restoreFetch?.();
    restoreFetch = undefined;
  });

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

  it("fetches the mapped list dataSource when search is clicked", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    const previous = globalThis.fetch;
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    restoreFetch = () => {
      globalThis.fetch = previous;
    };

    const el = document.createElement("div");
    document.body.appendChild(el);
    const s = structuredClone(schemaWithList);
    const app = mountPreview(el, s, { mock: false, network: listNetwork });
    const search = el.querySelector('[data-sokai-action="action-search"]') as HTMLButtonElement;
    search.click();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://example.com/api/combinatePool/page");
    expect((init as RequestInit | undefined)?.method).toBe("POST");
    app.unmount();
    el.remove();
  });

  it("fetches the mapped list dataSource when pagination is clicked", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    const previous = globalThis.fetch;
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    restoreFetch = () => {
      globalThis.fetch = previous;
    };

    const el = document.createElement("div");
    document.body.appendChild(el);
    const s = structuredClone(schemaWithList);
    s.root.children!.push({
      id: "region-pagination",
      type: "Pagination",
      provenance: "rule",
      props: { label: "pagination" },
      actionId: "action-page-next",
    });
    const app = mountPreview(el, s, { mock: false, network: listNetwork });
    const pager = el.querySelector('[data-sokai-action="action-page-next"]') as HTMLElement;
    pager.click();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://example.com/api/combinatePool/page");
    app.unmount();
    el.remove();
  });
});
