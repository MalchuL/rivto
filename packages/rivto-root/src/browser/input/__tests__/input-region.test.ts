import type { InputRegion, InputTarget } from "../../../events/types";
import { BrowserInputListeners } from "../browser-input-listeners";
import { createBrowserInputRegion } from "../input-region";

it("captures a region and invalidates it after detachment or loss of ownership", () => {
  const root = document.createElement("div");
  root.dataset.editor = "";
  root.innerHTML = "<div data-owner><div data-region><span></span><span></span></div></div>";
  const regionElement = root.querySelector<HTMLElement>("[data-region]")!;
  const [first, second] = root.querySelectorAll("span");
  const listeners = new BrowserInputListeners();
  let region: InputRegion | undefined;
  let related: InputTarget | null = null;
  listeners.register({ type: "pointerover", target: "root", capture: false }, (event) => {
    region = event.captureRegion("[data-region]", "[data-owner]", "[data-editor]");
  });
  listeners.register({ type: "pointerout", target: "root", capture: false }, (event) => {
    related = event.relatedTarget;
  });
  const detach = listeners.attach(root);
  first.dispatchEvent(new MouseEvent("pointerover", { bubbles: true }));
  first.dispatchEvent(new MouseEvent("pointerout", { bubbles: true, relatedTarget: second }));
  expect(region?.containsTarget(related)).toBe(true);
  region?.toggleAttribute("data-feedback", true);
  expect(regionElement.hasAttribute("data-feedback")).toBe(true);
  const previous = region;
  second.dispatchEvent(new MouseEvent("pointerover", { bubbles: true }));
  expect(region?.isSame(previous!)).toBe(true);
  const nested = document.createElement("div");
  nested.dataset.editor = "";
  root.append(nested);
  nested.append(regionElement);
  region?.toggleAttribute("data-feedback", false);
  expect(regionElement.hasAttribute("data-feedback")).toBe(true);
  expect(region?.containsTarget(related)).toBe(false);
  root.querySelector("[data-owner]")!.append(regionElement);
  detach();
  const detachAgain = listeners.attach(root);
  region?.toggleAttribute("data-feedback", false);
  expect(regionElement.hasAttribute("data-feedback")).toBe(true);
  expect(region?.isSame(previous!)).toBe(false);
  detachAgain();
});

it("rejects a region owned by a different block", () => {
  const root = document.createElement("div");
  root.dataset.editor = "";
  root.innerHTML =
    "<div data-owner><div data-region><div data-owner><span></span></div></div></div>";
  const listeners = new BrowserInputListeners();
  const received = jest.fn();
  listeners.register({ type: "pointerover", target: "root", capture: false }, (event) => {
    received(event.captureRegion("[data-region]", "[data-owner]", "[data-editor]"));
  });
  const detach = listeners.attach(root);
  root.querySelector("span")!.dispatchEvent(new MouseEvent("pointerover", { bubbles: true }));
  expect(received).toHaveBeenCalledWith(undefined);
  detach();
});
it("discards an attribute when its region loses ownership during the read", () => {
  const root = document.createElement("div");
  const element = document.createElement("div");
  root.append(element);
  let attached = true;
  const region = createBrowserInputRegion(root, element, () => attached);
  const read = jest.spyOn(element, "getAttribute").mockImplementation(() => {
    attached = false;
    return "stale";
  });
  try {
    expect(region.readAttribute("data-block-id")).toBeUndefined();
  } finally {
    read.mockRestore();
  }
});
