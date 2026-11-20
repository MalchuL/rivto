import { testInputRoots } from "../test-support/test-input-roots";
import { BrowserEventListeners } from "../browser-event-listeners";

it.each([true, false])("controls browser default only when cancelable=%s", (cancelable) => {
  const root = document.createElement("div");
  const states: boolean[] = [];
  const listeners = new BrowserEventListeners((_group, _root, _capture, _identity, control) => {
    states.push(control.isDefaultPrevented());
    control.preventDefault();
    states.push(control.isDefaultPrevented());
    expect(control).not.toHaveProperty("event");
  }, []);
  try {
    listeners.connect(
      [{ type: "click", target: "surface", capture: false, passive: false }],
      testInputRoots(new Set([root])),
    );
    const event = new MouseEvent("click", { bubbles: true, cancelable });
    root.dispatchEvent(event);
    expect(states).toEqual([false, cancelable]);
    expect(event.defaultPrevented).toBe(cancelable);
  } finally {
    listeners.disconnect();
  }
});
