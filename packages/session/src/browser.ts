/**
 * Browser-safe surface for Vite client bundles.
 * Must not import node:fs or other Node builtins.
 */
export { PAGE_SCHEMA_VERSION, SESSION_SCHEMA_VERSION, REPORT_SCHEMA_VERSION } from "./types.js";
export type {
  LocatorHint,
  ActionType,
  ActionEntry,
  NetworkEntry,
  SessionMeta,
  BundleIndex,
  SchemaNodeType,
  SchemaNode,
  DataSource,
  PageSchema,
  StepResult,
  BacktestReport,
} from "./types.js";

export { parsePageSchema } from "./page-schema.js";
export { pathnameOfUrl, toUrlPattern, matchesUrlPattern } from "./url-pattern.js";
export { redactHeaders, redactNetworkEntry } from "./redact.js";
