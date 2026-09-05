import { defineComponent, h } from "vue";
import { defineRegistry, useActions } from "@json-render/vue";
import { sokaiActionAttrs, sokaiRegionAttrs } from "./attrs.js";
import { sokaiPilotCatalog } from "./catalog.js";
import { renderUnknownPlaceholder } from "./unknown.js";

const DomActionControl = defineComponent({
  name: "SokaiDomActionControl",
  props: {
    actionId: { type: String, required: true },
    label: { type: String, required: true },
    tag: { type: String, default: "button" },
  },
  setup(props) {
    const { execute } = useActions();
    return () =>
      h(
        props.tag,
        {
          type: props.tag === "button" ? "button" : undefined,
          href: props.tag === "a" ? "#" : undefined,
          ...sokaiActionAttrs(props.actionId),
          onClick: (event: Event) => {
            if (props.tag === "a") event.preventDefault();
            void execute({ action: props.actionId });
          },
        },
        props.label,
      );
  },
});

function actionControl(actionId: string, label: string, tag = "button") {
  return h(DomActionControl, { actionId, label, tag });
}

export function createDomRegistry() {
  return defineRegistry(sokaiPilotCatalog, {
    components: {
      Page: ({ children }) => h("div", null, children),
      Heading: ({ props }) => h("h1", null, props.text),
      SearchForm: ({ props }) =>
        h("div", { ...sokaiRegionAttrs(props.regionId) }, [
          actionControl(props.searchActionId, "Search"),
          actionControl(props.resetActionId, "Reset"),
        ]),
      Table: ({ props }) =>
        h("div", { ...sokaiRegionAttrs(props.regionId) }, [
          actionControl(props.exportActionId, "Export"),
          actionControl(props.updateActionId, "Update"),
        ]),
      Pagination: ({ props }) =>
        h("div", { ...sokaiRegionAttrs(props.regionId) }, [
          actionControl(props.nextActionId, "Next"),
        ]),
      Button: ({ props }) => actionControl(props.actionId, props.label),
      Link: ({ props }) => actionControl(props.actionId, props.label, "a"),
      Unknown: ({ props }) => renderUnknownPlaceholder(props.typeName),
    },
  });
}
