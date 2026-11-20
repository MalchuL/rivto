import { BrowserInputRoot } from "../../input/browser-input-root";

const query = {
  ownerSelector: "[data-owner]",
  ownerAttribute: "data-owner",
  contentSelector: "[data-content]",
  boundarySelector: "[data-editor]",
};

it("retains exact native endpoints while publishing portable positions", () => {
  const element = document.createElement("div");
  element.dataset.editor = "";
  element.innerHTML =
    '<div data-owner="first"><span data-content>First</span></div><div data-owner="second"><span data-content>Second</span></div>';
  document.body.append(element);
  const [first, second] = element.querySelectorAll<HTMLElement>("[data-content]");
  const hitDescriptor = Object.getOwnPropertyDescriptor(document, "elementFromPoint");
  const caretDescriptor = Object.getOwnPropertyDescriptor(document, "caretRangeFromPoint");
  const hit = jest.fn().mockReturnValueOnce(first).mockReturnValue(second);
  const caret = jest.fn((_x: number) => {
    const range = document.createRange();
    range.setStart(_x === 1 ? first.firstChild! : second.firstChild!, _x === 1 ? 1 : 2);
    return range;
  });
  Object.defineProperty(document, "elementFromPoint", { configurable: true, value: hit });
  Object.defineProperty(document, "caretRangeFromPoint", { configurable: true, value: caret });
  const root = new BrowserInputRoot(element);
  const gesture = root.createTextSelectionGesture(query, jest.fn(), () => true);
  try {
    expect(gesture.readAnchor(1, 2)).toEqual({ ownerId: "first", offset: 1 });
    expect(gesture.readHead(3, 4)).toEqual({ ownerId: "second", offset: 2 });
    expect(gesture.hasHead()).toBe(false);
    gesture.commitHead(true);
    expect(gesture.hasHead()).toBe(true);
    gesture.restore();
    expect(document.getSelection()?.anchorNode).toBe(first.firstChild);
    expect(document.getSelection()?.anchorOffset).toBe(1);
    expect(document.getSelection()?.focusNode).toBe(second.firstChild);
    expect(document.getSelection()?.focusOffset).toBe(2);
    expect(Object.values(gesture)).toEqual([]);
    gesture.commitHead(false);
    expect(gesture.hasHead()).toBe(false);
  } finally {
    root.detach();
    document.getSelection()?.removeAllRanges();
    element.remove();
    if (hitDescriptor) {
      Object.defineProperty(document, "elementFromPoint", hitDescriptor);
    } else {
      Reflect.deleteProperty(document, "elementFromPoint");
    }
    if (caretDescriptor) {
      Object.defineProperty(document, "caretRangeFromPoint", caretDescriptor);
    } else {
      Reflect.deleteProperty(document, "caretRangeFromPoint");
    }
  }
});

it.each([true, false])("mounts only an absent anchor owner, rendered=%s", (rendered) => {
  const element = document.createElement("div");
  element.dataset.editor = "";
  element.innerHTML =
    '<div data-owner="clicked"><span data-content>Clicked</span></div>' +
    (rendered ? '<div data-owner="card"><strong>Structural card</strong></div>' : "");
  document.body.append(element);
  const clicked = element.querySelector<HTMLElement>("[data-content]")!;
  const hitDescriptor = Object.getOwnPropertyDescriptor(document, "elementFromPoint");
  const caretDescriptor = Object.getOwnPropertyDescriptor(document, "caretRangeFromPoint");
  const css = Object.getOwnPropertyDescriptor(globalThis, "CSS");
  const range = document.createRange();
  range.setStart(clicked.firstChild!, 2);
  Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => clicked });
  Object.defineProperty(document, "caretRangeFromPoint", {
    configurable: true,
    value: () => range,
  });
  Object.defineProperty(globalThis, "CSS", {
    configurable: true,
    value: { escape: (id: string) => id },
  });
  const mount = jest.fn(() => {
    element.insertAdjacentHTML(
      "beforeend",
      '<div data-owner="card"><span data-content>Text</span></div>',
    );
  });
  const root = new BrowserInputRoot(element);
  const gesture = root.createTextSelectionGesture(query, mount, () => true);
  try {
    expect(gesture.readAnchor(1, 2)).toEqual({ ownerId: "clicked", offset: 2 });
    expect(gesture.setAnchor({ ownerId: "card", offset: 1 })).toBe(!rendered);
    expect(mount).toHaveBeenCalledTimes(rendered ? 0 : 1);
    if (!rendered) {
      gesture.commitHead(true);
      gesture.restore();
      expect(document.getSelection()?.anchorNode?.textContent).toBe("Text");
      expect(document.getSelection()?.focusNode).toBe(clicked.firstChild);
      expect(document.getSelection()?.focusOffset).toBe(2);
    }
  } finally {
    root.detach();
    document.getSelection()?.removeAllRanges();
    element.remove();
    if (hitDescriptor) {
      Object.defineProperty(document, "elementFromPoint", hitDescriptor);
    } else {
      Reflect.deleteProperty(document, "elementFromPoint");
    }
    if (caretDescriptor) {
      Object.defineProperty(document, "caretRangeFromPoint", caretDescriptor);
    } else {
      Reflect.deleteProperty(document, "caretRangeFromPoint");
    }
    if (css) {
      Object.defineProperty(globalThis, "CSS", css);
    } else {
      Reflect.deleteProperty(globalThis, "CSS");
    }
  }
});
