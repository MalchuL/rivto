import type { InputTarget } from "../../../events/types";
import { BrowserInputListeners } from "../browser-input-listeners";
import { createBrowserInputRegion } from "../input-region";

it("discards an ancestor attribute when its region is detached during the read", () => {
  const root = document.createElement("div");
  root.innerHTML = '<div><span data-id="original"></span></div>';
  const regionElement = root.firstElementChild!;
  const targetElement = regionElement.firstElementChild!;
  let attached = true;
  const region = createBrowserInputRegion(root, regionElement, () => attached);
  const listeners = new BrowserInputListeners();
  let target: InputTarget | null = null;
  listeners.register({ type: "pointerdown", target: "root", capture: false }, (event) => {
    target = event.target;
  });
  const detach = listeners.attach(root);
  targetElement.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
  const read = jest.spyOn(targetElement, "getAttribute").mockImplementation(() => {
    attached = false;
    return "stale";
  });
  try {
    expect(region.ancestorAttribute(target, "[data-id]", "data-id")).toBeUndefined();
  } finally {
    read.mockRestore();
    detach();
  }
});

it("discards an ancestor attribute when its target moves outside the region during the read", () => {
  const root = document.createElement("div");
  root.innerHTML = '<div><span data-id="original"></span></div>';
  const regionElement = root.firstElementChild!;
  const targetElement = regionElement.firstElementChild!;
  const region = createBrowserInputRegion(root, regionElement, () => true);
  const listeners = new BrowserInputListeners();
  let target: InputTarget | null = null;
  listeners.register({ type: "pointerdown", target: "root", capture: false }, (event) => {
    target = event.target;
  });
  const detach = listeners.attach(root);
  targetElement.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
  const read = jest.spyOn(targetElement, "getAttribute").mockImplementation(() => {
    root.append(targetElement);
    return "stale";
  });
  try {
    expect(region.ancestorAttribute(target, "[data-id]", "data-id")).toBeUndefined();
  } finally {
    read.mockRestore();
    detach();
  }
});
