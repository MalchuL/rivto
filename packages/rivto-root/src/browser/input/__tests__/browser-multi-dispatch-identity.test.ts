import { testInputRoots } from "../test-support/test-input-roots";
import { BrowserEventListeners } from "../browser-event-listeners";

it.each([true, false])(
  "shares one identity across nested roots and renews it when connected=%s",
  (connected) => {
    const outer = document.createElement("div");
    const inner = document.createElement("div");
    outer.append(inner);
    if (connected) {
      document.body.append(outer);
    }
    const identities: object[] = [];
    const listeners = new BrowserEventListeners(
      (_group, _root, _capture, identity) => {
        identities.push(identity);
      },
      [],
      true,
    );
    try {
      listeners.connect(
        [
          { type: "click", target: "surface", capture: true, passive: false },
          { type: "click", target: "surface", capture: false, passive: false },
        ],
        testInputRoots(new Set([outer, inner])),
      );
      const event = new MouseEvent("click", { bubbles: true });
      inner.dispatchEvent(event);
      inner.dispatchEvent(event);
      expect(identities).toHaveLength(8);
      expect(new Set(identities.slice(0, 4)).size).toBe(1);
      expect(new Set(identities.slice(4)).size).toBe(1);
      expect(identities[0]).not.toBe(identities[4]);
    } finally {
      listeners.disconnect();
      outer.remove();
    }
  },
);
