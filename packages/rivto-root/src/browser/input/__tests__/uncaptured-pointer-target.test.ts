/** @jest-environment jsdom */
import { BrowserInputListeners } from "../browser-input-listeners";

it("reports only connected element targets without pointer capture", () => {
  const root = document.createElement("div");
  const child = document.createElement("span");
  const text = document.createTextNode("content");
  child.append(text);
  root.append(child);
  document.body.append(root);
  let captured = false;
  let disconnect = false;
  Object.defineProperty(child, "hasPointerCapture", { value: () => captured });
  const values: boolean[] = [];
  const listeners = new BrowserInputListeners();
  listeners.register({ type: "pointermove", target: "window", capture: false }, (input) => {
    if (disconnect) {
      child.remove();
    }
    const hit = input.target?.captureUncapturedPointerHit(input.pointerId);
    values.push(Boolean(hit));
    hit?.release();
  });
  const detach = listeners.attach(root);
  try {
    child.dispatchEvent(new MouseEvent("pointermove", { bubbles: true }));
    captured = true;
    child.dispatchEvent(new MouseEvent("pointermove", { bubbles: true }));
    captured = false;
    text.dispatchEvent(new MouseEvent("pointermove", { bubbles: true }));
    disconnect = true;
    child.dispatchEvent(new MouseEvent("pointermove", { bubbles: true }));
    expect(values).toEqual([true, false, false, false]);
  } finally {
    detach();
    root.remove();
  }
});
