import { BrowserInputRoot } from "../browser-input-root";
import { captureBrowserInputHit, readBrowserInputHit } from "../input-hit";
import { inputElementIdentity } from "../input-element-identity";

it("reuses hits in the captured document and captures cross-occurrence points", () => {
  const element = document.createElement("div");
  const other = document.createElement("div");
  document.body.append(element, other);
  const root = new BrowserInputRoot(element);
  const captured = root.captureDocument()!;
  const hint = captureBrowserInputHit(other);
  const previous = Object.getOwnPropertyDescriptor(document, "elementFromPoint");
  const hitTest = jest.fn(() => other);
  Object.defineProperty(document, "elementFromPoint", { configurable: true, value: hitTest });
  try {
    expect(captured.captureHit(1, 2, hint)).toBe(hint);
    expect(hint.isCurrent()).toBe(true);
    other.setAttribute("data-receiver", "");
    expect(hint.getNearestAncestorIdentity("[data-receiver]")).toBe(inputElementIdentity(other));
    expect(hitTest).not.toHaveBeenCalled();
    const foreign = document.implementation.createHTMLDocument("foreign");
    const foreignHit = captureBrowserInputHit(foreign.body);
    const hit = captured.captureHit(1, 2, foreignHit);
    expect(hit).not.toBe(hint);
    expect(readBrowserInputHit(hit)).toBe(other);
    expect(hitTest).toHaveBeenCalledWith(1, 2);
    hit?.release();
    expect(readBrowserInputHit(hit)).toBeUndefined();
    expect(hit?.isCurrent()).toBe(false);
    expect(readBrowserInputHit(hint)).toBe(other);
    foreignHit.release();
  } finally {
    hint.release();
    root.detach();
    element.remove();
    other.remove();
    if (previous) {
      Object.defineProperty(document, "elementFromPoint", previous);
    } else {
      Reflect.deleteProperty(document, "elementFromPoint");
    }
  }
});

it("does not return an ancestor identity if the hit disconnects during lookup", () => {
  const target = document.createElement("div");
  document.body.append(target);
  const hit = captureBrowserInputHit(target);
  jest.spyOn(target, "closest").mockImplementation(() => {
    target.remove();
    return target;
  });
  try {
    expect(hit.getNearestAncestorIdentity("div")).toBeUndefined();
    hit.release();
    expect(hit.getNearestAncestorIdentity("div")).toBeUndefined();
  } finally {
    hit.release();
    target.remove();
  }
});

it("rejects a hit when the occurrence moves documents during hit testing", () => {
  const element = document.createElement("div");
  document.body.append(element);
  const root = new BrowserInputRoot(element);
  const captured = root.captureDocument()!;
  const foreign = document.implementation.createHTMLDocument("foreign");
  const previous = Object.getOwnPropertyDescriptor(document, "elementFromPoint");
  Object.defineProperty(document, "elementFromPoint", {
    configurable: true,
    value: () => {
      foreign.body.append(element);
      return element;
    },
  });
  try {
    expect(captured.captureHit(1, 2)).toBeUndefined();
    expect(captured.isCurrent()).toBe(false);
    root.detach();
    expect(root.captureDocument()).toBeUndefined();
  } finally {
    root.detach();
    element.remove();
    if (previous) {
      Object.defineProperty(document, "elementFromPoint", previous);
    } else {
      Reflect.deleteProperty(document, "elementFromPoint");
    }
  }
});
