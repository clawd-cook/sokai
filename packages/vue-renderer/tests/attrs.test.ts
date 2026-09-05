import { describe, expect, it } from "vitest";
import {
  PILOT_ACTION_IDS,
  PILOT_REGION_IDS,
  SOKAI_ACTION_ATTR,
  SOKAI_REGION_ATTR,
  sokaiActionAttrs,
  sokaiRegionAttrs,
} from "../src/attrs.js";

describe("sokai attrs", () => {
  it("builds action and region data attributes", () => {
    expect(sokaiActionAttrs(PILOT_ACTION_IDS.search)).toEqual({
      [SOKAI_ACTION_ATTR]: "action-search",
    });
    expect(sokaiRegionAttrs(PILOT_REGION_IDS.table)).toEqual({
      [SOKAI_REGION_ATTR]: "region-table",
    });
  });
});
