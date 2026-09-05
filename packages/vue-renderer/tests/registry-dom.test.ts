import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent, h } from "vue";
import {
  ActionProvider,
  Renderer,
  StateProvider,
  VisibilityProvider,
} from "@json-render/vue";
import { createDomRegistry } from "../src/registry-dom.js";
import { SOKAI_ACTION_ATTR, SOKAI_REGION_ATTR } from "../src/attrs.js";
import mini from "./fixtures/compose-pool-mini.spec.json";

describe("createDomRegistry", () => {
  it("renders regions and action hooks from mini spec", async () => {
    const { registry } = createDomRegistry();
    const search = vi.fn();
    const Host = defineComponent({
      setup() {
        return () =>
          h(StateProvider, { initialState: {} }, () =>
            h(VisibilityProvider, null, () =>
              h(
                ActionProvider,
                {
                  handlers: {
                    "action-search": search,
                  },
                },
                () => h(Renderer, { spec: mini, registry }),
              ),
            ),
          );
      },
    });
    const wrapper = mount(Host);
    expect(wrapper.find(`[${SOKAI_REGION_ATTR}="region-search"]`).exists()).toBe(true);
    expect(wrapper.find(`[${SOKAI_REGION_ATTR}="region-table"]`).exists()).toBe(true);
    const btn = wrapper.find(`[${SOKAI_ACTION_ATTR}="action-search"]`);
    expect(btn.exists()).toBe(true);
    await btn.trigger("click");
    expect(search).toHaveBeenCalled();
  });

  it("unknown type shows placeholder instead of throwing", () => {
    const { registry } = createDomRegistry();
    const bad = {
      root: "x",
      elements: { x: { type: "Unknown", props: { typeName: "NotARealType" } } },
    };
    const Host = defineComponent({
      setup() {
        return () =>
          h(StateProvider, { initialState: {} }, () =>
            h(VisibilityProvider, null, () =>
              h(ActionProvider, { handlers: {} }, () =>
                h(Renderer, { spec: bad, registry }),
              ),
            ),
          );
      },
    });
    const wrapper = mount(Host);
    expect(wrapper.find("[data-sokai-unknown='1']").exists()).toBe(true);
  });
});
