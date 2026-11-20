import { BrowserInputListeners } from "../browser-input-listeners";
import { BrowserInputRoot } from "../browser-input-root";
import type { InputRegion } from "../../../events/types";

it("bounds delivery and captured regions to the borrowed Root across remounts", () => {
  const element = document.createElement("div");
  const target = document.createElement("div");
  element.dataset.testRoot = "";
  target.dataset.item = "first";
  element.append(target);
  document.body.append(element);
  const listeners = new BrowserInputListeners({ ownsRoot: false });
  const deliveries: InputRegion[] = [];
  listeners.register({ type: "pointerdown", target: "root", capture: false }, (input) => {
    const region = input.captureRegion("[data-item]", "[data-item]", "[data-test-root]");
    if (region) {
      deliveries.push(region);
    }
  });
  const first = new BrowserInputRoot(element);
  const detachFirst = listeners.attach(first);
  let detachSecond: (() => void) | undefined;
  const second = new BrowserInputRoot(element);
  try {
    target.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]?.readAttribute("data-item")).toBe("first");
    first.detach();
    target.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]?.readAttribute("data-item")).toBeUndefined();
    detachFirst();
    detachSecond = listeners.attach(second);
    detachFirst();
    target.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    expect(deliveries).toHaveLength(2);
  } finally {
    detachFirst();
    detachSecond?.();
    first.detach();
    second.detach();
    element.remove();
  }
});

it("stops a detached nested Root claiming its parent's input boundary", () => {
  const outer = document.createElement("div");
  const inner = document.createElement("button");
  outer.append(inner);
  const parent = new BrowserInputListeners();
  const nested = new BrowserInputListeners();
  const parentEvents = jest.fn();
  const nestedEvents = jest.fn();
  parent.register({ type: "click", target: "root", capture: false }, parentEvents);
  nested.register({ type: "click", target: "root", capture: false }, nestedEvents);
  const root = new BrowserInputRoot(inner);
  const detachParent = parent.attach(outer);
  const detachNested = nested.attach(root);
  try {
    inner.click();
    expect(nestedEvents).toHaveBeenCalledTimes(1);
    expect(parentEvents).not.toHaveBeenCalled();
    root.detach();
    inner.click();
    expect(nestedEvents).toHaveBeenCalledTimes(1);
    expect(parentEvents).toHaveBeenCalledTimes(1);
  } finally {
    detachNested();
    detachParent();
    root.detach();
  }
});

it("preserves a shared nested boundary while another borrowed Root remains attached", () => {
  const outer = document.createElement("div");
  const inner = document.createElement("button");
  outer.append(inner);
  const parent = new BrowserInputListeners();
  const first = new BrowserInputListeners();
  const second = new BrowserInputListeners();
  const parentEvents = jest.fn();
  const secondEvents = jest.fn();
  parent.register({ type: "click", target: "root", capture: false }, parentEvents);
  second.register({ type: "click", target: "root", capture: false }, secondEvents);
  const firstRoot = new BrowserInputRoot(inner);
  const secondRoot = new BrowserInputRoot(inner);
  const detachParent = parent.attach(outer);
  const detachFirst = first.attach(firstRoot);
  const detachSecond = second.attach(secondRoot);
  try {
    firstRoot.detach();
    inner.click();
    expect(parentEvents).not.toHaveBeenCalled();
    expect(secondEvents).toHaveBeenCalledTimes(1);
    secondRoot.detach();
    inner.click();
    expect(parentEvents).toHaveBeenCalledTimes(1);
    expect(secondEvents).toHaveBeenCalledTimes(1);
  } finally {
    detachFirst();
    detachSecond();
    detachParent();
    firstRoot.detach();
    secondRoot.detach();
  }
});

it("does not deliver an old input when boundary inspection remounts its listener", () => {
  const outer = document.createElement("div");
  const inner = document.createElement("button");
  outer.append(inner);
  const parent = new BrowserInputListeners();
  const nested = new BrowserInputListeners();
  const received = jest.fn();
  parent.register({ type: "click", target: "root", capture: true }, received);
  const nestedRoot = new BrowserInputRoot(inner);
  let detachParent = parent.attach(outer);
  const detachNested = nested.attach(nestedRoot);
  const check = jest.spyOn(nestedRoot, "isAttached").mockImplementationOnce(() => {
    detachParent();
    detachParent = parent.attach(outer);
    return false;
  });
  try {
    inner.click();
    expect(received).not.toHaveBeenCalled();
    nestedRoot.detach();
    inner.click();
    expect(received).toHaveBeenCalledTimes(1);
  } finally {
    check.mockRestore();
    detachNested();
    detachParent();
    nestedRoot.detach();
  }
});

