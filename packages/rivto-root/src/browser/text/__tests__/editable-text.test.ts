import { BrowserInputRoot } from "../../input/browser-input-root";
import { inputElementIdentity } from "../../input/input-element-identity";

it("synchronizes editable text and preserves a live caret only when requested", () => {
  const rootElement = document.createElement("div");
  rootElement.dataset.panel = "";
  const editable = document.createElement("div");
  editable.contentEditable = "true";
  rootElement.append(editable);
  document.body.append(rootElement);
  const root = new BrowserInputRoot(rootElement);
  const selection = jest.spyOn(document, "getSelection");
  try {
    const target = root.captureEditableTextByIdentity(
      inputElementIdentity(editable),
      "[data-panel]",
    )!;
    expect(target.synchronize("Before", false)).toBe(true);
    expect(selection).not.toHaveBeenCalled();
    const range = document.createRange();
    range.setStart(editable.firstChild!, 2);
    range.collapse(true);
    document.getSelection()!.removeAllRanges();
    document.getSelection()!.addRange(range);
    expect(target.synchronize("After", true)).toBe(true);
    expect(target.readText()).toBe("After");
    expect(document.getSelection()?.focusNode?.textContent).toBe("After");
    expect(document.getSelection()?.focusOffset).toBe(2);
    root.detach();
    expect(target.synchronize("stale", true)).toBe(false);
    expect(target.readText()).toBeUndefined();
    expect(editable.textContent).toBe("After");
  } finally {
    selection.mockRestore();
    root.detach();
    rootElement.remove();
    document.getSelection()?.removeAllRanges();
  }
});

it("rejects a host moved into a nested occurrence", () => {
  const rootElement = document.createElement("div");
  rootElement.dataset.panel = "";
  const nested = document.createElement("div");
  nested.dataset.panel = "";
  const editable = document.createElement("div");
  rootElement.append(editable, nested);
  const root = new BrowserInputRoot(rootElement);
  try {
    const target = root.captureEditableTextByIdentity(
      inputElementIdentity(editable),
      "[data-panel]",
    )!;
    nested.append(editable);
    expect(target.synchronize("stale", false)).toBe(false);
    expect(target.readText()).toBeUndefined();
    expect(
      root.captureEditableTextByIdentity(inputElementIdentity(editable), "[data-panel]"),
    ).toBeUndefined();
  } finally {
    root.detach();
  }
});

it("rejects text after the ownership check moves the host into a nested occurrence", () => {
  const rootElement = document.createElement("div");
  rootElement.dataset.panel = "";
  const nested = document.createElement("div");
  nested.dataset.panel = "";
  const editable = document.createElement("div");
  editable.textContent = "before";
  rootElement.append(editable, nested);
  let moveOnCheck = false;
  let checks = 0;
  const root = new BrowserInputRoot(rootElement, () => {
    if (moveOnCheck && ++checks === 2) {
      nested.append(editable);
    }
    return true;
  });
  try {
    const target = root.captureEditableTextByIdentity(
      inputElementIdentity(editable),
      "[data-panel]",
    )!;
    moveOnCheck = true;
    expect(target.readText()).toBeUndefined();
    expect(target.synchronize("stale", false)).toBe(false);
    expect(editable.textContent).toBe("before");
  } finally {
    root.detach();
  }
});

it("inserts text at an owned selection and refuses a foreign selection", () => {
  const rootElement = document.createElement("div");
  rootElement.dataset.panel = "";
  const editable = document.createElement("div");
  editable.tabIndex = 0;
  const outside = document.createElement("div");
  editable.textContent = "hello";
  outside.textContent = "outside";
  rootElement.append(editable);
  document.body.append(rootElement, outside);
  editable.focus();
  const root = new BrowserInputRoot(rootElement);
  const original = document.execCommand;
  document.execCommand = jest.fn(() => false);
  try {
    const target = root.captureEditableTextByIdentity(
      inputElementIdentity(editable),
      "[data-panel]",
    )!;
    const selection = document.getSelection()!;
    const range = document.createRange();
    range.setStart(editable.firstChild!, 1);
    range.setEnd(editable.firstChild!, 4);
    selection.removeAllRanges();
    selection.addRange(range);
    expect(target.insertText("\n")).toBe(true);
    expect(editable.textContent).toBe("h\no");
    expect(selection.isCollapsed).toBe(true);
    range.selectNodeContents(outside);
    selection.removeAllRanges();
    selection.addRange(range);
    expect(target.insertText("wrong")).toBe(false);
    expect(outside.textContent).toBe("outside");
    root.detach();
    expect(target.readRenderedText()).toBeUndefined();
    expect(target.insertText("stale")).toBe(false);
  } finally {
    document.execCommand = original;
    root.detach();
    rootElement.remove();
    outside.remove();
    document.getSelection()?.removeAllRanges();
  }
});

