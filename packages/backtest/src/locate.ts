import type { ActionEntry, LocatorHint, PageSchema, SchemaNode } from "@sokai/session";

/** Stable name → schema actionId heuristics for compose-pool pilot. */
export const NAME_TO_ACTION_ID: Record<string, string> = {
  搜索: "action-search",
  重置: "action-reset",
  更新: "action-open-blacklist-dialog",
  导出: "action-export",
  下一页: "action-page-next",
};

export function targetName(hint: LocatorHint | undefined): string | undefined {
  if (!hint) return undefined;
  if (hint.strategy === "role") return hint.name;
  if (hint.strategy === "label") return hint.label;
  return undefined;
}

export function collectActionIds(node: SchemaNode, out = new Set<string>()): Set<string> {
  if (node.actionId) out.add(node.actionId);
  for (const child of node.children ?? []) {
    collectActionIds(child, out);
  }
  return out;
}

export function collectRegionIds(node: SchemaNode, out: string[] = []): string[] {
  if (node.id.startsWith("region-")) {
    out.push(node.id);
  }
  for (const child of node.children ?? []) {
    collectRegionIds(child, out);
  }
  return out;
}

/** Pilot critical structure selectors — always asserted, even if omitted from the schema tree. */
export const CRITICAL_REGION_IDS = ["region-search", "region-table"] as const;

export function criticalRegionIds(_schema?: PageSchema): string[] {
  return [...CRITICAL_REGION_IDS];
}

export type LocatePlan =
  | { kind: "clickAction"; actionId: string }
  | { kind: "clickHint"; hint: LocatorHint }
  | { kind: "fill"; hint: LocatorHint; value: string }
  | { kind: "navigate"; url?: string }
  | { kind: "unlocatable"; reason: string };

/**
 * Map a recorded action onto a driver plan using name heuristics + schema actionIds.
 * Pagination (下一页): clickAction when action-page-next exists; otherwise unlocatable.
 */
export function locateAction(action: ActionEntry, schemaActionIds: Set<string>): LocatePlan {
  if (action.type === "navigate") {
    return { kind: "navigate", url: action.url };
  }

  if (action.type === "fill" || action.type === "select") {
    if (!action.target) {
      return { kind: "unlocatable", reason: `${action.type} missing target` };
    }
    return { kind: "fill", hint: action.target, value: action.value ?? "" };
  }

  if (action.type === "keydown") {
    // Valued keydowns are kept by filter but have no dedicated driver hook yet.
    return { kind: "unlocatable", reason: `keydown not replayable: ${action.value ?? ""}` };
  }

  if (action.type !== "click") {
    return { kind: "unlocatable", reason: `unsupported action type: ${action.type}` };
  }

  const name = targetName(action.target);
  if (name === "下一页") {
    if (schemaActionIds.has("action-page-next")) {
      return { kind: "clickAction", actionId: "action-page-next" };
    }
    return {
      kind: "unlocatable",
      reason: "pagination next (下一页): action-page-next not present in schema",
    };
  }

  if (name && NAME_TO_ACTION_ID[name]) {
    return { kind: "clickAction", actionId: NAME_TO_ACTION_ID[name]! };
  }

  if (action.target?.strategy === "css") {
    return { kind: "clickHint", hint: action.target };
  }

  if (action.target?.strategy === "testId") {
    return { kind: "clickHint", hint: action.target };
  }

  if (action.target) {
    return { kind: "clickHint", hint: action.target };
  }

  return { kind: "unlocatable", reason: "click has no mappable name or locator hint" };
}
