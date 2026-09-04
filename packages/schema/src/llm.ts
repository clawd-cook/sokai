import type { PageSchema, SchemaNode } from "@sokai/session";

export interface LlmClient {
  completeJson(prompt: string): Promise<unknown>;
}

interface ModelPatch {
  id: string;
  props: Record<string, unknown>;
}

function collectIds(node: SchemaNode, ids: Set<string>): void {
  ids.add(node.id);
  for (const child of node.children ?? []) {
    collectIds(child, ids);
  }
}

function applyPatches(node: SchemaNode, patches: Map<string, Record<string, unknown>>): SchemaNode {
  const patch = patches.get(node.id);
  const next: SchemaNode = {
    ...node,
    props: patch ? { ...node.props, ...patch } : { ...node.props },
    provenance: patch ? "model" : node.provenance,
    children: node.children?.map((child) => applyPatches(child, patches)),
  };
  return next;
}

type ParsePatchesResult =
  | { ok: true; patches: ModelPatch[] }
  | { ok: false };

/**
 * Accept only `{ patches: unknown[] }`. Soft-invalid envelopes
 * (`null`, non-object, missing/non-array `patches`) are failures.
 */
function parsePatchesResponse(raw: unknown): ParsePatchesResult {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false };
  }
  if (!Object.prototype.hasOwnProperty.call(raw, "patches")) {
    return { ok: false };
  }
  const patches = (raw as { patches: unknown }).patches;
  if (!Array.isArray(patches)) {
    return { ok: false };
  }
  const out: ModelPatch[] = [];
  for (const item of patches) {
    if (typeof item !== "object" || item === null) continue;
    const id = (item as { id?: unknown }).id;
    const props = (item as { props?: unknown }).props;
    if (typeof id !== "string" || typeof props !== "object" || props === null || Array.isArray(props)) {
      continue;
    }
    out.push({ id, props: props as Record<string, unknown> });
  }
  return { ok: true, patches: out };
}

function buildEnrichPrompt(skeleton: PageSchema, domText: string): string {
  return [
    "You enrich an existing PageSchema skeleton.",
    "Return JSON only: { \"patches\": [ { \"id\": string, \"props\": object } ] }.",
    "Only patch existing node ids. Do not add/remove nodes or rename ids.",
    "Focus on labels, column titles, and field semantics.",
    "",
    "DOM text:",
    domText,
    "",
    "Skeleton JSON:",
    JSON.stringify(skeleton),
  ].join("\n");
}

/**
 * Merge model-suggested props into existing skeleton nodes only.
 * On LLM throw or soft-invalid JSON, returns the skeleton with `partial: true`.
 */
export async function enrichWithModel(
  skeleton: PageSchema,
  ctx: { domText: string; llm: LlmClient },
): Promise<PageSchema> {
  try {
    const raw = await ctx.llm.completeJson(buildEnrichPrompt(skeleton, ctx.domText));
    const parsed = parsePatchesResponse(raw);
    if (!parsed.ok) {
      return {
        ...skeleton,
        partial: true,
      };
    }

    const knownIds = new Set<string>();
    collectIds(skeleton.root, knownIds);

    const allowed = new Map<string, Record<string, unknown>>();
    for (const patch of parsed.patches) {
      if (!knownIds.has(patch.id)) continue;
      allowed.set(patch.id, patch.props);
    }

    return {
      ...skeleton,
      root: applyPatches(skeleton.root, allowed),
      partial: skeleton.partial ?? false,
    };
  } catch {
    return {
      ...skeleton,
      partial: true,
    };
  }
}

/**
 * Default LLM client for CLI use. Throws unless `SOKAI_LLM=fake|openai`
 * (real providers wired later); missing provider forces partial enrichment.
 */
export function createDefaultLlmClient(): LlmClient {
  const mode = process.env.SOKAI_LLM?.trim().toLowerCase();
  if (mode === "fake") {
    return {
      async completeJson() {
        return { patches: [] };
      },
    };
  }
  if (mode === "openai") {
    return {
      async completeJson() {
        throw new Error("SOKAI_LLM=openai is not wired yet");
      },
    };
  }
  return {
    async completeJson() {
      throw new Error("No LLM configured (set SOKAI_LLM=fake|openai)");
    },
  };
}
