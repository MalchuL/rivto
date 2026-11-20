import { BrowserInputListeners } from "../browser-input-listeners";

it("copies click counts and lets consumers prevent only pointer clicks", () => {
  const root = document.createElement("div");
  const listeners = new BrowserInputListeners();
  const seen: number[] = [];
  listeners.register({ type: "click", target: "root", capture: true }, (input) => {
    seen.push(input.detail);
    if (input.detail > 0) {
      input.preventDefault();
    }
  });
  const detach = listeners.attach(root);
  try {
    const keyboard = new MouseEvent("click", { bubbles: true, cancelable: true, detail: 0 });
    const pointer = new MouseEvent("click", { bubbles: true, cancelable: true, detail: 2 });
    const generic = new Event("click", { bubbles: true, cancelable: true });
    root.dispatchEvent(keyboard);
    root.dispatchEvent(pointer);
    root.dispatchEvent(generic);
    expect(seen).toEqual([0, 2, 0]);
    expect(keyboard.defaultPrevented).toBe(false);
    expect(pointer.defaultPrevented).toBe(true);
    expect(generic.defaultPrevented).toBe(false);
  } finally {
    detach();
  }
});
