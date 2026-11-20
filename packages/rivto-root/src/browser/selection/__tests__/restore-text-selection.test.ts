import { BrowserInputRoot } from "../../input/browser-input-root";

const query = {
  ownerSelector: "[data-owner]",
  ownerAttribute: "data-owner",
  contentSelector: "[data-content]",
  boundarySelector: "[data-editor]",
};

it("restores reverse endpoints across owned content without crossing nested occurrences", () => {
  const rootElement = document.createElement("div");
  rootElement.dataset.editor = "";
  rootElement.innerHTML =
    '<div data-editor><div data-owner="last"><span data-content>Foreign</span></div></div><div data-owner="first"><span data-content>First</span></div><div data-owner="last"><span data-content tabindex="0">Last</span></div>';
  document.body.append(rootElement);
  const css = Object.getOwnPropertyDescriptor(globalThis, "CSS");
  Object.defineProperty(globalThis, "CSS", {
    configurable: true,
    value: { escape: (value: string) => value },
  });
  const root = new BrowserInputRoot(rootElement);
  const mount = jest.fn();
  try {
    expect(
      root.restoreTextSelection(
        query,
        {
          anchor: { ownerId: "last", offset: 3 },
          focus: { ownerId: "first", offset: 1 },
        },
        mount,
        () => true,
      ),
    ).toBe(true);
    const selection = document.getSelection()!;
    expect(selection.anchorNode?.textContent).toBe("Last");
    expect(selection.anchorOffset).toBe(3);
    expect(selection.focusNode?.textContent).toBe("First");
    expect(selection.focusOffset).toBe(1);
    expect(mount).not.toHaveBeenCalled();
  } finally {
    root.detach();
    document.getSelection()?.removeAllRanges();
    rootElement.remove();
    if (css) {
      Object.defineProperty(globalThis, "CSS", css);
    } else {
      Reflect.deleteProperty(globalThis, "CSS");
    }
  }
});

it("mounts missing owners but does not remount contentless owners", () => {
  const rootElement = document.createElement("div");
  rootElement.dataset.editor = "";
  rootElement.innerHTML = '<div data-owner="structural"></div>';
  const css = Object.getOwnPropertyDescriptor(globalThis, "CSS");
  Object.defineProperty(globalThis, "CSS", {
    configurable: true,
    value: { escape: (value: string) => value },
  });
  const root = new BrowserInputRoot(rootElement);
  const mount = jest.fn((id: string) => {
    rootElement.insertAdjacentHTML(
      "beforeend",
      `<div data-owner="${id}"><span data-content>Text</span></div>`,
    );
  });
  try {
    const position = { ownerId: "structural", offset: 0 };
    expect(
      root.restoreTextSelection(query, { anchor: position, focus: position }, mount, () => true),
    ).toBe(false);
    expect(mount).not.toHaveBeenCalled();
    const missing = { ownerId: "missing", offset: 1 };
    expect(
      root.restoreTextSelection(query, { anchor: missing, focus: missing }, mount, () => true),
    ).toBe(true);
    expect(mount).toHaveBeenCalledTimes(1);
    expect(mount).toHaveBeenCalledWith("missing");
  } finally {
    root.detach();
    document.getSelection()?.removeAllRanges();
    if (css) {
      Object.defineProperty(globalThis, "CSS", css);
    } else {
      Reflect.deleteProperty(globalThis, "CSS");
    }
  }
});

it("falls back to a document-ordered range when directed restoration is rejected", () => {
  const element = document.createElement("div");
  element.dataset.editor = "";
  element.innerHTML = '<div data-owner="one"><span data-content>abcd</span></div>';
  document.body.append(element);
  const css = Object.getOwnPropertyDescriptor(globalThis, "CSS");
  Object.defineProperty(globalThis, "CSS", {
    configurable: true,
    value: { escape: (value: string) => value },
  });
  const root = new BrowserInputRoot(element);
  const selection = document.getSelection()!;
  const reject = jest.spyOn(selection, "setBaseAndExtent").mockImplementation(() => {
    throw new Error("directed selection rejected");
  });
  try {
    expect(
      root.restoreTextSelection(
        query,
        { anchor: { ownerId: "one", offset: 3 }, focus: { ownerId: "one", offset: 1 } },
        jest.fn(),
        () => true,
      ),
    ).toBe(true);
    expect(selection.toString()).toBe("bc");
    expect(selection.anchorOffset).toBe(1);
    expect(selection.focusOffset).toBe(3);
  } finally {
    reject.mockRestore();
    selection.removeAllRanges();
    root.detach();
    element.remove();
    if (css) {
      Object.defineProperty(globalThis, "CSS", css);
    } else {
      Reflect.deleteProperty(globalThis, "CSS");
    }
  }
});
