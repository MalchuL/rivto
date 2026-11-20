import type { BlockSlotPlacementProps } from "../types";

it("exposes normalized slot input without native React event callbacks", () => {
  const hasBinding: "bindInput" extends keyof BlockSlotPlacementProps ? true : false = true;
  const hasStyle: "style" extends keyof BlockSlotPlacementProps ? true : false = true;
  const hasClick: "onClick" extends keyof BlockSlotPlacementProps ? true : false = false;
  const hasCapture: "onPointerDownCapture" extends keyof BlockSlotPlacementProps ? true : false =
    false;
  expect({ hasBinding, hasStyle, hasClick, hasCapture }).toEqual({
    hasBinding: true,
    hasStyle: true,
    hasClick: false,
    hasCapture: false,
  });
});
