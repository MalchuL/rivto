import type { BlockItemProps } from "../types";

it("exposes normalized item input without native React event props", () => {
  const hasBinding: "bindInput" extends keyof BlockItemProps ? true : false = true;
  const hasNativeClick: "onClick" extends keyof BlockItemProps ? true : false = false;
  const hasNativePointer: "onPointerDownCapture" extends keyof BlockItemProps ? true : false =
    false;
  expect({ hasBinding, hasNativeClick, hasNativePointer }).toEqual({
    hasBinding: true,
    hasNativeClick: false,
    hasNativePointer: false,
  });
});
