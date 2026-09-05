import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent, h, ref } from "vue";
import {
  ActionProvider,
  StateProvider,
  VisibilityProvider,
  useActions,
} from "@json-render/vue";
import { defineHandlers, PILOT_ACTION_IDS, SOKAI_ACTION_ATTR } from "../src/index.js";

type StubRow = {
  rowKey: string;
  combinateMsPoolId: string;
  blacklistOrgUrl: string;
};

describe("compose-pool list shell dialog smoke", () => {
  it("clicking the first 更新 / action-open-blacklist-dialog invokes dialog open", async () => {
    const dialog = { open: vi.fn() };
    const selectedPoolId = ref("");
    const rows: StubRow[] = [
      { rowKey: "r1", combinateMsPoolId: "pool-1", blacklistOrgUrl: "https://example.test/a" },
      { rowKey: "r2", combinateMsPoolId: "pool-2", blacklistOrgUrl: "https://example.test/b" },
    ];

    function openBlacklistUploadDialog(row: StubRow): void {
      selectedPoolId.value = row.combinateMsPoolId;
      dialog.open();
    }

    const handlers = defineHandlers({
      [PILOT_ACTION_IDS.openBlacklistDialog]: ((row: StubRow) =>
        openBlacklistUploadDialog(row)) as (...args: never[]) => unknown,
    });

    const RowActions = defineComponent({
      setup() {
        const { execute } = useActions();
        return () =>
          h(
            "div",
            { "data-sokai-region": "region-table" },
            rows.map((row) =>
              h(
                "button",
                {
                  [SOKAI_ACTION_ATTR]: PILOT_ACTION_IDS.openBlacklistDialog,
                  onClick: () =>
                    void execute({
                      action: PILOT_ACTION_IDS.openBlacklistDialog,
                      params: { ...row },
                    }),
                },
                "更新",
              ),
            ),
          );
      },
    });

    const Host = defineComponent({
      setup() {
        return () =>
          h(StateProvider, { initialState: {} }, () =>
            h(VisibilityProvider, null, () =>
              h(ActionProvider, { handlers: handlers as never }, () => h(RowActions)),
            ),
          );
      },
    });

    const wrapper = mount(Host);
    const updates = wrapper.findAll(
      `[${SOKAI_ACTION_ATTR}="${PILOT_ACTION_IDS.openBlacklistDialog}"]`,
    );
    expect(updates).toHaveLength(2);
    await updates[0]!.trigger("click");
    expect(dialog.open).toHaveBeenCalledTimes(1);
    expect(selectedPoolId.value).toBe("pool-1");
  });
});
