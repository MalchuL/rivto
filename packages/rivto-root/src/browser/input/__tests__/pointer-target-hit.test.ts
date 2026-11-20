/** @jest-environment jsdom */
import { BrowserInputListeners } from "../browser-input-listeners";
import { inputElementIdentity } from "../input-element-identity";
import type { InputTarget } from "../../../events/types";

it("captures the delivered element even under pointer capture and expires after delivery", () => {
  const root = document.createElement("div");
  const child = document.createElement("span");
  root.append(child);
  document.body.append(root);
  Object.defineProperty(child, "hasPointerCapture", { value: () => true });
  const listeners = new BrowserInputListeners();
  let target: InputTarget | null = null;
  listeners.register({ type: "pointermove", target: "root", capture: true }, (input) => {
    target = input.target;
    const hit = target?.captureTargetHit();
    expect(hit?.getNearestAncestorIdentity("span")).toBe(inputElementIdentity(child));
    expect(target?.captureUncapturedPointerHit(input.pointerId)).toBeUndefined();
    hit?.release();
  });
  const detach = listeners.attach(root);
  try {
    child.dispatchEvent(new MouseEvent("pointermove", { bubbles: true }));
    expect(target).not.toBeNull();
    expect((target as InputTarget | null)?.captureTargetHit()).toBeUndefined();
  } finally {
    detach();
    root.remove();
  }
});

it("normalizes pointer leave without exposing a native event", () => {
  const root = document.createElement("div");
  const listeners = new BrowserInputListeners();
  const receive = jest.fn();
  listeners.register({ type: "pointerleave", target: "root", capture: false }, receive);
  const detach = listeners.attach(root);
  try {
    root.dispatchEvent(new MouseEvent("pointerleave", { clientX: 12, clientY: 23 }));
    expect(receive).toHaveBeenCalledWith(
      expect.objectContaining({ type: "pointerleave", clientX: 12, clientY: 23 }),
    );
    expect(receive.mock.calls[0][0]).not.toHaveProperty("raw");
  } finally {
    detach();
  }
});

it("does not capture text targets or elements disconnected during delivery", () => {
  const root = document.createElement("div");
  const child = document.createElement("span");
  const text = document.createTextNode("content");
  child.append(text);
  root.append(child);
  document.body.append(root);
  const captures: boolean[] = [];
  const listeners = new BrowserInputListeners();
  let disconnect = false;
  listeners.register({ type: "pointermove", target: "root", capture: true }, (input) => {
    if (disconnect) {
      child.remove();
    }
    const hit = input.target?.captureTargetHit();
    captures.push(Boolean(hit));
    hit?.release();
  });
  const detach = listeners.attach(root);
  try {
    text.dispatchEvent(new MouseEvent("pointermove", { bubbles: true }));
    disconnect = true;
    child.dispatchEvent(new MouseEvent("pointermove", { bubbles: true }));
    expect(captures).toEqual([false, false]);
  } finally {
    detach();
    root.remove();
  }
});