it("defers a nested boundary registered during ownership inspection", () => {
  const outer = document.createElement("div");
  const inner = document.createElement("button");
  outer.append(inner);
  const parent = new BrowserInputListeners();
  const nested = new BrowserInputListeners();
  const other = new BrowserInputListeners();
  const received = jest.fn();
  parent.register({ type: "click", target: "root", capture: true }, received);
  const first = new BrowserInputRoot(inner);
  const second = new BrowserInputRoot(inner);
  const inactive = new BrowserInputRoot(inner);
  const detachParent = parent.attach(outer);
  let detachNested = nested.attach(first);
  const detachOther = other.attach(inactive);
  const inactiveCheck = jest.spyOn(inactive, "isAttached").mockReturnValue(false);
  const check = jest.spyOn(first, "isAttached").mockImplementationOnce(() => {
    detachNested();
    detachNested = nested.attach(second);
    return false;
  });
  try {
    inner.click();
    expect(received).toHaveBeenCalledTimes(1);
    inner.click();
    expect(received).toHaveBeenCalledTimes(1);
  } finally {
    check.mockRestore();
    inactiveCheck.mockRestore();
    detachNested();
    detachOther();
    detachParent();
    first.detach();
    second.detach();
    inactive.detach();
  }
});

it.each([2, 3])(
  "does not deliver an old input when Root check %i remounts the listener",
  (remountAt) => {
    const element = document.createElement("button");
    const listeners = new BrowserInputListeners({ ownsRoot: false });
    const delivered = jest.fn();
    listeners.register({ type: "click", target: "root", capture: false }, delivered);
    const replacement = new BrowserInputRoot(element);
    let checks = 0;
    let armed = false;
    let detach: () => void = () => {};
    const root = new BrowserInputRoot(element, () => {
      checks += 1;
      if (armed && checks === remountAt) {
        detach();
        detach = listeners.attach(replacement);
      }
      return true;
    });
    detach = listeners.attach(root);
    checks = 0;
    armed = true;
    try {
      element.click();
      expect(delivered).not.toHaveBeenCalled();
      element.click();
      expect(delivered).toHaveBeenCalledTimes(1);
    } finally {
      detach();
      root.detach();
      replacement.detach();
    }
  },
);

it("rejects a detached Root before attaching native listeners", () => {
  const element = document.createElement("div");
  const root = new BrowserInputRoot(element);
  root.detach();
  const listeners = new BrowserInputListeners();
  const add = jest.spyOn(element, "addEventListener");
  try {
    expect(() => listeners.attach(root)).toThrow("Browser input requires an active browser root");
    expect(add).not.toHaveBeenCalled();
  } finally {
    add.mockRestore();
  }
});

it("rejects an active Root that is not owned by the browser adapter", () => {
  const listeners = new BrowserInputListeners();
  expect(() => listeners.attach({ isAttached: () => true })).toThrow(
    "Browser input requires an active browser root",
  );
});

it("rolls back listeners if the borrowed Root detaches during installation", () => {
  const element = document.createElement("div");
  const root = new BrowserInputRoot(element);
  const listeners = new BrowserInputListeners();
  const delivered = jest.fn();
  listeners.register({ type: "click", target: "root", capture: false }, delivered);
  const add = element.addEventListener.bind(element);
  const remove = jest.spyOn(element, "removeEventListener");
  const install = jest
    .spyOn(element, "addEventListener")
    .mockImplementation((type, listener, options) => {
      add(type, listener, options);
      root.detach();
    });
  const replacement = new BrowserInputRoot(element);
  let detach: (() => void) | undefined;
  try {
    expect(() => listeners.attach(root)).toThrow("Browser input root detached during attachment");
    expect(remove).toHaveBeenCalled();
    install.mockRestore();
    detach = listeners.attach(replacement);
    element.click();
    expect(delivered).toHaveBeenCalledTimes(1);
  } finally {
    install.mockRestore();
    remove.mockRestore();
    detach?.();
    root.detach();
    replacement.detach();
  }
});

it("retains a detach failure while disabling a listener left behind by rollback", () => {
  const element = document.createElement("div");
  const root = new BrowserInputRoot(element);
  const listeners = new BrowserInputListeners();
  const delivered = jest.fn();
  const failure = new Error("native removal failed");
  listeners.register({ type: "click", target: "root", capture: false }, delivered);
  const add = element.addEventListener.bind(element);
  const install = jest
    .spyOn(element, "addEventListener")
    .mockImplementation((type, listener, options) => {
      add(type, listener, options);
      root.detach();
    });
  const remove = jest.spyOn(element, "removeEventListener").mockImplementation(() => {
    throw failure;
  });
  try {
    let caught: unknown;
    try {
      listeners.attach(root);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AggregateError);
    expect(caught).toMatchObject({
      errors: [
        expect.objectContaining({ message: "Browser input root detached during attachment" }),
        expect.objectContaining({ errors: [failure] }),
      ],
    });
    element.click();
    expect(delivered).not.toHaveBeenCalled();
  } finally {
    install.mockRestore();
    remove.mockRestore();
    root.detach();
  }
});
