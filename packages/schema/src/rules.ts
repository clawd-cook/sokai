import type { DataSource, NetworkEntry, SchemaNode } from "@sokai/session";
import { pathnameOfUrl, toUrlPattern } from "@sokai/session";

interface DomNode {
  role?: string;
  name?: string;
  tag?: string;
  attrs?: Record<string, string>;
  children?: DomNode[];
}

const PAGE_SHELL_TAGS = new Set(["html", "body", "head"]);
const FIELD_TAGS = new Set(["input", "select", "textarea"]);
const FIELD_ROLES = new Set(["textbox", "searchbox", "combobox"]);

function isDomNode(value: unknown): value is DomNode {
  return typeof value === "object" && value !== null;
}

function textOf(node: DomNode): string {
  return (node.name ?? "").trim();
}

function attrsOf(node: DomNode): Record<string, string> {
  return node.attrs ?? {};
}

function tagOf(node: DomNode): string {
  return (node.tag ?? "").toLowerCase();
}

function isPageShell(node: DomNode): boolean {
  return node.role === "document" || PAGE_SHELL_TAGS.has(tagOf(node));
}

function looksLikeFormTag(node: DomNode): boolean {
  return node.role === "form" || node.role === "search" || tagOf(node) === "form";
}

function isFieldNode(node: DomNode): boolean {
  return FIELD_ROLES.has(node.role ?? "") || FIELD_TAGS.has(tagOf(node));
}

function isButtonNode(node: DomNode): boolean {
  return node.role === "button" || tagOf(node) === "button";
}

function isTableNode(node: DomNode): boolean {
  return node.role === "table" || tagOf(node) === "table";
}

function containsTableOrDialog(node: DomNode): boolean {
  if (isTableNode(node) || node.role === "dialog") return true;
  return (node.children ?? []).some(containsTableOrDialog);
}

function isSearchButtonLabel(label: string): boolean {
  const lower = label.toLowerCase();
  return label === "搜索" || lower === "search";
}

/** Compact region: own subtree has fields + a search button, and is not a page-sized container. */
function isCompactSearchRegion(node: DomNode): boolean {
  if (isPageShell(node) || containsTableOrDialog(node)) return false;
  let hasField = false;
  let hasSearchButton = false;
  walkDom(node, (child) => {
    if (isFieldNode(child)) hasField = true;
    if (isButtonNode(child) && isSearchButtonLabel(textOf(child))) hasSearchButton = true;
  });
  return hasField && hasSearchButton;
}

function walkDom(node: DomNode, visit: (n: DomNode) => void): void {
  for (const child of node.children ?? []) {
    visit(child);
    walkDom(child, visit);
  }
}

/**
 * SearchForm only from form-like structure or a compact fields+search subtree.
 * Never from document/html/body or concatenated descendant text (e.g. a page named "搜索").
 */
function looksLikeSearch(node: DomNode): boolean {
  if (isPageShell(node)) return false;
  if (looksLikeFormTag(node)) return true;
  const attrs = attrsOf(node);
  const hay = `${attrs["aria-label"] ?? ""} ${attrs.name ?? ""} ${attrs.id ?? ""}`.toLowerCase();
  if (hay.includes("search") || hay.includes("搜索")) return true;
  return isCompactSearchRegion(node);
}

function looksLikePagination(node: DomNode): boolean {
  if (node.role === "navigation") return true;
  const name = textOf(node).toLowerCase();
  const aria = (attrsOf(node)["aria-label"] ?? "").toLowerCase();
  return name.includes("pagination") || aria.includes("pagination") || name.includes("分页");
}

function makeNode(
  partial: Omit<SchemaNode, "provenance" | "props"> & {
    props?: Record<string, unknown>;
    provenance?: SchemaNode["provenance"];
  },
): SchemaNode {
  return {
    id: partial.id,
    type: partial.type,
    props: partial.props ?? {},
    children: partial.children,
    actionId: partial.actionId,
    provenance: partial.provenance ?? "rule",
  };
}

function mapField(node: DomNode, index: number): SchemaNode {
  const attrs = attrsOf(node);
  const fieldName = attrs.name || attrs.id || `field-${index}`;
  return makeNode({
    id: `field-${fieldName}`,
    type: "Field",
    props: {
      label: textOf(node) || fieldName,
      name: fieldName,
    },
  });
}

function mapSearchButton(node: DomNode): SchemaNode | undefined {
  const label = textOf(node);
  if (label === "搜索") {
    return makeNode({
      id: "action-search-btn",
      type: "Button",
      props: { label },
      actionId: "action-search",
    });
  }
  if (label === "重置") {
    return makeNode({
      id: "action-reset-btn",
      type: "Button",
      props: { label },
      actionId: "action-reset",
    });
  }
  return undefined;
}