it("does not fall back to range mutation when native insertion detaches the Root", () => {
  const rootElement = document.createElement("div");
  rootElement.dataset.panel = "";
  const editable = document.createElement("div");
  editable.tabIndex = 0;
  editable.textContent = "before";
  rootElement.append(editable);
  document.body.append(rootElement);
  editable.focus();
  const root = new BrowserInputRoot(rootElement);
  const original = document.execCommand;
  document.execCommand = jest.fn(() => {
    root.detach();
    return false;
  });
  try {
    const target = root.captureEditableTextByIdentity(
      inputElementIdentity(editable),
      "[data-panel]",
    )!;
    const range = document.createRange();
    range.selectNodeContents(editable);
    const selection = document.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    expect(target.insertText("replacement")).toBe(false);
    expect(editable.textContent).toBe("before");
  } finally {
    document.execCommand = original;
    root.detach();
    rootElement.remove();
    document.getSelection()?.removeAllRanges();
  }
});

it("does not mutate a foreign selection installed during native insertion", () => {
  const rootElement = document.createElement("div");
  rootElement.dataset.panel = "";
  const editable = document.createElement("div");
  editable.tabIndex = 0;
  const outside = document.createElement("div");
  editable.textContent = "before";
  outside.textContent = "outside";
  rootElement.append(editable);
  document.body.append(rootElement, outside);
  editable.focus();
  const root = new BrowserInputRoot(rootElement);
  const original = document.execCommand;
  const selection = document.getSelection()!;
  document.execCommand = jest.fn(() => {
    const range = document.createRange();
    range.selectNodeContents(outside);
    selection.removeAllRanges();
    selection.addRange(range);
    return false;
  });
  try {
    const target = root.captureEditableTextByIdentity(
      inputElementIdentity(editable),
      "[data-panel]",
    )!;
    const range = document.createRange();
    range.selectNodeContents(editable);
    selection.removeAllRanges();
    selection.addRange(range);
    expect(target.insertText("wrong")).toBe(false);
    expect(outside.textContent).toBe("outside");
    expect(editable.textContent).toBe("before");
  } finally {
    document.execCommand = original;
    root.detach();
    rootElement.remove();
    outside.remove();
    selection.removeAllRanges();
  }
});

it("prefers the browser's native insertion path for label text", () => {
  const rootElement = document.createElement("div");
  rootElement.dataset.panel = "";
  const editable = document.createElement("div");
  editable.tabIndex = 0;
  editable.textContent = "before";
  rootElement.append(editable);
  document.body.append(rootElement);
  editable.focus();
  const root = new BrowserInputRoot(rootElement);
  const original = document.execCommand;
  const insert = jest.fn(() => true);
  document.execCommand = insert;
  try {
    const target = root.captureEditableTextByIdentity(
      inputElementIdentity(editable),
      "[data-panel]",
    )!;
    const range = document.createRange();
    range.selectNodeContents(editable);
    const selection = document.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    expect(target.insertText("\n")).toBe(true);
    expect(insert).toHaveBeenCalledWith("insertText", false, "\n");
  } finally {
    document.execCommand = original;
    root.detach();
    rootElement.remove();
    document.getSelection()?.removeAllRanges();
  }
});

it("does not invoke native insertion when another editable owns focus", () => {
  const rootElement = document.createElement("div");
  rootElement.dataset.panel = "";
  const editable = document.createElement("div");
  const outside = document.createElement("div");
  outside.tabIndex = 0;
  rootElement.append(editable);
  document.body.append(rootElement, outside);
  const root = new BrowserInputRoot(rootElement);
  const original = document.execCommand;
  const insert = jest.fn(() => true);
  document.execCommand = insert;
  try {
    const target = root.captureEditableTextByIdentity(
      inputElementIdentity(editable),
      "[data-panel]",
    )!;
    outside.focus();
    document.getSelection()?.removeAllRanges();
    expect(target.insertText("wrong")).toBe(false);
    expect(insert).not.toHaveBeenCalled();
  } finally {
    document.execCommand = original;
    root.detach();
    rootElement.remove();
    outside.remove();
  }
});
