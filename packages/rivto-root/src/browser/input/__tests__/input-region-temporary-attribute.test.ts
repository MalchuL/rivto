import type { InputRegion } from "../../../events/types";
import { BrowserInputListeners } from "../browser-input-listeners";

it("restores the captured attribute after detachment and rejects later acquisition", () => {
  const root = document.createElement("div");
  root.dataset.editor = "";
  root.innerHTML = '<div data-owner data-region data-feedback="original"><span></span></div>';
  const element = root.querySelector<HTMLElement>("[data-region]")!;
  const listeners = new BrowserInputListeners();
  let region: InputRegion | undefined;
  listeners.register({ type: "pointerdown", target: "root", capture: false }, (event) => {
    region = event.captureRegion("[data-region]", "[data-owner]", "[data-editor]");
  });
  const detach = listeners.attach(root);
  element.querySelector("span")!.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
  expect(region).toBeDefined();
  const release = region!.setTemporaryAttribute("data-feedback", "temporary");
  expect(element.getAttribute("data-feedback")).toBe("temporary");
  detach();
  release();
  release();
  expect(element.getAttribute("data-feedback")).toBe("original");
  region!.setTemporaryAttribute("data-feedback", "stale")();
  expect(element.getAttribute("data-feedback")).toBe("original");
});

it("restores the previous value when acquisition mutates and then fails", () => {
  const root = document.createElement("div");
  root.dataset.editor = "";
  root.innerHTML = '<div data-owner data-region data-feedback="original"></div>';
  const element = root.querySelector<HTMLElement>("[data-region]")!;
  const listeners = new BrowserInputListeners();
  let region: InputRegion | undefined;
  listeners.register({ type: "pointerdown", target: "root", capture: false }, (event) => {
    region = event.captureRegion("[data-region]", "[data-owner]", "[data-editor]");
  });
  const detach = listeners.attach(root);
  element.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
  const originalSet = element.setAttribute.bind(element);
  const failure = new Error("attribute failed");
  jest.spyOn(element, "setAttribute").mockImplementationOnce((name, value) => {
    originalSet(name, value);
    throw failure;
  });
  expect(() => region!.setTemporaryAttribute("data-feedback", "temporary")).toThrow(failure);
  expect(element.getAttribute("data-feedback")).toBe("original");
  detach();
});
