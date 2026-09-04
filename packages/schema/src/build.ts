import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  PAGE_SCHEMA_VERSION,
  parsePageSchema,
  readSessionBundle,
  type PageSchema,
} from "@sokai/session";
import { createDefaultLlmClient, enrichWithModel, type LlmClient } from "./llm.js";
import { buildSkeletonFromDom, mapDataSources } from "./rules.js";
import { assertSkeletonHasCriticalRegions } from "./validate-skeleton.js";

export interface BuildPageSchemaOptions {
  llm?: LlmClient;
  /** When true, skip model enrichment entirely. */
  noLlm?: boolean;
}

/**
 * Read a SessionBundle directory and produce a validated PageSchema.
 */
export async function buildPageSchemaFromBundle(
  dir: string,
  opts?: BuildPageSchemaOptions,
): Promise<PageSchema> {
  const bundle = await readSessionBundle(dir);
  const first = bundle.index.keyframes[0];
  if (!first?.domFile) {
    throw new Error(`Session bundle has no DOM snapshot in index: ${dir}`);
  }

  const domRaw = await readFile(join(dir, first.domFile), "utf8");
  const dom = JSON.parse(domRaw) as unknown;
  const root = buildSkeletonFromDom(dom);
  assertSkeletonHasCriticalRegions(root);

  const title =
    (typeof (dom as { name?: unknown }).name === "string" && (dom as { name: string }).name) ||
    bundle.meta.pilotTag ||
    "untitled";

  let schema: PageSchema = {
    schemaVersion: PAGE_SCHEMA_VERSION,
    id: bundle.meta.pilotTag || "page",
    title,
    root,
    dataSources: mapDataSources(bundle.network),
  };

  if (!opts?.noLlm) {
    const llm = opts?.llm ?? createDefaultLlmClient();
    const domText = JSON.stringify(dom);
    schema = await enrichWithModel(schema, { domText, llm });
  }

  return parsePageSchema(schema);
}
