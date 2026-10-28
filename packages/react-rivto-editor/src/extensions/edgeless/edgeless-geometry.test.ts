/**
 * Tests for marquee intersection and group-parent lifting used by selection drag.
 */
import { groupParentByChild, outermostGroupId } from "./edgeless-geometry";

describe("edgeless marquee geometry", () => {
  test("outermostGroupId walks nested groups in O(depth)", () => {
    const parentByChild = groupParentByChild([
      { id: "inner", type: "group", childIds: ["leaf"] },
      { id: "outer", type: "group", childIds: ["inner", "sibling"] },
      { id: "block", type: "block", childIds: [] },
    ]);
    expect(parentByChild.get("leaf")).toBe("inner");
    expect(parentByChild.get("inner")).toBe("outer");
    expect(outermostGroupId("leaf", parentByChild)).toBe("outer");
    expect(outermostGroupId("sibling", parentByChild)).toBe("outer");
    expect(outermostGroupId("outer", parentByChild)).toBe("outer");
    expect(outermostGroupId("block", parentByChild)).toBe("block");
  });
});
