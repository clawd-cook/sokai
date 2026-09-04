import { createApp, h, provide, ref, type App } from "vue";
import type { NetworkEntry, PageSchema } from "@sokai/session";
import SchemaRenderer from "./components/SchemaRenderer.vue";
import { installMockFetch } from "./mock.js";

export interface MountPreviewOptions {
  network?: NetworkEntry[];
  mock?: boolean;
}

export interface MountPreviewHandle {
  unmount(): void;
}

/**
 * Mount a Vue preview of `schema` into `el`.
 * When `mock !== false` and `network` is provided, installs mock fetch from schema dataSources.
 */
export function mountPreview(
  el: HTMLElement,
  schema: PageSchema,
  opts?: MountPreviewOptions,
): MountPreviewHandle {
  let restoreMock: (() => void) | undefined;

  if (opts?.mock !== false && opts?.network) {
    restoreMock = installMockFetch(schema.dataSources, opts.network);
  }

  const app: App = createApp({
    setup() {
      const dialogOpen = ref(false);
      provide("sokaiDialogOpen", dialogOpen);
      provide("sokaiSchema", schema);
      return () =>
        h("div", { class: "sokai-preview-root" }, [
          h("h1", { class: "sokai-preview-title" }, schema.title),
          h(SchemaRenderer, { node: schema.root }),
        ]);
    },
  });

  app.mount(el);

  return {
    unmount() {
      app.unmount();
      restoreMock?.();
    },
  };
}
