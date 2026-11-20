import { BrowserInputListeners } from "../browser-input-listeners";

it("reads propagation state live without exposing the native pointer event", () => {
  const root = document.createElement("div");
  const input = new BrowserInputListeners();
  const states: boolean[] = [];
  input.register({ type: "pointerdown", target: "root", capture: true }, (event) => {
    states.push(event.isPropagationStopped());
    event.stopPropagation();
    states.push(event.isPropagationStopped());
    expect(event).not.toHaveProperty("raw");
  });
  const detach = input.attach(root);
  root.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
  expect(states).toEqual([false, true]);
  detach();
});
