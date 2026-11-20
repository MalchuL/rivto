import { testInputRoots } from "../test-support/test-input-roots";
import { BrowserEventListeners } from "../browser-event-listeners";
import { BrowserInputRoot } from "../browser-input-root";

it("renews a disconnected nested dispatch after propagation stops before the inner root", () => {
  const outer = document.createElement("div");
  const inner = document.createElement("div");
  outer.append(inner);
  const occurrence = new BrowserInputRoot(outer);
  const identities: object[] = [];
  let stop = true;
  const listeners = new BrowserEventListeners(
    (_group, _rootIdentity, capture, identity) => {
      identities.push(identity);
      if (stop) {
        stop = false;
        capture(occurrence)?.stopPropagation();
      }
    },
    [],
    true,
  );
  try {
    listeners.connect(
      [{ type: "click", target: "surface", capture: true, passive: false }],
      testInputRoots(new Set([outer, inner])),
    );
    const event = new MouseEvent("click", { bubbles: true });
    inner.dispatchEvent(event);
    inner.dispatchEvent(event);
    expect(identities).toHaveLength(3);
    expect(identities[0]).not.toBe(identities[1]);
    expect(identities[1]).toBe(identities[2]);
  } finally {
    listeners.disconnect();
    occurrence.detach();
  }
});
