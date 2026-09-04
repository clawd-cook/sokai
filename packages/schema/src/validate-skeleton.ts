import type { SchemaNode } from "@sokai/session";

function hasType(node: SchemaNode, type: SchemaNode["type"]): boolean {
  if (node.type === type) return true;
  return (node.children ?? []).some((child) => hasType(child, type));
}

/**
 * Hard-fail when SearchForm or Table regions are missing from the skeleton.
 */
export function assertSkeletonHasCriticalRegions(root: SchemaNode): void {
  if (!hasType(root, "SearchForm")) {
    throw new Error("Skeleton missing critical region: SearchForm (search)");
  }
  if (!hasType(root, "Table")) {
    throw new Error("Skeleton missing critical region: Table (table)");
  }
}
