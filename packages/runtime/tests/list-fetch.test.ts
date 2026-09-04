import { describe, expect, it } from "vitest";
import { pickListDataSource, resolveListRequest, urlFromPattern } from "../src/list-fetch.js";
import type { PageSchema } from "@sokai/session";

describe("list-fetch", () => {
  it("prefers a page/list dataSource and uses the recorded URL", () => {
    const schema: PageSchema = {
      schemaVersion: 1,
      id: "p",
      title: "t",
      root: { id: "root", type: "Page", provenance: "rule", props: {} },
      dataSources: [
        { id: "other", method: "GET", urlPattern: "**/health**", networkEntryId: "n0" },
        {
          id: "ds-post-api-combinatePool-page",
          method: "POST",
          urlPattern: "**/api/combinatePool/page**",
          networkEntryId: "n1",
        },
      ],
    };
    expect(pickListDataSource(schema.dataSources)?.id).toBe("ds-post-api-combinatePool-page");
    expect(
      resolveListRequest(schema, [
        {
          id: "n1",
          timestamp: 0,
          method: "POST",
          url: "https://example.com/api/combinatePool/page",
          status: 200,
          requestHeaders: {},
          responseHeaders: {},
        },
      ]),
    ).toEqual({
      method: "POST",
      url: "https://example.com/api/combinatePool/page",
    });
  });

  it("strips glob stars when no recorded URL is available", () => {
    expect(urlFromPattern("**/api/combinatePool/page**")).toBe("/api/combinatePool/page");
  });
});
