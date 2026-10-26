/** @jest-environment jsdom */
import { DOMEventListeners } from "./dom-event-listeners";
import type { NativeListenerGroup } from "./types";
const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;

afterEach(() => jestApi.restoreAllMocks());

it("rolls back new connections after partial attachment without disturbing existing listeners", () => {
  const first = document.createElement("div");
  const second = document.createElement("div");
  const seen: string[] = [];
  const listeners = new DOMEventListeners((group) => {
    seen.push(group.type);
  });
  const click: NativeListenerGroup = {
    type: "click",
    target: "surface",
    capture: false,
    passive: false,
  };
  listeners.connect([click], new Set([first]));
  const failure = new Error("second root failed");
  jestApi.spyOn(second, "addEventListener").mockImplementationOnce(() => {
    throw failure;
  });
  try {
    expect(() =>
      listeners.connect([{ ...click, type: "mousedown" }, click], new Set([first, second])),
    ).toThrow(failure);
    first.dispatchEvent(new MouseEvent("mousedown"));
    first.dispatchEvent(new MouseEvent("click"));
    expect(seen).toEqual(["click"]);
    listeners.connect([click], new Set([first, second]));
    second.dispatchEvent(new MouseEvent("click"));
    expect(seen).toEqual(["click", "click"]);
  } finally {
    listeners.disconnect();
  }
});

it("attempts every native removal and disables callbacks even when removal throws", () => {
  const root = document.createElement("div");
  const dispatch = jestApi.fn();
  const listeners = new DOMEventListeners(dispatch);
  listeners.connect(
    [
      { type: "click", target: "surface", capture: false, passive: false },
      { type: "mousedown", target: "surface", capture: false, passive: false },
    ],
    new Set([root]),
  );
  const failure = new Error("native removal failed");
  const remove = root.removeEventListener.bind(root);
  const attempted: string[] = [];
  jestApi.spyOn(root, "removeEventListener").mockImplementation((...args) => {
    attempted.push(args[0]);
    if (args[0] === "click") {
      throw failure;
    }
    remove(...args);
  });
  expect(() => listeners.disconnect()).toThrow(AggregateError);
  expect(attempted).toEqual(["click", "mousedown", "focusin", "pointerdown"]);
  root.dispatchEvent(new MouseEvent("click"));
  root.dispatchEvent(new MouseEvent("mousedown"));
  expect(dispatch).not.toHaveBeenCalled();
  expect(() => listeners.disconnect()).not.toThrow();
});

it("retains shared global listeners while removing one root and releases all on disconnect", () => {
  const first = document.createElement("div");
  const second = document.createElement("div");
  document.body.append(first, second);
  const seen: string[] = [];
  const listeners = new DOMEventListeners((group) => {
    seen.push(group.target);
  });
  const groups: NativeListenerGroup[] = (["surface", "document", "window"] as const).map(
    (target) => ({
      target,
      type: "click",
      capture: false,
      passive: false,
    }),
  );
  try {
    listeners.connect(groups, new Set([first, second]));
    first.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(seen).toEqual(["surface", "document", "window"]);
    seen.length = 0;
    listeners.connect(groups, new Set([second]));
    first.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(seen).toEqual(["document", "window"]);
    seen.length = 0;
    second.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(seen).toEqual(["surface", "document", "window"]);
    seen.length = 0;
    listeners.connect([], new Set());
    second.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(seen).toEqual([]);
  } finally {
    listeners.disconnect();
    first.remove();
    second.remove();
  }
});
