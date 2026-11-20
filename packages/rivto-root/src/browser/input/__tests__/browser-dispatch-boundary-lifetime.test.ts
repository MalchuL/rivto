import { testInputRoots } from "../test-support/test-input-roots";
import { BrowserEventListeners } from "../browser-event-listeners";

it("removes dispatch boundaries when the last listener for a type is removed", () => {
  const root = document.createElement("div");
  const removeWindow = jest.spyOn(window, "removeEventListener");
  const removeRoot = jest.spyOn(root, "removeEventListener");
  const listeners = new BrowserEventListeners(() => {}, [], true);
  const roots = new Set([root]);
  try {
    listeners.connect(
      [{ type: "click", target: "surface", capture: false, passive: false }],
      testInputRoots(roots),
    );
    listeners.connect([], testInputRoots(roots));
    expect(removeWindow).toHaveBeenCalledWith("click", expect.any(Function), true);
    expect(removeRoot).toHaveBeenCalledWith("click", expect.any(Function), true);
    expect(removeRoot).toHaveBeenCalledWith("click", expect.any(Function), false);
  } finally {
    listeners.disconnect();
    removeWindow.mockRestore();
    removeRoot.mockRestore();
  }
});

it("retains an in-flight boundary until a later reconciliation", () => {
  const root = document.createElement("div");
  document.body.append(root);
  const removeWindow = jest.spyOn(window, "removeEventListener");
  const roots = new Set([root]);
  let removalsDuringDispatch = -1;
  const listeners = new BrowserEventListeners(
    () => {
      listeners.connect([], testInputRoots(roots));
      removalsDuringDispatch = removeWindow.mock.calls.length;
    },
    [],
    true,
  );
  try {
    listeners.connect(
      [{ type: "click", target: "surface", capture: true, passive: false }],
      testInputRoots(roots),
    );
    root.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(removalsDuringDispatch).toBe(0);
    listeners.connect([], testInputRoots(roots));
    expect(removeWindow).toHaveBeenCalledWith("click", expect.any(Function), true);
  } finally {
    listeners.disconnect();
    removeWindow.mockRestore();
    root.remove();
  }
});
