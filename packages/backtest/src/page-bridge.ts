export const PREVIEW_READY_SELECTOR = "[data-sokai-action], [data-sokai-region]";
export const MOCK_MISS_BINDING = "__sokaiReportMockMiss";

export interface MockMissPayload {
  message: string;
  fingerprint: string;
}

export function createMockMissError(
  payload: MockMissPayload,
): Error & { fingerprint: string } {
  const err = new Error(payload.message) as Error & { fingerprint: string };
  err.name = "MockMissError";
  err.fingerprint = payload.fingerprint;
  return err;
}

export function mockMissFromMessage(text: string): MockMissPayload | undefined {
  const match = text.match(/Mock miss:\s+(\S+\s+\S+)/);
  if (!match?.[1]) return undefined;
  return { message: `Mock miss: ${match[1]}`, fingerprint: match[1] };
}

export function mockMissFromPageError(err: {
  name?: string;
  message: string;
  fingerprint?: string;
}): MockMissPayload | undefined {
  if (typeof err.fingerprint === "string" && err.fingerprint.length > 0) {
    return { message: err.message, fingerprint: err.fingerprint };
  }
  return mockMissFromMessage(err.message);
}

export function takePendingMockMiss(
  pending: MockMissPayload | undefined,
): (Error & { fingerprint: string }) | undefined {
  if (!pending) return undefined;
  return createMockMissError(pending);
}

type BridgeGlobal = typeof globalThis & {
  fetch: typeof fetch;
  __sokaiMockFetchInFlight?: number;
  __sokaiFetchWrapped?: boolean;
  __sokaiReportMockMiss?: (payload: {
    name: string;
    message: string;
    fingerprint: string;
  }) => unknown;
};

/**
 * Wrap page fetch after Vue mount so page-side MockMissError is reported
 * to the Playwright exposeBinding and counted for settle-after-action.
 */
export function wrapPreviewFetchForMockMiss(): void {
  const w = globalThis as BridgeGlobal;
  if (w.__sokaiFetchWrapped) return;
  w.__sokaiFetchWrapped = true;
  w.__sokaiMockFetchInFlight = 0;
  const prev = w.fetch.bind(w);
  w.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    w.__sokaiMockFetchInFlight = (w.__sokaiMockFetchInFlight ?? 0) + 1;
    try {
      return await prev(input, init);
    } catch (err) {
      const e = err as { name?: string; message?: string; fingerprint?: string };
      if (e?.name === "MockMissError" || typeof e?.fingerprint === "string") {
        void w.__sokaiReportMockMiss?.({
          name: "MockMissError",
          message: e.message ?? "Mock miss",
          fingerprint: e.fingerprint ?? "",
        });
      }
      throw err;
    } finally {
      w.__sokaiMockFetchInFlight = (w.__sokaiMockFetchInFlight ?? 1) - 1;
    }
  };
}

export function previewFetchInFlight(): number {
  return (globalThis as BridgeGlobal).__sokaiMockFetchInFlight ?? 0;
}
