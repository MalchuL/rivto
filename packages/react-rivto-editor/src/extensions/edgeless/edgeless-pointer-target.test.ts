import { resolveEdgelessPointerTarget } from "./edgeless-pointer-target";

test.each([
  [{ elementId: "child", primary: false }, "child"],
  [{ elementId: "child", parentId: "group", primary: false }, "group"],
  [{ elementId: "child", parentId: "group", selectedId: "other", primary: false }, "group"],
  [{ elementId: "child", parentId: "group", selectedId: "group", primary: false }, "child"],
  [
    {
      elementId: "child",
      parentId: "group",
      selectedId: "sibling",
      selectedParentId: "group",
      primary: false,
    },
    "child",
  ],
  [{ elementId: "child", parentId: "group", selectedId: "child", primary: false }, "child"],
  [{ elementId: "child", parentId: "group", primary: true }, "child"],
] as const)("resolves a canvas pointer to the expected group or child", (target, expected) => {
  expect(resolveEdgelessPointerTarget(target)).toBe(expected);
});
