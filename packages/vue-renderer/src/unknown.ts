import { h, type VNode } from "vue";

export const SOKAI_UNKNOWN_ATTR = "data-sokai-unknown";

export function renderUnknownPlaceholder(typeName?: string): VNode {
  return h("div", { [SOKAI_UNKNOWN_ATTR]: "1" }, typeName ?? "Unknown");
}
