const KEPT_ATTR = /^(id|name|type|data-testid)$|^aria-/i;

function filterAttrs(attrs: unknown): Record<string, string> | undefined {
  if (attrs === null || typeof attrs !== "object" || Array.isArray(attrs)) {
    return undefined;
  }
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(attrs as Record<string, unknown>)) {
    if (!KEPT_ATTR.test(key)) continue;
    if (typeof value === "string") {
      out[key] = value;
    } else if (value != null) {
      out[key] = String(value);
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Strip scripts, limit tree depth, and keep a stable attr subset for session DOM snapshots.
 */
export function simplifyDom(node: unknown, depth = 12): unknown {
  if (depth <= 0) {
    return { truncated: true };
  }
  if (node === null || typeof node !== "object") {
    return node;
  }
  if (Array.isArray(node)) {
    return node
      .map((child) => simplifyDom(child, depth))
      .filter((child) => child !== null && child !== undefined);
  }

  const obj = node as Record<string, unknown>;
  if (obj.tag === "script") {
    return null;
  }

  const out: Record<string, unknown> = {};
  if (obj.role !== undefined) out.role = obj.role;
  if (obj.name !== undefined) out.name = obj.name;
  if (obj.tag !== undefined) out.tag = obj.tag;

  const attrs = filterAttrs(obj.attrs);
  if (attrs) out.attrs = attrs;

  if (Array.isArray(obj.children)) {
    const children = obj.children
      .map((child) => simplifyDom(child, depth - 1))
      .filter((child) => child !== null && child !== undefined);
    if (children.length > 0) out.children = children;
  }

  return out;
}
