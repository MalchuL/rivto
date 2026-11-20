import { testInputRoots } from "../test-support/test-input-roots";
import { BrowserEventListeners } from "../browser-event-listeners";
import { BrowserInputRoot } from "../browser-input-root";

it("identifies each surface without exposing its element and omits it for document input", () => {
  const first = document.createElement("div");
  const second = document.createElement("div");
  document.body.append(first, second);
  const firstOccurrence = new BrowserInputRoot(first);
  const secondOccurrence = new BrowserInputRoot(second);
  const seen: Array<object | undefined> = [];
  const listeners = new BrowserEventListeners((_group, identity) => {
    seen.push(identity);
  }, []);
  try {
    listeners.connect(
      [
        { type: "click", target: "surface", capture: false, passive: false },
        { type: "click", target: "document", capture: false, passive: false },
      ],
      testInputRoots(new Set([first, second])),
    );
    first.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    firstOccurrence.detach();
    const remounted = new BrowserInputRoot(first);
    try {
      first.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      second.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      expect(seen).toHaveLength(6);
      expect(seen[0]).toBe(remounted.getElementIdentity());
      expect(seen[1]).toBeUndefined();
      expect(seen[2]).toBe(remounted.getElementIdentity());
      expect(seen[3]).toBeUndefined();
      expect(seen[4]).toBe(secondOccurrence.getElementIdentity());
      expect(seen[5]).toBeUndefined();
      expect(seen[0]).not.toBe(first);
      expect(seen[0]).not.toBe(seen[4]);
    } finally {
      remounted.detach();
    }
  } finally {
    listeners.disconnect();
    firstOccurrence.detach();
    secondOccurrence.detach();
    first.remove();
    second.remove();
  }
});
