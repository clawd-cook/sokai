export const SESSION_SCHEMA_VERSION = 1;
export const PAGE_SCHEMA_VERSION = 1;
export const REPORT_SCHEMA_VERSION = 1;

export type LocatorHint =
  | { strategy: "role"; role: string; name?: string }
  | { strategy: "label"; label: string }
  | { strategy: "css"; selector: string }
  | { strategy: "testId"; testId: string };

export type ActionType = "click" | "fill" | "select" | "scroll" | "keydown" | "navigate";

export interface ActionEntry {
  id: string;
  timestamp: number;
  type: ActionType;
  target?: LocatorHint;
  value?: string;
  url?: string;
}

export interface NetworkEntry {
  id: string;
  timestamp: number;
  method: string;
  url: string;
  status: number;
  requestHeaders: Record<string, string>;
  responseHeaders: Record<string, string>;
  requestBody?: string;
  responseBody?: string;
}

export interface SessionMeta {
  schemaVersion: number;
  url: string;
  viewport: { width: number; height: number };
  startedAt: string;
  endedAt: string;
  pilotTag: string;
}

export interface BundleIndex {
  schemaVersion: number;
  keyframes: Array<{
    id: string;
    file: string;
    domFile: string;
    actionFrom?: string;
    actionTo?: string;
    at: number;
  }>;
}

/** Relative paths within a SessionBundle directory. */
export const SESSION_BUNDLE_PATHS = {
  meta: "meta.json",
  actions: "actions.jsonl",
  network: "network.jsonl",
  index: "index.json",
  keyframes: "keyframes",
  dom: "dom",
} as const;

export type SessionBundlePaths = typeof SESSION_BUNDLE_PATHS;

export type SchemaNodeType =
  | "Page"
  | "Heading"
  | "SearchForm"
  | "Field"
  | "Table"
  | "Pagination"
  | "Dialog"
  | "Button"
  | "Unknown";

export interface SchemaNode {
  id: string;
  type: SchemaNodeType;
  props: Record<string, unknown>;
  children?: SchemaNode[];
  actionId?: string;
  provenance: "rule" | "model";
}

export interface DataSource {
  id: string;
  method: string;
  urlPattern: string;
  networkEntryId?: string;
}

export interface PageSchema {
  schemaVersion: number;
  id: string;
  title: string;
  root: SchemaNode;
  dataSources: DataSource[];
  partial?: boolean;
}

export interface StepResult {
  actionId: string;
  ok: boolean;
  error?: string;
  networkMiss?: string;
}

export interface BacktestReport {
  schemaVersion: number;
  startedAt: string;
  endedAt: string;
  mode: "mock" | "live";
  steps: StepResult[];
  summary: { passed: number; failed: number; partialSchema: boolean };
}
