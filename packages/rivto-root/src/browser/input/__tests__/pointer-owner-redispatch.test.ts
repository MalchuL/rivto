import { testInputRoots } from "../test-support/test-input-roots";
import { BrowserEventListeners } from "../browser-event-listeners";
import { BrowserInputRoot } from "../browser-input-root";
import { claimPointerOwner } from "../pointer-ownership";

it.each([true, false])(
  "captures the current gesture on redispatch when connected=%s",
  (connected) => {
    const first = document.createElement("div");
    const second = document.createElement("div");
    const container = document.createElement("div");
    container.append(first, second);
    if (connected) {
      document.body.append(container);
    }
    const firstRoot = new BrowserInputRoot(first);
    const secondRoot = new BrowserInputRoot(second);
    const owners: Array<object | undefined> = [];
    const listeners = new BrowserEventListeners(
      (group, rootIdentity, _capture, _identity, control) => {
        if (group.type === "pointerdown") {
          control.claimPointerOwner(
            rootIdentity === firstRoot.getElementIdentity()
              ? firstRoot.getElementIdentity()
              : secondRoot.getElementIdentity(),
          );
        } else if (group.type === "pointermove") {
          owners.push(control.getPointerOwner());
        } else {
          control.releasePointerOwner();
        }
      },
      [],
    );
    const groups = ["pointerdown", "pointermove", "pointerup"].map((type) => ({
      type,
      target: "surface" as const,
      capture: false,
      passive: false,
    }));
    try {
      listeners.connect(groups, testInputRoots(new Set([first, second])));
      const move = new MouseEvent("pointermove", { bubbles: true });
      first.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
      first.dispatchEvent(move);
      first.dispatchEvent(new MouseEvent("pointerup", { bubbles: true }));
      second.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
      second.dispatchEvent(move);
      expect(owners).toHaveLength(2);
      expect(owners[0]).toBe(firstRoot.getElementIdentity());
      expect(owners[1]).toBe(secondRoot.getElementIdentity());
    } finally {
      firstRoot.releasePointerOwnership();
      secondRoot.releasePointerOwnership();
      listeners.disconnect();
      firstRoot.detach();
      secondRoot.detach();
      container.remove();
    }
  },
);

it("does not restore a released owner when the same pointer-up is dispatched again", () => {
  const element = document.createElement("div");
  document.body.append(element);
  const root = new BrowserInputRoot(element);
  const owners: Array<object | undefined> = [];
  const listeners = new BrowserEventListeners((group, _root, _capture, _identity, control) => {
    if (group.type === "pointerdown") {
      control.claimPointerOwner(root.getElementIdentity());
    } else {
      owners.push(control.getPointerOwner());
      control.releasePointerOwner();
    }
  }, []);
  const groups = ["pointerdown", "pointerup"].map((type) => ({
    type,
    target: "surface" as const,
    capture: false,
    passive: false,
  }));
  try {
    listeners.connect(groups, testInputRoots(new Set([element])));
    element.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    const up = new MouseEvent("pointerup", { bubbles: true });
    element.dispatchEvent(up);
    element.dispatchEvent(up);
    expect(owners).toHaveLength(2);
    expect(owners[0]).toBe(root.getElementIdentity());
    expect(owners[1]).toBeUndefined();
  } finally {
    root.releasePointerOwnership();
    listeners.disconnect();
    root.detach();
    element.remove();
  }
});

it("keeps an initially absent owner across listeners when a gesture starts during delivery", () => {
  const first = document.createElement("div");
  const second = document.createElement("div");
  document.body.append(first, second);
  const root = new BrowserInputRoot(first);
  const owners: Array<object | undefined> = [];
  let start = true;
  const firstListeners = new BrowserEventListeners((_group, _root, _capture, _id, control) => {
    owners.push(control.getPointerOwner());
    if (start) {
      start = false;
      control.claimPointerOwner(root.getElementIdentity());
    }
  }, []);
  const secondListeners = new BrowserEventListeners((_group, _root, _capture, _id, control) => {
    owners.push(control.getPointerOwner());
  }, []);
  const groups = [
    { type: "pointermove", target: "window", capture: false, passive: false },
  ] as const;
  try {
    firstListeners.connect(groups, testInputRoots(new Set([first])));
    secondListeners.connect(groups, testInputRoots(new Set([second])));
    first.dispatchEvent(new MouseEvent("pointermove", { bubbles: true }));
    expect(owners).toEqual([undefined, undefined]);
    first.dispatchEvent(new MouseEvent("pointermove", { bubbles: true }));
    expect(owners[2]).toBe(root.getElementIdentity());
    expect(owners[3]).toBe(root.getElementIdentity());
  } finally {
    root.releasePointerOwnership();
    firstListeners.disconnect();
    secondListeners.disconnect();
    root.detach();
    first.remove();
    second.remove();
  }
});

