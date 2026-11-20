/** @jest-environment jsdom */
import { BrowserInputListeners } from "../browser-input-listeners";

it("copies whether an earlier listener prevented the keyboard default", () => {
  const root = document.createElement("div");
  const child = document.createElement("button");
  root.append(child);
  document.body.append(root);
  const listeners = new BrowserInputListeners({ ownsRoot: false });
  const states: boolean[] = [];
  listeners.register({ type: "keydown", target: "document", capture: false }, (input) => {
    states.push(input.defaultPrevented);
  });
  const detach = listeners.attach(root);
  const prevent = (event: Event) => event.preventDefault();
  try {
    child.addEventListener("keydown", prevent);
    child.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
    );
    child.removeEventListener("keydown", prevent);
    child.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
    );
    expect(states).toEqual([true, false]);
  } finally {
    detach();
    root.remove();
  }
});
