import type { TextInput } from "../../../events/types";
import { BrowserInputListeners } from "../browser-input-listeners";

it("keeps each input delivery's target when the browser event is dispatched again", () => {
  const root = document.createElement("div");
  root.innerHTML = "<span data-content>first</span><span data-content>second</span>";
  const [first, second] = root.querySelectorAll("span");
  const inputs: TextInput[] = [];
  const listeners = new BrowserInputListeners();
  listeners.register({ type: "input", target: "root", capture: false }, (input) => {
    inputs.push(input);
  });
  const detach = listeners.attach(root);
  try {
    const event = new InputEvent("input", { bubbles: true });
    first.dispatchEvent(event);
    second.dispatchEvent(event);
    expect(inputs).toHaveLength(2);
    expect(inputs[0].captureTargetText("[data-content]")?.()).toBe("first");
    expect(inputs[1].captureTargetText("[data-content]")?.()).toBe("second");
  } finally {
    detach();
  }
});
