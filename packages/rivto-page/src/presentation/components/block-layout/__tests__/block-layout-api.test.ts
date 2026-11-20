import { createRef, type ComponentPropsWithRef } from "react";
import { BlockRow } from "../block-row";
import { BlockChildren } from "../block-children";
import { BlockItem } from "../block-item";
import { BlockDropWrapper } from "../../../drag-and-drop/block-drop-wrapper";
import type { BlockChildrenProps, BlockRowProps } from "../types";

it("exposes normalized row and child-host input without native callbacks", () => {
  const rowBinding: "bindInput" extends keyof BlockRowProps ? true : false = true;
  const rowClick: "onClick" extends keyof BlockRowProps ? true : false = false;
  const childrenBinding: "bindInput" extends keyof BlockChildrenProps ? true : false = true;
  const childrenCapture: "onPointerDownCapture" extends keyof BlockChildrenProps ? true : false =
    false;
  expect({ rowBinding, rowClick, childrenBinding, childrenCapture }).toEqual({
    rowBinding: true,
    rowClick: false,
    childrenBinding: true,
    childrenCapture: false,
  });
});

it("rejects native element refs for public layout primitives", () => {
  const native = createRef<HTMLDivElement>();
  // @ts-expect-error Rows forward an opaque identity, not an HTML element.
  const row: ComponentPropsWithRef<typeof BlockRow>["ref"] = native;
  // @ts-expect-error Child hosts forward an opaque identity, not an HTML element.
  const children: ComponentPropsWithRef<typeof BlockChildren>["ref"] = native;
  // @ts-expect-error Items forward an opaque identity, not an HTML element.
  const item: ComponentPropsWithRef<typeof BlockItem>["ref"] = native;
  // @ts-expect-error Drop wrappers forward an opaque identity, not an HTML element.
  const wrapper: ComponentPropsWithRef<typeof BlockDropWrapper>["ref"] = native;
  expect([row, children, item, wrapper]).toEqual([native, native, native, native]);
});
