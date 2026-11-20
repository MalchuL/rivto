import { BrowserInputRoot } from "../../input/browser-input-root";
import { inputElementIdentity } from "../../input/input-element-identity";

it("focuses an occurrence-owned region and places the caret at the browser hit", () => {
  const surface = document.createElement("div");
  const editable = document.createElement("div");
  editable.contentEditable = "true";
  editable.textContent = "hello";
  surface.append(editable);
  document.body.append(surface);
  const occurrence = new BrowserInputRoot(surface);
  const region = occurrence.captureRegionByIdentity(inputElementIdentity(editable))!;
  const selection = document.getSelection()!;
  const set = jest.spyOn(selection, "setBaseAndExtent");
  const previous = Object.getOwnPropertyDescriptor(document, "caretPositionFromPoint");
  Object.defineProperty(document, "caretPositionFromPoint", {
    configurable: true,
    value: () => ({ offsetNode: editable.firstChild, offset: 3 }),
  });
  try {
    expect(region.placeCaretAtPoint(10, 20)).toBe(true);
    expect(set).toHaveBeenCalledWith(editable.firstChild, 3, editable.firstChild, 3);
    occurrence.detach();
    expect(region.placeCaretAtPoint(10, 20)).toBe(false);
    expect(set).toHaveBeenCalledTimes(1);
  } finally {
    if (previous) {
      Object.defineProperty(document, "caretPositionFromPoint", previous);
    } else {
      Reflect.deleteProperty(document, "caretPositionFromPoint");
    }
    set.mockRestore();
    occurrence.detach();
    surface.remove();
  }
});

it("does not change selection when focusing detaches the occurrence", () => {
  const surface = document.createElement("div");
  const editable = document.createElement("div");
  surface.append(editable);
  const occurrence = new BrowserInputRoot(surface);
  const region = occurrence.captureRegionByIdentity(inputElementIdentity(editable))!;
  const focus = jest.spyOn(editable, "focus").mockImplementation(() => occurrence.detach());
  const selection = jest.spyOn(document, "getSelection");
  try {
    expect(region.placeCaretAtPoint(10, 20)).toBe(false);
    expect(selection).not.toHaveBeenCalled();
  } finally {
    focus.mockRestore();
    selection.mockRestore();
    occurrence.detach();
  }
});

it("collapses at the host start if the browser rejects the requested caret", () => {
  const surface = document.createElement("div");
  const editable = document.createElement("div");
  editable.contentEditable = "true";
  editable.textContent = "hello";
  surface.append(editable);
  document.body.append(surface);
  const occurrence = new BrowserInputRoot(surface);
  const region = occurrence.captureRegionByIdentity(inputElementIdentity(editable))!;
  const selection = document.getSelection()!;
  const set = jest.spyOn(selection, "setBaseAndExtent").mockImplementation(() => {
    throw new Error("unsupported caret");
  });
  const previous = Object.getOwnPropertyDescriptor(document, "caretPositionFromPoint");
  Object.defineProperty(document, "caretPositionFromPoint", {
    configurable: true,
    value: () => ({ offsetNode: editable.firstChild, offset: 3 }),
  });
  try {
    expect(region.placeCaretAtPoint(10, 20)).toBe(false);
    expect(selection.anchorNode).toBe(editable);
    expect(selection.anchorOffset).toBe(0);
  } finally {
    if (previous) {
      Object.defineProperty(document, "caretPositionFromPoint", previous);
    } else {
      Reflect.deleteProperty(document, "caretPositionFromPoint");
    }
    set.mockRestore();
    occurrence.detach();
    surface.remove();
  }
});
