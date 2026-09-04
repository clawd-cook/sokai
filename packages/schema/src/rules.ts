import type { DataSource, NetworkEntry, SchemaNode } from "@sokai/session";

interface DomNode {
  role?: string;
  name?: string;
  tag?: string;
  attrs?: Record<string, string>;
  children?: DomNode[];
}

function isDomNode(value: unknown): value is DomNode {
  return typeof value === "object" && value !== null;
}

function textOf(node: DomNode): string {
  return (node.name ?? "").trim();
}

function attrsOf(node: DomNode): Record<string, string> {
  return node.attrs ?? {};
}

function looksLikeSearch(node: DomNode): boolean {
  if (node.role === "form") return true;
  const name = textOf(node).toLowerCase();
  if (name.includes("search") || name.includes("搜索")) return true;
  const attrs = attrsOf(node);
  const hay = `${attrs["aria-label"] ?? ""} ${attrs.name ?? ""} ${attrs.id ?? ""}`.toLowerCase();
  return hay.includes("search") || hay.includes("搜索");
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

function mapSearchForm(node: DomNode): SchemaNode {
  const children: SchemaNode[] = [];
  let fieldIndex = 0;
  for (const child of node.children ?? []) {
    if (child.role === "textbox" || child.tag === "input") {
      children.push(mapField(child, fieldIndex++));
      continue;
    }
    if (child.role === "button" || child.tag === "button") {
      const button = mapSearchButton(child);
      if (button) children.push(button);
    }
  }
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
  const tag = (node.tag ?? "").toLowerCase();
  const isHeading = node.role === "heading" || tag === "h1" || tag === "h2";
  if (isHeading) {
    out.push(mapHeading(node));
    return;
  }
  if (looksLikeSearch(node)) {
    out.push(mapSearchForm(node));
    return;
  }
  if (node.role === "table" || tag === "table") {
    out.push(mapTable(node));
    return;
  }
  if (looksLikePagination(node)) {
    out.push(mapPagination(node));
    return;
  }
  if (node.role === "dialog") {
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

function pathnameOf(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    const path = url.split("?")[0] ?? url;
    return path.startsWith("/") ? path : `/${path}`;
  }
}

/**
 * One DataSource per unique method + pathname; `urlPattern` is the pathname (glob-ready).
 */
export function mapDataSources(network: NetworkEntry[]): DataSource[] {
  const seen = new Map<string, DataSource>();
  for (const entry of network) {
    const pathname = pathnameOf(entry.url);
    const key = `${entry.method.toUpperCase()} ${pathname}`;
    if (seen.has(key)) continue;
    const id = `ds-${entry.method.toLowerCase()}-${pathname.replace(/[^\w]+/g, "-").replace(/^-|-$/g, "")}`;
    seen.set(key, {
      id,
      method: entry.method.toUpperCase(),
      urlPattern: pathname,
      networkEntryId: entry.id,
    });
  }
  return [...seen.values()];
}
