import { createRef, type ComponentPropsWithRef, type ComponentRef } from "react";
import type { BlockView } from "../block-view";
import type { BlockViewProps } from "../types";

it("exposes an opaque shell identity and normalized input without native callbacks", () => {
  const hasBinding: "bindInput" extends keyof BlockViewProps ? true : false = true;
  const hasClick: "onClick" extends keyof BlockViewProps ? true : false = false;
  const hasPointer: "onPointerDownCapture" extends keyof BlockViewProps ? true : false = false;
  const exposesTag: "tagName" extends keyof ComponentRef<typeof BlockView> ? true : false = false;
  expect({ hasBinding, hasClick, hasPointer, exposesTag }).toEqual({
    hasBinding: true,
    hasClick: false,
    hasPointer: false,
    exposesTag: false,
  });
});

it("rejects a native element ref at the public shell boundary", () => {
  const nativeRef = createRef<HTMLDivElement>();
  // @ts-expect-error The shell provides an opaque identity, not an HTML element.
  const invalidRef: ComponentPropsWithRef<typeof BlockView>["ref"] = nativeRef;
  expect(invalidRef).toBe(nativeRef);
});
