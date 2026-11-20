import { testInputRoots } from "../test-support/test-input-roots";
import { BrowserEventListeners } from "../browser-event-listeners";
import { BrowserInputRoot } from "../browser-input-root";

it("delivers browser input without exposing the native event to the listener consumer", () => {
  const root = document.createElement("div");
  const target = document.createElement("button");
  root.append(target);
  document.body.append(root);
  const occurrence = new BrowserInputRoot(root);
  const seen: unknown[][] = [];
  const listeners = new BrowserEventListeners((...delivery) => {
    seen.push(delivery);
  }, []);
  try {
    listeners.connect(
      [{ type: "click", target: "surface", capture: false, passive: false }],
      testInputRoots(new Set([root])),
    );
    const native = new MouseEvent("click", { bubbles: true });
    target.dispatchEvent(native);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toHaveLength(5);
    expect(seen[0]).not.toContain(native);
    expect(seen[0]).not.toContain(root);
    const [group, rootIdentity, capture] = seen[0]!;
    expect(group).toEqual({ type: "click", target: "surface", capture: false, passive: false });
    expect(rootIdentity).toBe(occurrence.getElementIdentity());
    expect(rootIdentity).not.toBe(root);
    expect(typeof capture).toBe("function");
  } finally {
    listeners.disconnect();
    occurrence.detach();
    root.remove();
  }
});
