import { createBrowserInputRegion } from "../input-region";
import type { InputRegion } from "../../../events/types";

const ordinaryRegionExcludesFocus: "focus" extends keyof InputRegion ? false : true = true;

it("focuses only the active HTML region without scrolling", () => {
  const root = document.createElement("div");
  const target = document.createElement("button");
  root.append(target);
  document.body.append(root);
  let attached = true;
  const region = createBrowserInputRegion(root, target, () => attached);
  const focus = jest.spyOn(target, "focus");
  try {
    expect(ordinaryRegionExcludesFocus).toBe(true);
    region.focus();
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(document.activeElement).toBe(target);
    focus.mockClear();
    attached = false;
    region.focus();
    expect(focus).not.toHaveBeenCalled();
  } finally {
    focus.mockRestore();
    root.remove();
  }
});

it("does not focus a region moved outside its attachment", () => {
  const root = document.createElement("div");
  const target = document.createElement("button");
  root.append(target);
  const region = createBrowserInputRegion(root, target, () => true);
  const focus = jest.spyOn(target, "focus");
  try {
    target.remove();
    region.focus();
    expect(focus).not.toHaveBeenCalled();
  } finally {
    focus.mockRestore();
  }
});
