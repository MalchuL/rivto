import type { KeyboardTarget } from "../../../keyboard/types";
import { BrowserInputListeners } from "../../input/browser-input-listeners";

it("keeps each keyboard delivery's target when an event is dispatched again", () => {
  const root = document.createElement("div");
  root.innerHTML = "<button data-first></button><button data-second></button>";
  const [first, second] = root.querySelectorAll("button");
  const targets: KeyboardTarget[] = [];
  const listeners = new BrowserInputListeners();
  listeners.register({ type: "keydown", target: "root", capture: false }, (input) => {
    if (input.keyboardTarget) {
      targets.push(input.keyboardTarget);
    }
  });
  const detach = listeners.attach(root);
  try {
    const event = new KeyboardEvent("keydown", { bubbles: true, key: "a" });
    first.dispatchEvent(event);
    second.dispatchEvent(event);
    expect(targets).toHaveLength(2);
    expect(targets[0].hasAncestor("[data-first]")).toBe(true);
    expect(targets[1].hasAncestor("[data-second]")).toBe(true);
    first.removeAttribute("data-first");
    expect(targets[0].hasAncestor("[data-first]")).toBe(false);
  } finally {
    detach();
  }
});
