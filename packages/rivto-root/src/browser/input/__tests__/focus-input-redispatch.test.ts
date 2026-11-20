import type { FocusInput } from "../../../events/types";
import { BrowserInputListeners } from "../browser-input-listeners";

it("keeps the original focus target when a focus event is dispatched again", () => {
  const root = document.createElement("div");
  root.innerHTML =
    "<div data-block><button></button><span></span></div><div data-block><button></button></div>";
  const [first, second] = root.querySelectorAll("button");
  const related = root.querySelector("span")!;
  const inputs: FocusInput[] = [];
  const listeners = new BrowserInputListeners();
  listeners.register({ type: "focusout", target: "root", capture: false }, (input) => {
    inputs.push(input);
  });
  const detach = listeners.attach(root);
  try {
    const event = new FocusEvent("focusout", { bubbles: true });
    Object.defineProperty(event, "relatedTarget", { get: () => related });
    first.dispatchEvent(event);
    second.dispatchEvent(event);
    expect(inputs).toHaveLength(2);
    expect(inputs[0].captureRelatedTargetWithinAncestor("[data-block]")()).toBe(true);
    expect(inputs[1].captureRelatedTargetWithinAncestor("[data-block]")()).toBe(false);
  } finally {
    detach();
  }
});
