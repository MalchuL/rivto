import { BrowserInputListeners } from "../browser-input-listeners";

it("delivers touch-start as a normalized cancellation capability", () => {
  const root = document.createElement("div");
  const listeners = new BrowserInputListeners();
  const received = jest.fn();
  listeners.register({ type: "touchstart", target: "root", capture: true }, (input) => {
    received(input.type);
    expect(input).not.toHaveProperty("raw");
    input.preventDefault();
  });
  const release = listeners.attach(root);
  try {
    const event = new Event("touchstart", { bubbles: true, cancelable: true });
    root.dispatchEvent(event);
    expect(received).toHaveBeenCalledWith("touchstart");
    expect(event.defaultPrevented).toBe(true);
  } finally {
    release();
  }
});
