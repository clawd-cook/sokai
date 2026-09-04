import type { NetworkEntry } from "./types.js";

const SENSITIVE_HEADER = /^(authorization|cookie|set-cookie)$/i;
const SENSITIVE_BODY_KEY = /token|password|secret|authorization/i;

export function redactHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    out[key] = SENSITIVE_HEADER.test(key) ? "[REDACTED]" : value;
  }
  return out;
}

function redactJsonBody(body: string | undefined): string | undefined {
  if (body === undefined) return undefined;
  try {
    const parsed: unknown = JSON.parse(body);
    const redacted = redactJsonValue(parsed);
    return JSON.stringify(redacted);
  } catch {
    return body;
  }
}

function redactJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactJsonValue);
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SENSITIVE_BODY_KEY.test(key) ? "[REDACTED]" : redactJsonValue(val);
    }
    return out;
  }
  return value;
}

export function redactNetworkEntry(entry: NetworkEntry): NetworkEntry {
  return {
    ...entry,
    requestHeaders: redactHeaders(entry.requestHeaders),
    responseHeaders: redactHeaders(entry.responseHeaders),
    requestBody: redactJsonBody(entry.requestBody),
    responseBody: redactJsonBody(entry.responseBody),
  };
}
