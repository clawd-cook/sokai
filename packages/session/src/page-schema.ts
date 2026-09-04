import { writeFile } from "node:fs/promises";
import { z } from "zod";
import { PAGE_SCHEMA_VERSION } from "./types.js";
import type { PageSchema } from "./types.js";

const schemaNodeType = z.enum([
  "Page",
  "Heading",
  "SearchForm",
  "Field",
  "Table",
  "Pagination",
  "Dialog",
  "Button",
  "Unknown",
]);

type SchemaNodeInput = {
  id: string;
  type: z.infer<typeof schemaNodeType>;
  props: Record<string, unknown>;
  children?: SchemaNodeInput[];
  actionId?: string;
  provenance: "rule" | "model";
};

const schemaNode: z.ZodType<SchemaNodeInput> = z.lazy(() =>
  z.object({
    id: z.string(),
    type: schemaNodeType,
    props: z.record(z.string(), z.unknown()),
    children: z.array(schemaNode).optional(),
    actionId: z.string().optional(),
    provenance: z.enum(["rule", "model"]),
  }),
);

const pageSchemaSchema = z.object({
  schemaVersion: z.number(),
  id: z.string(),
  title: z.string(),
  root: schemaNode,
  dataSources: z.array(
    z.object({
      id: z.string(),
      method: z.string(),
      urlPattern: z.string(),
      networkEntryId: z.string().optional(),
    }),
  ),
  partial: z.boolean().optional(),
});

export function parsePageSchema(data: unknown): PageSchema {
  return pageSchemaSchema.parse(data) as PageSchema;
}

export async function writePageSchema(path: string, schema: PageSchema): Promise<void> {
  const normalized: PageSchema = {
    ...schema,
    schemaVersion: schema.schemaVersion ?? PAGE_SCHEMA_VERSION,
  };
  await writeFile(path, JSON.stringify(normalized, null, 2) + "\n", "utf8");
}
