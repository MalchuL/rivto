/**
 * Tests for marquee intersection and group-parent lifting used by selection drag.
 */
import {
  groupParentByChild,
  outermostGroupId,
  rootsInRect,
} from "./edgeless-geometry";

describe("edgeless marquee geometry", () => {
  test("rootsInRect returns overlapping object IDs", () => {
    const hits = [
      { id: "a", rect: { left: 0, top: 0, right: 40, bottom: 40 } },
      { id: "b", rect: { left: 80, top: 0, right: 120, bottom: 40 } },
      { id: "c", rect: { left: 200, top: 200, right: 240, bottom: 240 } },
    ];
    expect(rootsInRect(hits, { left: 20, top: 10, right: 100, bottom: 30 })).toEqual(["a", "b"]);
    expect(rootsInRect(hits, { left: 121, top: 0, right: 150, bottom: 40 })).toEqual([]);
  });

  test("outermostGroupId walks nested groups in O(depth)", () => {
    const parentByChild = groupParentByChild([
      { id: "inner", type: "group", props: { children: ["leaf"] } },
      { id: "outer", type: "group", props: { children: ["inner", "sibling"] } },
      { id: "block", type: "block", props: {} },
    ]);
    expect(parentByChild.get("leaf")).toBe("inner");
    expect(parentByChild.get("inner")).toBe("outer");
    expect(outermostGroupId("leaf", parentByChild)).toBe("outer");
    expect(outermostGroupId("sibling", parentByChild)).toBe("outer");
    expect(outermostGroupId("outer", parentByChild)).toBe("outer");
    expect(outermostGroupId("block", parentByChild)).toBe("block");
  });
});
