import type { DataSource, NetworkEntry } from "@sokai/session";

export class MockMissError extends Error {
  readonly fingerprint: string;

  constructor(method: string, url: string) {
    const path = fingerprintPath(url);
    const fingerprint = `${method.toUpperCase()} ${path}`;
    super(`Mock miss: ${fingerprint}`);
    this.name = "MockMissError";
    this.fingerprint = fingerprint;
  }
}

function fingerprintPath(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

function patternToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*\*/g, ".*");
  return new RegExp(`^${escaped}$`);
}

function matchesUrlPattern(pattern: string, url: string): boolean {
  return patternToRegExp(pattern).test(url);
}

function requestMethod(init?: RequestInit): string {
  return (init?.method ?? "GET").toUpperCase();
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

/**
 * Monkey-patches `globalThis.fetch` to serve recorded network bodies for declared dataSources.
 * Unmatched requests throw {@link MockMissError} with fingerprint `METHOD path`.
 * @returns restore function that reinstates the previous `fetch`.
 */
export function installMockFetch(
  dataSources: DataSource[],
  network: NetworkEntry[],
): () => void {
  const previous = globalThis.fetch;
  const byId = new Map(network.map((entry) => [entry.id, entry]));

  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = requestUrl(input);
    const method = requestMethod(init);

    const ds = dataSources.find(
      (item) =>
        item.method.toUpperCase() === method && matchesUrlPattern(item.urlPattern, url),
    );

    if (!ds || !ds.networkEntryId) {
      throw new MockMissError(method, url);
    }

    const entry = byId.get(ds.networkEntryId);
    if (!entry) {
      throw new MockMissError(method, url);
    }

    return new Response(entry.responseBody ?? "", {
      status: entry.status,
      headers: entry.responseHeaders,
    });
  };

  return () => {
    globalThis.fetch = previous;
  };
}
