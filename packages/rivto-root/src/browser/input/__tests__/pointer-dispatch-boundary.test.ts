import { testInputRoots } from "../test-support/test-input-roots";
import { BrowserEventListeners } from "../browser-event-listeners";
import { retainPointerDispatchBoundary } from "../pointer-dispatch-boundary";
import { claimPointerOwner, getPointerOwner, releasePointerOwner } from "../pointer-ownership";

it("shares the window capture boundary until the last listener owner disconnects", () => {
  const first = document.createElement("div");
  const second = document.createElement("div");
  document.body.append(first, second);
  const add = jest.spyOn(window, "addEventListener");
  const remove = jest.spyOn(window, "removeEventListener");
  const firstListeners = new BrowserEventListeners(() => {}, []);
  const secondListeners = new BrowserEventListeners(() => {}, []);
  const groups = [
    { type: "pointermove", target: "window", capture: false, passive: false },
  ] as const;
  try {
    firstListeners.connect(groups, testInputRoots(new Set([first])));
    secondListeners.connect(groups, testInputRoots(new Set([second])));
    const boundaries = add.mock.calls.filter(
      ([type, _listener, options]) =>
        type === "pointermove" && typeof options === "object" && options?.capture === true,
    );
    expect(boundaries).toHaveLength(1);
    const listener = boundaries[0]![1];
    firstListeners.disconnect();
    expect(remove).not.toHaveBeenCalledWith("pointermove", listener, true);
    secondListeners.disconnect();
    expect(remove).toHaveBeenCalledWith("pointermove", listener, true);
  } finally {
    firstListeners.disconnect();
    secondListeners.disconnect();
    add.mockRestore();
    remove.mockRestore();
    first.remove();
    second.remove();
  }
});

it("disables a shared boundary even if native removal fails", () => {
  const lease = retainPointerDispatchBoundary(window, "pointermove");
  const nativeRemove = window.removeEventListener.bind(window);
  const failure = new Error("native removal failed");
  const remove = jest.spyOn(window, "removeEventListener").mockImplementation(() => {
    throw failure;
  });
  const first = {};
  const second = {};
  const event = new MouseEvent("pointermove");
  try {
    claimPointerOwner(document, first);
    expect(getPointerOwner(event, document)).toBe(first);
    expect(() => lease.release()).toThrow(failure);
    claimPointerOwner(document, second);
    lease.listener(event);
    expect(getPointerOwner(event, document)).toBe(first);
  } finally {
    remove.mockRestore();
    nativeRemove("pointermove", lease.listener, true);
    releasePointerOwner(document);
  }
});
