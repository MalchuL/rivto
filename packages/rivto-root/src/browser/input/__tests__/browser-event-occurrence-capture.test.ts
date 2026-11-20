import { testInputRoots } from "../test-support/test-input-roots";
import { BrowserEventListeners } from "../browser-event-listeners";
import { BrowserInputRoot } from "../browser-input-root";

it("normalizes input through the selected occurrence and rejects it after detachment", () => {
  const root = document.createElement("div");
  const target = document.createElement("button");
  root.append(target);
  document.body.append(root);
  const occurrence = new BrowserInputRoot(root);
  const seen: Array<boolean | undefined> = [];
  const listeners = new BrowserEventListeners((_group, _root, capture) => {
    seen.push(capture(occurrence)?.target?.belongsToRoot());
    occurrence.detach();
    seen.push(capture(occurrence)?.target?.belongsToRoot());
  }, []);
  try {
    listeners.connect(
      [{ type: "click", target: "surface", capture: false, passive: false }],
      testInputRoots(new Set([root])),
    );
    target.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(seen).toEqual([true, undefined]);
  } finally {
    listeners.disconnect();
    occurrence.detach();
    root.remove();
  }
});

it("discards input when the occurrence becomes stale during normalization", () => {
  const root = document.createElement("div");
  const target = document.createElement("button");
  root.append(target);
  document.body.append(root);
  let checks = 0;
  const occurrence = new BrowserInputRoot(root, () => ++checks === 1);
  let captured: unknown;
  const listeners = new BrowserEventListeners((_group, _root, capture) => {
    captured = capture(occurrence);
  }, []);
  try {
    listeners.connect(
      [{ type: "click", target: "surface", capture: false, passive: false }],
      testInputRoots(new Set([root])),
    );
    target.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(captured).toBeUndefined();
    expect(checks).toBe(2);
  } finally {
    listeners.disconnect();
    occurrence.detach();
    root.remove();
  }
});
