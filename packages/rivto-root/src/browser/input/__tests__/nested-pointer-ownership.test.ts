import { testInputRoots } from "../test-support/test-input-roots";
import { BrowserEventListeners } from "../browser-event-listeners";
import { BrowserInputRoot } from "../browser-input-root";

it("preserves the original owner when a new gesture starts during pointer delivery", () => {
  const first = document.createElement("div");
  const second = document.createElement("div");
  document.body.append(first, second);
  const firstRoot = new BrowserInputRoot(first);
  const secondRoot = new BrowserInputRoot(second);
  const seen: Array<object | undefined> = [];
  const firstListeners = new BrowserEventListeners((group, _root, _capture, _id, control) => {
    if (group.type === "pointerdown") {
      control.claimPointerOwner(firstRoot.getElementIdentity());
    } else {
      seen.push(control.getPointerOwner());
      control.releasePointerOwner();
      second.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    }
  }, []);
  const secondListeners = new BrowserEventListeners((group, _root, _capture, _id, control) => {
    if (group.type === "pointerdown") {
      control.claimPointerOwner(secondRoot.getElementIdentity());
    } else {
      seen.push(control.getPointerOwner());
      control.releasePointerOwner();
    }
  }, []);
  const groups = [
    { type: "pointerdown", target: "surface", capture: false, passive: false },
    { type: "pointerup", target: "window", capture: false, passive: false },
  ] as const;
  try {
    firstListeners.connect(groups, testInputRoots(new Set([first])));
    secondListeners.connect(groups, testInputRoots(new Set([second])));
    first.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    first.dispatchEvent(new MouseEvent("pointerup", { bubbles: true }));
    expect(seen).toHaveLength(2);
    expect(seen[0]).toBe(firstRoot.getElementIdentity());
    expect(seen[1]).toBe(firstRoot.getElementIdentity());
    second.dispatchEvent(new MouseEvent("pointerup", { bubbles: true }));
    expect(seen[2]).toBe(secondRoot.getElementIdentity());
  } finally {
    firstRoot.releasePointerOwnership();
    secondRoot.releasePointerOwnership();
    firstListeners.disconnect();
    secondListeners.disconnect();
    firstRoot.detach();
    secondRoot.detach();
    first.remove();
    second.remove();
  }
});

it("does not release a newer gesture on the same occurrence", () => {
  const element = document.createElement("div");
  document.body.append(element);
  const root = new BrowserInputRoot(element);
  const identity = root.getElementIdentity();
  const seen: Array<object | undefined> = [];
  const listeners = new BrowserEventListeners((group, _root, _capture, _id, control) => {
    if (group.type === "pointerdown") {
      control.claimPointerOwner(identity);
    } else if (group.type === "pointerup") {
      seen.push(control.getPointerOwner());
      element.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
      control.releasePointerOwner();
    } else {
      seen.push(control.getPointerOwner());
    }
  }, []);
  const groups = ["pointerdown", "pointerup", "pointermove"].map((type) => ({
    type,
    target: "surface" as const,
    capture: false,
    passive: false,
  }));
  try {
    listeners.connect(groups, testInputRoots(new Set([element])));
    element.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    element.dispatchEvent(new MouseEvent("pointerup", { bubbles: true }));
    element.dispatchEvent(new MouseEvent("pointermove", { bubbles: true }));
    expect(seen).toHaveLength(2);
    expect(seen[0]).toBe(identity);
    expect(seen[1]).toBe(identity);
  } finally {
    root.releasePointerOwnership();
    listeners.disconnect();
    root.detach();
    element.remove();
  }
});

it("releases the current gesture without requiring an earlier owner read", () => {
  const element = document.createElement("div");
  document.body.append(element);
  const root = new BrowserInputRoot(element);
  let owner: object | undefined;
  const listeners = new BrowserEventListeners((group, _root, _capture, _id, control) => {
    if (group.type === "pointerdown") {
      control.claimPointerOwner(root.getElementIdentity());
    } else if (group.type === "pointerup") {
      control.releasePointerOwner();
    } else {
      owner = control.getPointerOwner();
    }
  }, []);
  const groups = ["pointerdown", "pointerup", "pointermove"].map((type) => ({
    type,
    target: "surface" as const,
    capture: false,
    passive: false,
  }));
  try {
    listeners.connect(groups, testInputRoots(new Set([element])));
    element.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    element.dispatchEvent(new MouseEvent("pointerup", { bubbles: true }));
    element.dispatchEvent(new MouseEvent("pointermove", { bubbles: true }));
    expect(owner).toBeUndefined();
  } finally {
    root.releasePointerOwnership();
    listeners.disconnect();
    root.detach();
    element.remove();
  }
});
