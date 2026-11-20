/** @jest-environment jsdom */
import { BrowserInputListeners } from "../browser-input-listeners";
import { createBrowserInputRegion } from "../input-region";

it("normalizes mouse input and resolves only element ancestors inside the mounted region", () => {
  const root = document.createElement("div");
  root.innerHTML =
    '<div data-item="outer"><div data-plane><div data-item="inside"><span>text</span></div></div></div><div data-item="outside"></div>';
  const plane = root.querySelector<HTMLElement>("[data-plane]")!;
  const inside = root.querySelector<HTMLElement>("[data-item=inside] span")!;
  const outer = root.querySelector<HTMLElement>("[data-item=outer]")!;
  const outside = root.querySelector<HTMLElement>("[data-item=outside]")!;
  let attached = true;
  const region = createBrowserInputRegion(root, plane, () => attached);
  expect(region).not.toHaveProperty("state");
  expect(region).not.toHaveProperty("root");
  expect(region).not.toHaveProperty("element");
  const values: Array<string | undefined> = [];
  const buttons: number[] = [];
  const listeners = new BrowserInputListeners();
  listeners.register({ type: "mousedown", target: "root", capture: false }, (event) => {
    buttons.push(event.button);
    values.push(region.ancestorAttribute(event.target, "[data-item]", "data-item"));
  });
  const detach = listeners.attach(root);
  try {
    inside.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 2 }));
    inside.firstChild!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    plane.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    outside.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    attached = false;
    inside.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(values).toEqual(["inside", undefined, undefined, undefined, undefined]);
    expect(buttons[0]).toBe(2);
    expect(outer.contains(plane)).toBe(true);
  } finally {
    detach();
  }
});

it("rejects a region outside its mounted root", () => {
  expect(() =>
    createBrowserInputRegion(
      document.createElement("div"),
      document.createElement("div"),
      () => true,
    ),
  ).toThrow("Input region must belong to its root");
});
