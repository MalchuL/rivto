import type { ComponentProps } from "react";
import { DragHandle } from "../drag-handle";
import type { DragHandleProps } from "../types";

it("exposes handle actions without native React input callbacks", () => {
  const hasBinding: "bindHandle" extends keyof DragHandleProps ? true : false = true;
  const hasOpen: "onOpen" extends keyof DragHandleProps ? true : false = true;
  const hasMenu: "onMenu" extends keyof DragHandleProps ? true : false = true;
  const hasAria: "aria-label" extends keyof DragHandleProps ? true : false = true;
  const hasKeyUp: "onKeyUp" extends keyof DragHandleProps ? true : false = false;
  const hasRef: "ref" extends keyof ComponentProps<typeof DragHandle> ? true : false = false;
  const hasPointerEnter: "onPointerEnter" extends keyof DragHandleProps ? true : false = false;
  expect({ hasOpen, hasMenu, hasAria, hasKeyUp, hasPointerEnter, hasRef, hasBinding }).toEqual({
    hasOpen: true,
    hasMenu: true,
    hasAria: true,
    hasKeyUp: false,
    hasPointerEnter: false,
    hasRef: false,
    hasBinding: true,
  });
});
