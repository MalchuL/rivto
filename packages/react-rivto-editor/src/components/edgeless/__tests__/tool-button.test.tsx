/** @jest-environment ./jest-browser-environment.mjs */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { EdgelessToolButton } from "../tool-button";
import type { EdgelessToolButtonProps } from "../types";

it("delivers toolbar activation without a browser event or a host ref", () => {
  const nativeProps: Extract<
    keyof EdgelessToolButtonProps,
    "onClick" | "onPointerDown" | "ref"
  > extends never
    ? true
    : false = true;
  expect(nativeProps).toBe(true);
  const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previous = environment.IS_REACT_ACT_ENVIRONMENT;
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div");
  const view = createRoot(container);
  const calls: unknown[][] = [];
  try {
    act(() =>
      view.render(<EdgelessToolButton label="Group" onActivate={(...args) => calls.push(args)} />),
    );
    container.querySelector("button")!.click();
    expect(calls).toEqual([[]]);
  } finally {
    act(() => view.unmount());
    environment.IS_REACT_ACT_ENVIRONMENT = previous;
  }
});
