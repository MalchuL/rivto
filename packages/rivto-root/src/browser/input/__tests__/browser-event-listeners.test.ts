import { testInputRoots } from "../test-support/test-input-roots";
import { BrowserEventListeners } from "../browser-event-listeners";
import type { BrowserListenerGroup } from "../../../events/types";
const requiredGroups: BrowserListenerGroup[] = [
  { target: "surface", type: "focusin", capture: false, passive: false },
  { target: "surface", type: "pointerdown", capture: false, passive: false },
  { target: "window", type: "pointerup", capture: false, passive: false },
  { target: "window", type: "pointercancel", capture: false, passive: false },
];

afterEach(() => jest.restoreAllMocks());

it("rolls back new connections after partial attachment without disturbing existing listeners", () => {
  const first = document.createElement("div");
  const second = document.createElement("div");
  const seen: string[] = [];
  const listeners = new BrowserEventListeners((group) => {
    seen.push(group.type);
  }, requiredGroups);
  const click: BrowserListenerGroup = {
    type: "click",
    target: "surface",
    capture: false,
    passive: false,
  };
  listeners.connect([click], testInputRoots(new Set([first])));
  const failure = new Error("second root failed");
  jest.spyOn(second, "addEventListener").mockImplementationOnce(() => {
    throw failure;
  });
  try {
    expect(() =>
      listeners.connect(
        [{ ...click, type: "mousedown" }, click],
        testInputRoots(new Set([first, second])),
      ),
    ).toThrow(failure);
    first.dispatchEvent(new MouseEvent("mousedown"));
    first.dispatchEvent(new MouseEvent("click"));
    expect(seen).toEqual(["click"]);
    listeners.connect([click], testInputRoots(new Set([first, second])));
    second.dispatchEvent(new MouseEvent("click"));
    expect(seen).toEqual(["click", "click"]);
  } finally {
    listeners.disconnect();
  }
});

it("attempts every native removal and disables callbacks even when removal throws", () => {
  const root = document.createElement("div");
  const dispatch = jest.fn();
  const listeners = new BrowserEventListeners(dispatch, requiredGroups);
  listeners.connect(
    [
      { type: "click", target: "surface", capture: false, passive: false },
      { type: "mousedown", target: "surface", capture: false, passive: false },
    ],
    testInputRoots(new Set([root])),
  );
  const failure = new Error("native removal failed");
  const remove = root.removeEventListener.bind(root);
  const attempted: string[] = [];
  jest.spyOn(root, "removeEventListener").mockImplementation((...args) => {
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
  const listeners = new BrowserEventListeners((group) => {
    seen.push(group.target);
  }, requiredGroups);
  const groups: BrowserListenerGroup[] = (["surface", "document", "window"] as const).map(
    (target) => ({
      target,
      type: "click",
      capture: false,
      passive: false,
    }),
  );
  try {
    listeners.connect(groups, testInputRoots(new Set([first, second])));
    first.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(seen).toEqual(["surface", "document", "window"]);
    seen.length = 0;
    listeners.connect(groups, testInputRoots(new Set([second])));
    first.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(seen).toEqual(["document", "window"]);
    seen.length = 0;
    second.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(seen).toEqual(["surface", "document", "window"]);
    seen.length = 0;
    listeners.connect([], testInputRoots(new Set()));
    second.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(seen).toEqual([]);
  } finally {
    listeners.disconnect();
    first.remove();
    second.remove();
  }
});