function collectSearchControls(
  node: DomNode,
  children: SchemaNode[],
  fieldIndex: { n: number },
): void {
  for (const child of node.children ?? []) {
    if (isTableNode(child) || child.role === "dialog") continue;
    if (isFieldNode(child)) {
      children.push(mapField(child, fieldIndex.n++));
      continue;
    }
    if (isButtonNode(child)) {
      const button = mapSearchButton(child);
      if (button) children.push(button);
      continue;
    }
    collectSearchControls(child, children, fieldIndex);
  }
}

function mapSearchForm(node: DomNode): SchemaNode {
  const children: SchemaNode[] = [];
  collectSearchControls(node, children, { n: 0 });
  return makeNode({
    id: "region-search",
    type: "SearchForm",
    props: { title: textOf(node) || "search" },
    children,
  });
}

function mapTableChild(node: DomNode): SchemaNode | undefined {
  const label = textOf(node);
  const isButtonLike =
    node.role === "button" ||
    node.role === "link" ||
    node.tag === "button" ||
    node.tag === "a";
  if (!isButtonLike) return undefined;

  if (label === "更新") {
    return makeNode({
      id: "action-update",
      type: "Button",
      props: { label },
      actionId: "action-open-blacklist-dialog",
    });
  }
  if (label === "导出") {
    return makeNode({
      id: "action-export",
      type: "Button",
      props: { label },
      actionId: "action-export",
    });
  }
  return makeNode({
    id: `action-${label || "unknown"}`,
    type: "Button",
    props: { label: label || "button" },
  });
}

function mapTable(node: DomNode): SchemaNode {
  const columns: Array<{ label: string; prop?: string }> = [];
  const children: SchemaNode[] = [];

  for (const child of node.children ?? []) {
    if (child.role === "columnheader") {
      columns.push({ label: textOf(child) });
      continue;
    }
    const mapped = mapTableChild(child);
    if (mapped) children.push(mapped);
  }

  return makeNode({
    id: "region-table",
    type: "Table",
    props: columns.length > 0 ? { columns } : {},
    children,
  });
}

function mapHeading(node: DomNode): SchemaNode {
  return makeNode({
    id: "region-heading",
    type: "Heading",
    props: { text: textOf(node) },
  });
}

function mapPagination(node: DomNode): SchemaNode {
  return makeNode({
    id: "region-pagination",
    type: "Pagination",
    props: { label: textOf(node) || "pagination" },
    actionId: "action-page-next",
  });
}

function mapDialog(node: DomNode): SchemaNode {
  return makeNode({
    id: "region-dialog-blacklist",
    type: "Dialog",
    props: { title: textOf(node) || "dialog" },
    children: [],
  });
}

function walkRegions(node: DomNode, out: SchemaNode[]): void {
  const tag = tagOf(node);
  const isHeading = node.role === "heading" || tag === "h1" || tag === "h2";
  if (isHeading) {
    out.push(mapHeading(node));
    return;
  }
  if (looksLikeSearch(node)) {
    const mapped = mapSearchForm(node);
    const hasControls = (mapped.children?.length ?? 0) > 0;
    if (hasControls) {
      out.push(mapped);
      return;
    }
    if (looksLikeFormTag(node)) {
      out.push(mapped);
    }
    // Empty / page-sized match: do not return — keep walking so Table is still found.
  } else if (isTableNode(node)) {
    out.push(mapTable(node));
    return;
  } else if (looksLikePagination(node)) {
    out.push(mapPagination(node));
    return;
  } else if (node.role === "dialog") {
    out.push(mapDialog(node));
    return;
  }
  for (const child of node.children ?? []) {
    walkRegions(child, out);
  }
}

/**
 * Build a Page-rooted schema skeleton from a simplified DOM / a11y tree.
 * Region ids are stable (`region-search`, `region-table`, …).
 */
export function buildSkeletonFromDom(dom: unknown): SchemaNode {
  const rootDom: DomNode = isDomNode(dom) ? dom : {};
  const regions: SchemaNode[] = [];
  walkRegions(rootDom, regions);

  // Also scan top-level children if document itself wasn't walked as a region container
  if (regions.length === 0 && Array.isArray(rootDom.children)) {
    for (const child of rootDom.children) {
      walkRegions(child, regions);
    }
  }

  return makeNode({
    id: "root",
    type: "Page",
    props: { name: textOf(rootDom) },
    children: regions,
  });
}

/**
 * One DataSource per unique method + pathname; `urlPattern` is a host-agnostic glob.
 */
export function mapDataSources(network: NetworkEntry[]): DataSource[] {
  const seen = new Map<string, DataSource>();
  for (const entry of network) {
    const pathname = pathnameOfUrl(entry.url);
    const key = `${entry.method.toUpperCase()} ${pathname}`;
    if (seen.has(key)) continue;
    const id = `ds-${entry.method.toLowerCase()}-${pathname.replace(/[^\w]+/g, "-").replace(/^-|-$/g, "")}`;
    seen.set(key, {
      id,
      method: entry.method.toUpperCase(),
      urlPattern: toUrlPattern(pathname),
      networkEntryId: entry.id,
    });
  }
  return [...seen.values()];
}
