import type { ActionEntry } from "@sokai/session";

/**
 * Drop noise actions before replay: scrolls, and keydowns without a value.
 * Keeps click / fill / select / navigate (and valued keydowns).
 */
export function filterActions(actions: ActionEntry[]): ActionEntry[] {
  return actions.filter((action) => {
    if (action.type === "scroll") return false;
    if (action.type === "keydown" && (action.value === undefined || action.value === "")) {
      return false;
    }
    return (
      action.type === "click" ||
      action.type === "fill" ||
      action.type === "select" ||
      action.type === "navigate" ||
      action.type === "keydown"
    );
  });
}
