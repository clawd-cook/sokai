import { describe, expect, it } from "vitest";
import { redactHeaders, redactNetworkEntry } from "../src/redact.js";

describe("redact", () => {
  it("strips authorization and cookie headers", () => {
    const out = redactHeaders({
      Authorization: "Bearer secret",
      cookie: "a=1",
      "content-type": "application/json",
    });
    expect(out.Authorization).toBe("[REDACTED]");
    expect(out.cookie).toBe("[REDACTED]");
    expect(out["content-type"]).toBe("application/json");
  });

  it("redacts token-like body fields", () => {
    const entry = redactNetworkEntry({
      id: "1",
      timestamp: 0,
      method: "POST",
      url: "https://example.com/api",
      status: 200,
      requestHeaders: { authorization: "x" },
      responseHeaders: {},
      requestBody: '{"token":"abc"}',
      responseBody: '{"ok":true}',
    });
    expect(entry.requestHeaders.authorization).toBe("[REDACTED]");
    expect(entry.requestBody).toContain("[REDACTED]");
    expect(entry.requestBody).not.toContain("abc");
  });
});
