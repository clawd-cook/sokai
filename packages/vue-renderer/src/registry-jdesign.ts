import { defineComponent, h } from "vue";
import { defineRegistry, useActions } from "@json-render/vue";
import { JdButton, JdLink } from "@jd/jdesign-vue";
import { JdProSearchForm } from "@jd/jdesign-vue-pro";
import { sokaiActionAttrs, sokaiRegionAttrs } from "./attrs.js";
import { sokaiPilotCatalog } from "./catalog.js";
import { renderUnknownPlaceholder } from "./unknown.js";

const JdesignActionControl = defineComponent({
  name: "SokaiJdesignActionControl",
  props: {
    actionId: { type: String, required: true },
    label: { type: String, required: true },
    asLink: { type: Boolean, default: false },
  },
  setup(props) {
    const { execute } = useActions();
    return () => {
      const onClick = (event: Event) => {
        if (props.asLink) event.preventDefault();
        void execute({ action: props.actionId });
      };
      if (props.asLink) {
        return h(
          JdLink,
          {
            href: "#",
            type: "primary",
            ...sokaiActionAttrs(props.actionId),
            onClick,
          },
          () => props.label,
        );
      }
      return h(
        JdButton,
        {
          ...sokaiActionAttrs(props.actionId),
          onClick,
        },
        () => props.label,
      );
    };
  },
});

function actionControl(actionId: string, label: string, asLink = false) {
  return h(JdesignActionControl, { actionId, label, asLink });
}

export function createJdesignRegistry() {
  return defineRegistry(sokaiPilotCatalog, {
    components: {
      Page: ({ children }) => h("div", { class: "sokai-page" }, children),
      Heading: ({ props }) => h("h2", null, props.text),
      SearchForm: ({ props }) =>
        h("div", { class: "sokai-search-form", ...sokaiRegionAttrs(props.regionId) }, [
          h(
            JdProSearchForm,
            { rules: [], modelValue: {} },
            {
              "actions-append": () => [
                actionControl(props.searchActionId, "Search"),
                actionControl(props.resetActionId, "Reset"),
              ],
            },
          ),
        ]),
      Table: ({ props }) =>
        h("div", { class: "sokai-table", ...sokaiRegionAttrs(props.regionId) }, [
          actionControl(props.exportActionId, "Export"),
          actionControl(props.updateActionId, "Update"),
        ]),
      Pagination: ({ props }) =>
        h("div", { class: "sokai-pagination", ...sokaiRegionAttrs(props.regionId) }, [
          actionControl(props.nextActionId, "Next"),
        ]),
      Button: ({ props }) => actionControl(props.actionId, props.label),
      Link: ({ props }) => actionControl(props.actionId, props.label, true),
      Unknown: ({ props }) => renderUnknownPlaceholder(props.typeName),
    },
  });
}
