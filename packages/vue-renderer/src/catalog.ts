import { defineCatalog } from "@json-render/core";
import { schema } from "@json-render/vue/schema";
import { z } from "zod";

export const sokaiPilotCatalog = defineCatalog(schema, {
  components: {
    Page: {
      props: z.object({}),
      slots: ["default"],
      description: "Page root that renders default children",
    },
    Heading: {
      props: z.object({
        text: z.string(),
      }),
      description: "Heading text",
    },
    SearchForm: {
      props: z.object({
        regionId: z.string(),
        searchActionId: z.string(),
        resetActionId: z.string(),
      }),
      description: "Search region with search and reset actions",
    },
    Table: {
      props: z.object({
        regionId: z.string(),
        exportActionId: z.string(),
        updateActionId: z.string(),
      }),
      description: "Table region with export and update actions",
    },
    Pagination: {
      props: z.object({
        regionId: z.string(),
        nextActionId: z.string(),
      }),
      description: "Pagination region with next action",
    },
    Button: {
      props: z.object({
        label: z.string(),
        actionId: z.string(),
      }),
      description: "Button that dispatches an action",
    },
    Link: {
      props: z.object({
        label: z.string(),
        actionId: z.string(),
      }),
      description: "Link that dispatches an action",
    },
    Unknown: {
      props: z.object({
        typeName: z.string().optional(),
      }),
      description: "Visible placeholder for unknown or unmapped types",
    },
  },
});
