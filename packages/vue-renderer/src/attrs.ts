export const SOKAI_ACTION_ATTR = "data-sokai-action";
export const SOKAI_REGION_ATTR = "data-sokai-region";

export const PILOT_ACTION_IDS = {
  search: "action-search",
  reset: "action-reset",
  export: "action-export",
  openBlacklistDialog: "action-open-blacklist-dialog",
  pageNext: "action-page-next",
} as const;

export const PILOT_REGION_IDS = {
  search: "region-search",
  table: "region-table",
  pagination: "region-pagination",
} as const;

export function sokaiActionAttrs(actionId: string): Record<string, string> {
  return { [SOKAI_ACTION_ATTR]: actionId };
}

export function sokaiRegionAttrs(regionId: string): Record<string, string> {
  return { [SOKAI_REGION_ATTR]: regionId };
}
