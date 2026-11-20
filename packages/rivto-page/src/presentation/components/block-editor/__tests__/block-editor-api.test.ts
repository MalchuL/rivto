import type { BlockEditorProps } from "../types";

it("exposes presentation attributes without native React input callbacks", () => {
  const hasClass: "className" extends keyof BlockEditorProps ? true : false = true;
  const hasAria: "aria-label" extends keyof BlockEditorProps ? true : false = true;
  const hasClick: "onClick" extends keyof BlockEditorProps ? true : false = false;
  const hasCapture: "onPointerDownCapture" extends keyof BlockEditorProps ? true : false = false;
  expect({ hasClass, hasAria, hasClick, hasCapture }).toEqual({
    hasClass: true,
    hasAria: true,
    hasClick: false,
    hasCapture: false,
  });
});
