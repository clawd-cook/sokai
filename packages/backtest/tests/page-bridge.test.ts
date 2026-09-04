import { describe, expect, it } from "vitest";
import {
  PREVIEW_READY_SELECTOR,
  MockMissSink,
  createMockMissError,
  mockMissFromMessage,
  mockMissFromPageError,
  takePendingMockMiss,
  wrapPreviewFetchForMockMiss,
} from "../src/page-bridge.js";

describe("page-bridge", () => {
  it("waits for Vue action or region hooks after navigation", () => {
    expect(PREVIEW_READY_SELECTOR).toBe("[data-sokai-action], [data-sokai-region]");
  });

  it("builds a driver-level MockMissError with fingerprint", () => {
    const err = createMockMissError({
      message: "Mock miss: POST /combinatePool/page",
      fingerprint: "POST /combinatePool/page",
    });
    expect(err.name).toBe("MockMissError");
    expect(err.fingerprint).toBe("POST /combinatePool/page");
    expect(err.message).toContain("POST /combinatePool/page");
  });

  it("parses MockMissError from pageerror and console text", () => {
    const fromPage = mockMissFromPageError({
      name: "MockMissError",
      message: "Mock miss: GET /missing",
      fingerprint: "GET /missing",
    });
    expect(fromPage).toEqual({
      message: "Mock miss: GET /missing",
      fingerprint: "GET /missing",
    });

    const fromConsole = mockMissFromMessage("Mock miss: POST /combinatePool/page");
    expect(fromConsole?.fingerprint).toBe("POST /combinatePool/page");
  });

  it("takePendingMockMiss returns a throwable once", () => {
    const first = takePendingMockMiss({
      message: "Mock miss: GET /x",
      fingerprint: "GET /x",
    });
    expect(first?.name).toBe("MockMissError");
    expect(first?.fingerprint).toBe("GET /x");
    expect(takePendingMockMiss(undefined)).toBeUndefined();
  });

  it("wrapPreviewFetchForMockMiss reports page-side MockMissError to the binding", async () => {
    const reports: Array<{ fingerprint: string }> = [];
    const host = globalThis as typeof globalThis & {
      fetch: typeof fetch;
      __sokaiFetchWrapped?: boolean;
      __sokaiMockFetchInFlight?: number;
      __sokaiReportMockMiss?: (payload: { fingerprint: string }) => void;
    };
    const prevFetch = host.fetch;
    host.fetch = async () => {
      const err = new Error("Mock miss: GET /x") as Error & { fingerprint: string };
      err.name = "MockMissError";
      err.fingerprint = "GET /x";
      throw err;
    };
    host.__sokaiReportMockMiss = (payload) => {
      reports.push(payload);
    };
    try {
      wrapPreviewFetchForMockMiss();
      await expect(host.fetch("https://example.com/x")).rejects.toMatchObject({
        name: "MockMissError",
      });
      expect(reports[0]).toMatchObject({ fingerprint: "GET /x" });
    } finally {
      host.fetch = prevFetch;
      delete host.__sokaiFetchWrapped;
      delete host.__sokaiMockFetchInFlight;
      delete host.__sokaiReportMockMiss;
    }
  });

  it("awaits the mock-miss binding before fetch rejects", async () => {
    const host = globalThis as typeof globalThis & {
      fetch: typeof fetch;
      __sokaiFetchWrapped?: boolean;
      __sokaiMockFetchInFlight?: number;
      __sokaiReportMockMiss?: (payload: { fingerprint: string }) => Promise<void>;
    };
    const prevFetch = host.fetch;
    let recordedAt = 0;
    let rejectedAt = 0;
    host.fetch = async () => {
      const err = new Error("Mock miss: GET /await") as Error & { fingerprint: string };
      err.name = "MockMissError";
      err.fingerprint = "GET /await";
      throw err;
    };
    host.__sokaiReportMockMiss = async () => {
      await new Promise((resolve) => setTimeout(resolve, 25));
      recordedAt = Date.now();
    };
    try {
      wrapPreviewFetchForMockMiss();
      await expect(host.fetch("https://example.com/await")).rejects.toMatchObject({
        name: "MockMissError",
      });
      rejectedAt = Date.now();
      expect(recordedAt).toBeGreaterThan(0);
      expect(rejectedAt).toBeGreaterThanOrEqual(recordedAt);
    } finally {
      host.fetch = prevFetch;
      delete host.__sokaiFetchWrapped;
      delete host.__sokaiMockFetchInFlight;
      delete host.__sokaiReportMockMiss;
    }
  });

  it("ignores misses recorded before the current step starts", () => {
    const sink = new MockMissSink();
    sink.remember({ message: "Mock miss: GET /boot", fingerprint: "GET /boot" });
    sink.beginStep();
    expect(sink.take()).toBeUndefined();
  });

  it("keeps misses recorded after the current step starts", () => {
    const sink = new MockMissSink();
    sink.remember({ message: "Mock miss: GET /boot", fingerprint: "GET /boot" });
    sink.beginStep();
    sink.remember({ message: "Mock miss: POST /page", fingerprint: "POST /page" });
    expect(sink.take()?.fingerprint).toBe("POST /page");
  });
});
