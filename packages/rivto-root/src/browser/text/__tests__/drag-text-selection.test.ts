import { BrowserInputRoot } from "../../input/browser-input-root";
import { inputElementIdentity } from "../../input/input-element-identity";

/**
 * Creates a pointer delivery for the captured-window selection tests.
 *
 * @param type - Pointer phase delivered to the window.
 * @param pointerId - Identity of the simulated pointer.
 * @param x - Horizontal coordinate used by the caret fixture.
 * @returns A browser event carrying the requested pointer data.
 */
function pointer(type: string, pointerId: number, x: number): MouseEvent {
  const event = new MouseEvent(type, { bubbles: true, clientX: x });
  Object.defineProperty(event, "pointerId", { value: pointerId });
  return event;
}

it("tracks only the accepted pointer and releases its listeners on completion", () => {
  const surface = document.createElement("div");
  const editable = document.createElement("div");
  editable.textContent = "hello";
  Object.defineProperty(editable, "isContentEditable", { value: true });
  surface.append(editable);
  document.body.append(surface);
  const occurrence = new BrowserInputRoot(surface);
  const region = occurrence.captureRegionByIdentity(inputElementIdentity(editable))!;
  const selection = document.getSelection()!;
  const set = jest.spyOn(selection, "setBaseAndExtent");
  const previous = Object.getOwnPropertyDescriptor(document, "caretPositionFromPoint");
  Object.defineProperty(document, "caretPositionFromPoint", {
    configurable: true,
    value: (x: number) => ({ offsetNode: editable.firstChild, offset: x > 5 ? 4 : 1 }),
  });
  const preventDefault = jest.fn();
  const onEnd = jest.fn();
  try {
    const release = region.beginEditableTextSelection(
      { clientX: 0, clientY: 0, pointerId: 1, preventDefault },
      onEnd,
    )!;
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenLastCalledWith(editable.firstChild, 1, editable.firstChild, 1);
    window.dispatchEvent(pointer("pointermove", 2, 10));
    expect(set).toHaveBeenCalledTimes(1);
    window.dispatchEvent(pointer("pointermove", 1, 10));
    expect(set).toHaveBeenLastCalledWith(editable.firstChild, 1, editable.firstChild, 4);
    window.dispatchEvent(pointer("pointerup", 1, 10));
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenLastCalledWith(editable.firstChild, 1, editable.firstChild, 4);
    release();
    expect(onEnd).toHaveBeenCalledTimes(1);
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

it("does not prevent input or notify completion when the caret hit is outside the host", () => {
  const surface = document.createElement("div");
  const editable = document.createElement("div");
  const outside = document.createElement("div");
  Object.defineProperty(editable, "isContentEditable", { value: true });
  surface.append(editable, outside);
  const occurrence = new BrowserInputRoot(surface);
  const region = occurrence.captureRegionByIdentity(inputElementIdentity(editable))!;
  const previous = Object.getOwnPropertyDescriptor(document, "caretPositionFromPoint");
  Object.defineProperty(document, "caretPositionFromPoint", {
    configurable: true,
    value: () => ({ offsetNode: outside, offset: 0 }),
  });
  const preventDefault = jest.fn();
  const onEnd = jest.fn();
  try {
    expect(
      region.beginEditableTextSelection(
        { clientX: 0, clientY: 0, pointerId: 1, preventDefault },
        onEnd,
      ),
    ).toBeUndefined();
    expect(preventDefault).not.toHaveBeenCalled();
    expect(onEnd).not.toHaveBeenCalled();
  } finally {
    if (previous) {
      Object.defineProperty(document, "caretPositionFromPoint", previous);
    } else {
      Reflect.deleteProperty(document, "caretPositionFromPoint");
    }
    occurrence.detach();
  }
});

it("stops tracking without writing selection after the occurrence detaches", () => {
  const surface = document.createElement("div");
  const editable = document.createElement("div");
  editable.textContent = "hello";
  Object.defineProperty(editable, "isContentEditable", { value: true });
  surface.append(editable);
  document.body.append(surface);
  const occurrence = new BrowserInputRoot(surface);
  const region = occurrence.captureRegionByIdentity(inputElementIdentity(editable))!;
  const selection = document.getSelection()!;
  const set = jest.spyOn(selection, "setBaseAndExtent");
  const previous = Object.getOwnPropertyDescriptor(document, "caretPositionFromPoint");
  Object.defineProperty(document, "caretPositionFromPoint", {
    configurable: true,
    value: () => ({ offsetNode: editable.firstChild, offset: 1 }),
  });
  const onEnd = jest.fn();
  try {
    const release = region.beginEditableTextSelection(
      { clientX: 0, clientY: 0, pointerId: 1, preventDefault: () => {} },
      onEnd,
    )!;
    occurrence.detach();
    set.mockClear();
    window.dispatchEvent(pointer("pointermove", 1, 10));
    expect(set).not.toHaveBeenCalled();
    expect(onEnd).toHaveBeenCalledTimes(1);
    release();
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

it("rolls back installed pointer listeners when a later listener fails", () => {
  const surface = document.createElement("div");
  const editable = document.createElement("div");
  editable.textContent = "hello";
  Object.defineProperty(editable, "isContentEditable", { value: true });
  surface.append(editable);
  document.body.append(surface);
  const occurrence = new BrowserInputRoot(surface);
  const region = occurrence.captureRegionByIdentity(inputElementIdentity(editable))!;
  const previous = Object.getOwnPropertyDescriptor(document, "caretPositionFromPoint");
  Object.defineProperty(document, "caretPositionFromPoint", {
    configurable: true,
    value: () => ({ offsetNode: editable.firstChild, offset: 1 }),
  });
  const originalAdd = window.addEventListener.bind(window);
  const add = jest
    .spyOn(window, "addEventListener")
    .mockImplementation((type, listener, options) => {
      if (type === "pointerup") {
        throw new Error("pointer setup failed");
      }
      originalAdd(type, listener, options);
    });
  const remove = jest.spyOn(window, "removeEventListener");
  const onEnd = jest.fn();
  try {
    expect(() =>
      region.beginEditableTextSelection(
        { clientX: 0, clientY: 0, pointerId: 1, preventDefault: () => {} },
        onEnd,
      ),
    ).toThrow("pointer setup failed");
    expect(remove).toHaveBeenCalledWith("pointermove", expect.any(Function));
    expect(onEnd).toHaveBeenCalledTimes(1);
  } finally {
    add.mockRestore();
    remove.mockRestore();
    if (previous) {
      Object.defineProperty(document, "caretPositionFromPoint", previous);
    } else {
      Reflect.deleteProperty(document, "caretPositionFromPoint");
    }
    occurrence.detach();
    surface.remove();
  }
});
