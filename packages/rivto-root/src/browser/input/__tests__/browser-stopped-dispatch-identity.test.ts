import { testInputRoots } from "../test-support/test-input-roots";
import { BrowserEventListeners } from "../browser-event-listeners";
import { BrowserInputRoot } from "../browser-input-root";

it("renews a reused event after propagation stopped before the innermost root", () => {
  const outer = document.createElement("div");
  const inner = document.createElement("div");
  outer.append(inner);
  document.body.append(outer);
  const roots = new Set([outer, inner]);
  const occurrence = new BrowserInputRoot(outer);
  const identities: object[] = [];
  let first = true;
  const listeners = new BrowserEventListeners(
    (_group, _rootIdentity, capture, identity) => {
      identities.push(identity);
      if (first) {
        first = false;
        capture(occurrence)?.stopPropagation();
      }
    },
    [],
    true,
  );
  const install = () => {
    listeners.connect(
      [{ type: "click", target: "surface", capture: false, passive: false }],
      testInputRoots(roots),
    );
  };
  try {
    listeners.connect(
      [{ type: "click", target: "surface", capture: true, passive: false }],
      testInputRoots(roots),
    );
    const event = new MouseEvent("click", { bubbles: true });
    inner.dispatchEvent(event);
    listeners.connect([], testInputRoots(roots));
    window.addEventListener("click", install, { capture: true, once: true });
    inner.dispatchEvent(event);
    expect(identities).toHaveLength(3);
    expect(identities[0]).not.toBe(identities[1]);
    expect(identities[1]).toBe(identities[2]);
  } finally {
    window.removeEventListener("click", install, true);
    listeners.disconnect();
    occurrence.detach();
    outer.remove();
  }
});
