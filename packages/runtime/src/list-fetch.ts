import type { DataSource, NetworkEntry, PageSchema } from "@sokai/session";

const LIST_HINT = /page|list|search|query|combinate/i;
const LIST_FETCH_ACTIONS = new Set(["action-search", "action-page-next", "action-reset"]);

export function isListFetchAction(actionId: string | undefined): boolean {
  return actionId != null && LIST_FETCH_ACTIONS.has(actionId);
}

export function pickListDataSource(sources: DataSource[]): DataSource | undefined {
  return sources.find((ds) => LIST_HINT.test(ds.urlPattern)) ?? sources[0];
}

export function urlFromPattern(pattern: string): string {
  const stripped = pattern.replace(/\*\*/g, "");
  return stripped.length > 0 ? stripped : pattern;
}

/**
 * Resolve the list API request from schema dataSources + recorded network entries.
 */
export function resolveListRequest(
  schema: PageSchema,
  network: NetworkEntry[] = [],
): { method: string; url: string } | undefined {
  const ds = pickListDataSource(schema.dataSources);
  if (!ds) return undefined;
  const entry = ds.networkEntryId
    ? network.find((item) => item.id === ds.networkEntryId)
    : undefined;
  return {
    method: ds.method.toUpperCase(),
    url: entry?.url ?? urlFromPattern(ds.urlPattern),
  };
}
