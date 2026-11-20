import { BrowserInputListeners } from "../browser-input-listeners";

it("captures the matching owned target and protects a replacement capture", () => {
  const root = document.createElement("div");
  const button = document.createElement("button");
  const text = document.createTextNode("preset");
  button.dataset.preset = "";
  button.append(text);
  root.append(button);
  button.setPointerCapture = jest.fn();
  button.hasPointerCapture = jest.fn(() => true);
  button.releasePointerCapture = jest.fn();
  const listeners = new BrowserInputListeners();
  const releases: Array<() => void> = [];
  const retained: Array<() => (() => void) | undefined> = [];
  listeners.register({ type: "pointerdown", target: "root", capture: false }, (input) => {
    retained.push(() => input.captureTargetPointer("[data-preset]"));
    expect(input.captureTargetPointer("[data-missing]")).toBeUndefined();
    const release = input.captureTargetPointer("[data-preset]");
    if (release) {
      releases.push(release);
    }
  });
  /**
   * Sends a pointer-down from the text node inside the matching button.
   *
   * @returns The active listener has received the sample.
   */
  function dispatch() {
    const event = new Event("pointerdown", { bubbles: true });
    Object.defineProperty(event, "pointerId", { value: 7 });
    text.dispatchEvent(event);
  }
  const first = listeners.attach(root);
  dispatch();
  first();
  expect(retained[0]()).toBeUndefined();
  const second = listeners.attach(root);
  dispatch();
  releases[0]();
  expect(button.releasePointerCapture).not.toHaveBeenCalled();
  second();
  releases[1]();
  releases[1]();
  expect(button.setPointerCapture).toHaveBeenCalledTimes(2);
  expect(button.releasePointerCapture).toHaveBeenCalledTimes(1);
  expect(button.releasePointerCapture).toHaveBeenCalledWith(7);
});

it("does not capture a matching target outside the input root", () => {
  const root = document.createElement("div");
  const outside = document.createElement("button");
  outside.dataset.preset = "";
  outside.setPointerCapture = jest.fn();
  document.body.append(root, outside);
  const listeners = new BrowserInputListeners();
  let result: (() => void) | undefined;
  listeners.register({ type: "pointerdown", target: "window", capture: true }, (input) => {
    result = input.captureTargetPointer("[data-preset]");
  });
  const detach = listeners.attach(root);
  try {
    const event = new Event("pointerdown", { bubbles: true });
    Object.defineProperty(event, "pointerId", { value: 7 });
    outside.dispatchEvent(event);
    expect(result).toBeUndefined();
    expect(outside.setPointerCapture).not.toHaveBeenCalled();
  } finally {
    detach();
    root.remove();
    outside.remove();
  }
});
