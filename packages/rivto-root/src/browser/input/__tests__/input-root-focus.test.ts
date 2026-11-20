import { BrowserInputRoot } from "../browser-input-root";
import { inputElementIdentity } from "../input-element-identity";
import { RegionIdentity } from "../../../events/types";

it("reports focus in the owning occurrence and rejects detached registrations", () => {
  const element = document.createElement("div");
  const child = document.createElement("button");
  const outside = document.createElement("button");
  element.tabIndex = -1;
  element.append(child);
  document.body.append(element, outside);
  let current = true;
  const root = new BrowserInputRoot(element, () => current);
  try {
    outside.focus();
    expect(root.hasFocus()).toBe(false);
    element.focus();
    expect(root.hasFocus()).toBe(true);
    child.focus();
    expect(root.hasFocus()).toBe(true);
    current = false;
    expect(root.hasFocus()).toBe(false);
    current = true;
    expect(root.hasFocus()).toBe(true);
    root.detach();
    expect(root.hasFocus()).toBe(false);
    const replacement = new BrowserInputRoot(element);
    expect(replacement.hasFocus()).toBe(true);
    expect(root.hasFocus()).toBe(false);
    replacement.detach();
  } finally {
    element.remove();
    outside.remove();
  }
});

it("defaults to preventing scroll and permits it when requested", () => {
  const element = document.createElement("div");
  const root = new BrowserInputRoot(element);
  const focus = jest.spyOn(element, "focus");
  try {
    root.focus();
    root.focus({ preventScroll: false });
    expect(focus).toHaveBeenNthCalledWith(1, { preventScroll: true });
    expect(focus).toHaveBeenNthCalledWith(2, { preventScroll: false });
    root.detach();
    root.focus({ preventScroll: false });
    expect(focus).toHaveBeenCalledTimes(2);
  } finally {
    focus.mockRestore();
    root.detach();
  }
});

it("focuses only a connected region owned by the current Root", () => {
  const element = document.createElement("div");
  const owned = document.createElement("button");
  const foreign = document.createElement("button");
  element.append(owned);
  document.body.append(element, foreign);
  const root = new BrowserInputRoot(element);
  const ownedFocus = jest.spyOn(owned, "focus");
  const foreignFocus = jest.spyOn(foreign, "focus");
  try {
    expect(root.focusRegionByIdentity(inputElementIdentity(owned))).toBe(true);
    expect(ownedFocus).toHaveBeenCalledWith({ preventScroll: true });
    expect(root.focusRegionByIdentity(inputElementIdentity(foreign))).toBe(false);
    expect(foreignFocus).not.toHaveBeenCalled();
    owned.remove();
    expect(root.focusRegionByIdentity(inputElementIdentity(owned))).toBe(false);
  } finally {
    ownedFocus.mockRestore();
    foreignFocus.mockRestore();
    root.detach();
    element.remove();
    foreign.remove();
  }
});

it("reports a stale focus request when its handler detaches the Root", () => {
  const element = document.createElement("div");
  const target = document.createElement("button");
  element.append(target);
  document.body.append(element);
  const root = new BrowserInputRoot(element);
  target.addEventListener("focus", () => root.detach(), { once: true });
  try {
    expect(root.focusRegionByIdentity(inputElementIdentity(target))).toBe(false);
  } finally {
    root.detach();
    element.remove();
  }
});

it("does not focus a region inside a nested occurrence boundary", () => {
  const element = document.createElement("div");
  element.dataset.panel = "";
  const nested = document.createElement("div");
  nested.dataset.panel = "";
  const target = document.createElement("button");
  nested.append(target);
  element.append(nested);
  document.body.append(element);
  const root = new BrowserInputRoot(element);
  const focus = jest.spyOn(target, "focus");
  try {
    expect(root.focusRegionByIdentity(inputElementIdentity(target), "[data-panel]")).toBe(false);
    expect(focus).not.toHaveBeenCalled();
  } finally {
    focus.mockRestore();
    root.detach();
    element.remove();
  }
});

it("allows focus of an owned region to use the browser's scrolling behavior", () => {
  const element = document.createElement("div");
  const handle = document.createElement("button");
  element.append(handle);
  document.body.append(element);
  const root = new BrowserInputRoot(element);
  const focus = jest.spyOn(handle, "focus");
  try {
    expect(
      root.focusRegionByIdentity(inputElementIdentity(handle), undefined, {
        preventScroll: false,
      }),
    ).toBe(true);
    expect(focus).toHaveBeenCalledWith({ preventScroll: false });
  } finally {
    focus.mockRestore();
    root.detach();
    element.remove();
  }
});

it("rejects a focus request when reading its options detaches the Root", () => {
  const element = document.createElement("div");
  const handle = document.createElement("button");
  element.append(handle);
  document.body.append(element);
  const root = new BrowserInputRoot(element);
  const focus = jest.spyOn(handle, "focus");
  try {
    const options = {
      /**
       * Simulates a caller ending the attachment while focus options are read.
       *
       * @returns False after detaching the occurrence.
       */
      get preventScroll() {
        root.detach();
        return false;
      },
    };
    expect(root.focusRegionByIdentity(inputElementIdentity(handle), undefined, options)).toBe(
      false,
    );
    expect(focus).not.toHaveBeenCalled();
  } finally {
    focus.mockRestore();
    root.detach();
    element.remove();
  }
});

it("does not read focus options after the Root is detached", () => {
  const element = document.createElement("div");
  const root = new BrowserInputRoot(element);
  root.detach();
  const read = jest.fn();
  const options = {
    /**
     * Records an option read that must not occur after detachment.
     *
     * @returns False when read by an attached Root.
     */
    get preventScroll() {
      read();
      return false;
    },
  };
  expect(root.focusRegionByIdentity(new RegionIdentity(), undefined, options)).toBe(false);
  expect(read).not.toHaveBeenCalled();
});
