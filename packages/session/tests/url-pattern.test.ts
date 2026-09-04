import { describe, expect, it } from "vitest";
import { matchesUrlPattern, pathnameOfUrl, toUrlPattern } from "../src/url-pattern.js";

describe("urlPattern helpers", () => {
  it("wraps a pathname as a host-agnostic glob", () => {
    expect(toUrlPattern("/api/combinatePool/page")).toBe("**/api/combinatePool/page**");
  });

  it("matches a glob pattern against a recorded absolute URL", () => {
    expect(
      matchesUrlPattern(
        "**/api/combinatePool/page**",
        "https://example.com/api/combinatePool/page",
      ),
    ).toBe(true);
  });

  it("matches a bare pathname pattern against a full URL via pathname", () => {
    expect(
      matchesUrlPattern("/api/combinatePool/page", "https://example.com/api/combinatePool/page"),
    ).toBe(true);
  });

  it("extracts pathname from absolute URLs", () => {
    expect(pathnameOfUrl("https://x.com/api/combinatePool/page?q=1")).toBe(
      "/api/combinatePool/page",
    );
  });
});
