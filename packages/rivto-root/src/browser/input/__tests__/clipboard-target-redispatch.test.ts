import type { ClipboardTarget } from "../../../events/types";
import { BrowserInputListeners } from "../browser-input-listeners";

it("keeps each clipboard delivery's target when an event is dispatched again", () => {
  const root = document.createElement("div");
  const control = document.createElement("input");
  control.dataset.control = "";
  const surface = document.createElement("div");
  root.append(control, surface);
  document.body.append(root);
  const targets: ClipboardTarget[] = [];
  const listeners = new BrowserInputListeners();
  listeners.register({ type: "copy", target: "root", capture: false }, (input) => {
    targets.push(input.clipboardTarget);
  });
  const detach = listeners.attach(root);
  try {
    const event = new Event("copy", { bubbles: true });
    control.dispatchEvent(event);
    surface.dispatchEvent(event);
    expect(targets).toHaveLength(2);
    expect(targets[0].isIndependentTextEditing("[data-control]", "[data-block]")).toBe(true);
    expect(targets[1].isIndependentTextEditing("[data-control]", "[data-block]")).toBe(false);
  } finally {
    detach();
    root.remove();
  }
});