it("starts a fresh snapshot when the listener attaches after window capture", () => {
  const first = document.createElement("div");
  const second = document.createElement("div");
  document.body.append(first, second);
  const firstRoot = new BrowserInputRoot(first);
  const secondRoot = new BrowserInputRoot(second);
  const owners: Array<object | undefined> = [];
  const firstListeners = new BrowserEventListeners((_group, _root, _capture, _id, control) => {
    owners.push(control.getPointerOwner());
  }, []);
  const secondListeners = new BrowserEventListeners((_group, _root, _capture, _id, control) => {
    owners.push(control.getPointerOwner());
  }, []);
  const groups = [
    { type: "pointermove", target: "surface", capture: false, passive: false },
  ] as const;
  /**
   * Attaches the second owner after this dispatch has crossed window capture.
   *
   * @returns The second owner is ready before occurrence capture begins.
   */
  const attachDuringDispatch = () =>
    secondListeners.connect(groups, testInputRoots(new Set([second])));
  try {
    firstListeners.connect(groups, testInputRoots(new Set([first])));
    claimPointerOwner(document, firstRoot.getElementIdentity());
    const move = new MouseEvent("pointermove", { bubbles: true });
    first.dispatchEvent(move);
    firstListeners.disconnect();
    claimPointerOwner(document, secondRoot.getElementIdentity());
    window.addEventListener("pointermove", attachDuringDispatch, { capture: true, once: true });
    second.dispatchEvent(move);
    expect(owners).toHaveLength(2);
    expect(owners[0]).toBe(firstRoot.getElementIdentity());
    expect(owners[1]).toBe(secondRoot.getElementIdentity());
  } finally {
    window.removeEventListener("pointermove", attachDuringDispatch, true);
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

it("shares one snapshot across nested disconnected occurrences", () => {
  const outer = document.createElement("div");
  const inner = document.createElement("div");
  outer.append(inner);
  const outerRoot = new BrowserInputRoot(outer);
  const innerRoot = new BrowserInputRoot(inner);
  const owners: Array<object | undefined> = [];
  const outerListeners = new BrowserEventListeners((_group, _root, _capture, _id, control) => {
    owners.push(control.getPointerOwner());
    control.claimPointerOwner(innerRoot.getElementIdentity());
  }, []);
  const innerListeners = new BrowserEventListeners((_group, _root, _capture, _id, control) => {
    owners.push(control.getPointerOwner());
  }, []);
  const groups = [
    { type: "pointermove", target: "surface", capture: true, passive: false },
  ] as const;
  try {
    outerListeners.connect(groups, testInputRoots(new Set([outer])));
    innerListeners.connect(groups, testInputRoots(new Set([inner])));
    claimPointerOwner(document, outerRoot.getElementIdentity());
    const move = new MouseEvent("pointermove", { bubbles: true });
    inner.dispatchEvent(move);
    inner.dispatchEvent(move);
    expect(owners).toHaveLength(4);
    expect(owners[0]).toBe(outerRoot.getElementIdentity());
    expect(owners[1]).toBe(outerRoot.getElementIdentity());
    expect(owners[2]).toBe(innerRoot.getElementIdentity());
    expect(owners[3]).toBe(innerRoot.getElementIdentity());
  } finally {
    outerRoot.releasePointerOwnership();
    innerRoot.releasePointerOwnership();
    outerListeners.disconnect();
    innerListeners.disconnect();
    outerRoot.detach();
    innerRoot.detach();
  }
});

it.each(["connected", "disconnected", "reparented"])(
  "keeps the in-flight snapshot on replacement when %s",
  (placement) => {
    const outer = document.createElement("div");
    const inner = document.createElement("div");
    outer.append(inner);
    if (placement === "connected") {
      document.body.append(outer);
    }
    const outerRoot = new BrowserInputRoot(outer);
    const innerRoot = new BrowserInputRoot(inner);
    const owners: Array<object | undefined> = [];
    const groups = [
      { type: "pointermove", target: "surface", capture: true, passive: false },
    ] as const;
    const second = new BrowserEventListeners((_group, _root, _capture, _id, control) => {
      owners.push(control.getPointerOwner());
    }, []);
    const first = new BrowserEventListeners((_group, _root, _capture, _id, control) => {
      owners.push(control.getPointerOwner());
      first.disconnect();
      claimPointerOwner(document, innerRoot.getElementIdentity());
      second.connect(groups, testInputRoots(new Set([inner])));
    }, []);
    try {
      first.connect(groups, testInputRoots(new Set([outer])));
      if (placement === "reparented") {
        const wrapper = document.createElement("div");
        wrapper.append(outer);
      }
      claimPointerOwner(document, outerRoot.getElementIdentity());
      const move = new MouseEvent("pointermove", { bubbles: true });
      inner.dispatchEvent(move);
      expect(owners).toHaveLength(2);
      expect(owners[0]).toBe(outerRoot.getElementIdentity());
      expect(owners[1]).toBe(outerRoot.getElementIdentity());
      inner.dispatchEvent(move);
      expect(owners[2]).toBe(innerRoot.getElementIdentity());
    } finally {
      outerRoot.releasePointerOwnership();
      innerRoot.releasePointerOwnership();
      first.disconnect();
      second.disconnect();
      outerRoot.detach();
      innerRoot.detach();
      outer.remove();
    }
  },
);
