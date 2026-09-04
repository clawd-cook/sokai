import { describe, expect, it, afterEach } from "vitest";
import { matchesUrlPattern, toUrlPattern } from "@sokai/session";
import { installMockFetch, MockMissError } from "../src/mock.js";

describe("installMockFetch", () => {
  let restore: (() => void) | undefined;

  afterEach(() => {
    restore?.();
    restore = undefined;
  });

  it("returns recorded body for matching dataSource", async () => {
    restore = installMockFetch(
      [
        {
          id: "poolList",
          method: "POST",
          urlPattern: "**/combinatePool/page**",
          networkEntryId: "n1",
        },
      ],
      [
        {
          id: "n1",
          timestamp: 0,
          method: "POST",
          url: "https://api.example.com/combinatePool/page",
          status: 200,
          requestHeaders: {},
          responseHeaders: { "content-type": "application/json" },
          responseBody: '{"list":[1]}',
        },
      ],
    );
    const res = await fetch("https://api.example.com/combinatePool/page", { method: "POST" });
    expect(await res.text()).toBe('{"list":[1]}');
  });

  it("throws MockMissError on undeclared URL", async () => {
    restore = installMockFetch([], []);
    await expect(fetch("https://api.example.com/other")).rejects.toBeInstanceOf(MockMissError);
  });

  it("matches POST dataSource when method is on Request", async () => {
    restore = installMockFetch(
      [
        {
          id: "poolList",
          method: "POST",
          urlPattern: "**/combinatePool/page**",
          networkEntryId: "n1",
        },
      ],
      [
        {
          id: "n1",
          timestamp: 0,
          method: "POST",
          url: "https://api.example.com/combinatePool/page",
          status: 200,
          requestHeaders: {},
          responseHeaders: { "content-type": "application/json" },
          responseBody: '{"list":[1]}',
        },
      ],
    );
    const res = await fetch(
      new Request("https://api.example.com/combinatePool/page", { method: "POST" }),
    );
    expect(await res.text()).toBe('{"list":[1]}');
  });

  it("matches schema-generated pathname globs against the recorded absolute URL", async () => {
    const recordedUrl = "https://example.com/api/combinatePool/page";
    const urlPattern = toUrlPattern("/api/combinatePool/page");
    expect(matchesUrlPattern(urlPattern, recordedUrl)).toBe(true);

    restore = installMockFetch(
      [
        {
          id: "ds-post-api-combinatePool-page",
          method: "POST",
          urlPattern,
          networkEntryId: "n1",
        },
      ],
      [
        {
          id: "n1",
          timestamp: 0,
          method: "POST",
          url: recordedUrl,
          status: 200,
          requestHeaders: {},
          responseHeaders: { "content-type": "application/json" },
          responseBody: '{"list":[1]}',
        },
      ],
    );
    const res = await fetch(recordedUrl, { method: "POST" });
    expect(await res.text()).toBe('{"list":[1]}');
  });

  it("matches a bare pathname urlPattern against a full fetch URL", async () => {
    restore = installMockFetch(
      [
        {
          id: "poolList",
          method: "POST",
          urlPattern: "/api/combinatePool/page",
          networkEntryId: "n1",
        },
      ],
      [
        {
          id: "n1",
          timestamp: 0,
          method: "POST",
          url: "https://example.com/api/combinatePool/page",
          status: 200,
          requestHeaders: {},
          responseHeaders: {},
          responseBody: '{"ok":true}',
        },
      ],
    );
    const res = await fetch("https://example.com/api/combinatePool/page", { method: "POST" });
    expect(await res.text()).toBe('{"ok":true}');
  });
});
