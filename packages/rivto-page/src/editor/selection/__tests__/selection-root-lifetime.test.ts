import { attachTestRoot } from "../../../test-utils/attach-test-root";
import { BrowserInputRoot, getBrowserElementIdentity } from "@chulane/rivto-root/browser";
import { BlockEditorController } from "../../block-editor-controller";
import { TestBlockEditorAdapter } from "../../../test-utils/test-block-editor-adapter";
import { BlockPointerHitTest } from "../block-pointer-hit-test";

it("discards a structural hit when its Root detaches during browser hit testing", () => {
  const editor = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  root.innerHTML = '<div data-block-id="first"></div>';
  const occurrence = new BrowserInputRoot(root);
  const previous = Object.getOwnPropertyDescriptor(document, "elementFromPoint");
  Object.defineProperty(document, "elementFromPoint", {
    configurable: true,
    value: () => {
      occurrence.detach();
      return root.firstElementChild;
    },
  });
  const detach = editor.attach(occurrence);
  try {
    expect(editor.browserSelection.blockIdAtPoint(10, 10)).toBeUndefined();
  } finally {
    detach();
    editor.destroy();
    if (previous) {
      Object.defineProperty(document, "elementFromPoint", previous);
    } else {
      Reflect.deleteProperty(document, "elementFromPoint");
    }
  }
});

it("does not inspect a hit after the Page attachment ends during its Root check", () => {
  const editor = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
  const root = document.createElement("div");
  const occurrence = new BrowserInputRoot(root);
  const detach = editor.attach(occurrence);
  const check = jest.spyOn(occurrence, "isAttached").mockImplementationOnce(() => {
    detach();
    return true;
  });
  const hit = jest.spyOn(BlockPointerHitTest.prototype, "readBlockIdAtPoint");
  try {
    expect(editor.browserSelection.blockIdAtPoint(10, 10)).toBeUndefined();
    expect(hit).not.toHaveBeenCalled();
  } finally {
    check.mockRestore();
    hit.mockRestore();
    detach();
    occurrence.detach();
    editor.destroy();
  }
});

it("uses the borrowed Root to clear selection and focus structural selection", () => {
  const editor = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
  const root = document.createElement("div");
  document.body.append(root);
  const css = Object.getOwnPropertyDescriptor(globalThis, "CSS");
  Object.defineProperty(globalThis, "CSS", {
    configurable: true,
    value: { escape: (id: string) => id },
  });
  const occurrence = new BrowserInputRoot(root);
  const detach = editor.attach(occurrence);
  const clear = jest.spyOn(occurrence, "clearSelection");
  const focus = jest.spyOn(occurrence, "focus");
  try {
    expect(editor.browserSelection.focusBlockSelection("missing")).toBe(true);
    expect(clear).toHaveBeenCalledTimes(1);
    expect(focus).toHaveBeenCalledTimes(1);
  } finally {
    clear.mockRestore();
    focus.mockRestore();
    detach();
    occurrence.detach();
    editor.destroy();
    root.remove();
    if (css) {
      Object.defineProperty(globalThis, "CSS", css);
    } else {
      Reflect.deleteProperty(globalThis, "CSS");
    }
  }
});

it("does not focus structural selection when clearing detaches its Root", () => {
  const editor = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
  const root = document.createElement("div");
  document.body.append(root);
  const occurrence = new BrowserInputRoot(root);
  const detach = editor.attach(occurrence);
  const clear = jest
    .spyOn(occurrence, "clearSelection")
    .mockImplementation(() => occurrence.detach());
  const focus = jest.spyOn(occurrence, "focus");
  try {
    expect(editor.browserSelection.focusBlockSelection("missing")).toBe(false);
    expect(clear).toHaveBeenCalledTimes(1);
    expect(focus).not.toHaveBeenCalled();
  } finally {
    clear.mockRestore();
    focus.mockRestore();
    detach();
    editor.destroy();
    root.remove();
  }
});

it("invalidates selection operations when the borrowed occurrence root detaches", () => {
  const editor = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  root.innerHTML = '<div data-block-id="first"><span data-block-content>First</span></div>';
  document.body.append(root);
  const css = Object.getOwnPropertyDescriptor(globalThis, "CSS");
  Object.defineProperty(globalThis, "CSS", {
    configurable: true,
    value: { escape: (id: string) => id },
  });
  const occurrence = new BrowserInputRoot(root);
  const detach = editor.attach(occurrence);
  try {
    const gesture = editor.browserSelection.createTextSelectionGesture();
    expect(gesture).toBeDefined();
    expect(editor.browserSelection.focusBlock({ blockId: "first", offset: 1 })).toBe(
      "focus-requested",
    );
    occurrence.detach();
    expect(editor.browserSelection.createTextSelectionGesture()).toBeUndefined();
    expect(editor.browserSelection.focusBlock({ blockId: "first", offset: 1 })).toBe("detached");
    expect(editor.browserSelection.readEditorDOMSelection()).toBeUndefined();
    expect(gesture?.readAnchor(0, 0)).toBeUndefined();
  } finally {
    detach();
    editor.destroy();
    root.remove();
    if (css) {
      Object.defineProperty(globalThis, "CSS", css);
    } else {
      Reflect.deleteProperty(globalThis, "CSS");
    }
  }
});

it("does not focus or restore an endpoint when mounting detaches its Root", () => {
  const editor = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  document.body.append(root);
  const css = Object.getOwnPropertyDescriptor(globalThis, "CSS");
  Object.defineProperty(globalThis, "CSS", {
    configurable: true,
    value: { escape: (id: string) => id },
  });
  const occurrence = new BrowserInputRoot(root);
  const detach = editor.attach(occurrence);
  const focus = jest.spyOn(HTMLElement.prototype, "focus");
  const mountBlocks = jest.fn(() => {
    occurrence.detach();
    root.innerHTML = '<div data-block-id="first"><span data-block-content>First</span></div>';
  });
  const releaseView = editor.virtualization.register(getBrowserElementIdentity(root), {
    mountBlocks,
    observeRoot: () => () => {},
  });
  try {
    expect(
      editor.browserSelection.restoreEditorDOMSelection({
        type: "selection",
        blocks: [{ id: "first", start: 0, end: 1 }],
        anchorBlockId: "first",
        focusBlockId: "first",
      }),
    ).toBe(false);
    expect(mountBlocks).toHaveBeenCalledTimes(1);
    expect(focus).not.toHaveBeenCalled();
  } finally {
    releaseView();
    focus.mockRestore();
    detach();
    editor.destroy();
    root.remove();
    if (css) {
      Object.defineProperty(globalThis, "CSS", css);
    } else {
      Reflect.deleteProperty(globalThis, "CSS");
    }
  }
});

it("releases only an owned Root if selection attachment fails", () => {
  const editor = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
  const root = document.createElement("div");
  const borrowed = new BrowserInputRoot(root);
  const attach = jest.spyOn(editor.browserSelection, "attach").mockImplementation(() => {
    throw new Error("selection setup failed");
  });
  const detach = jest.spyOn(BrowserInputRoot.prototype, "detach");
  try {
    expect(() => attachTestRoot(editor, root)).toThrow("selection setup failed");
    expect(detach).toHaveBeenCalledTimes(1);
    expect(() => editor.attach(borrowed)).toThrow("selection setup failed");
    expect(detach).toHaveBeenCalledTimes(1);
    expect(borrowed.isAttached()).toBe(true);
  } finally {
    attach.mockRestore();
    detach.mockRestore();
    borrowed.detach();
    editor.destroy();
  }
});

it("does not restore a caret when focus detaches the borrowed occurrence", () => {
  const editor = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  root.innerHTML = '<div data-block-id="first"><span data-block-content>First</span></div>';
  const outside = document.createElement("div");
  outside.textContent = "Outside";
  document.body.append(root, outside);
  const css = Object.getOwnPropertyDescriptor(globalThis, "CSS");
  Object.defineProperty(globalThis, "CSS", {
    configurable: true,
    value: { escape: (id: string) => id },
  });
  const occurrence = new BrowserInputRoot(root);
  const detach = editor.attach(occurrence);
  const content = root.querySelector<HTMLElement>("[data-block-content]")!;
  const focus = jest.spyOn(content, "focus").mockImplementation(() => occurrence.detach());
  const selection = document.getSelection()!;
  selection.setBaseAndExtent(outside.firstChild!, 2, outside.firstChild!, 2);
  try {
    expect(editor.browserSelection.focusBlock({ blockId: "first", offset: 1 })).toBe("detached");
    expect(selection.focusNode).toBe(outside.firstChild);
    expect(selection.focusOffset).toBe(2);
  } finally {
    focus.mockRestore();
    detach();
    editor.destroy();
    selection.removeAllRanges();
    root.remove();
    outside.remove();
    if (css) {
      Object.defineProperty(globalThis, "CSS", css);
    } else {
      Reflect.deleteProperty(globalThis, "CSS");
    }
  }
});

it("does not restore a caret when focus detaches Page but leaves the borrowed Root active", () => {
  const editor = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  root.innerHTML = '<div data-block-id="first"><span data-block-content>First</span></div>';
  const outside = document.createElement("div");
  outside.textContent = "Outside";
  document.body.append(root, outside);
  const css = Object.getOwnPropertyDescriptor(globalThis, "CSS");
  Object.defineProperty(globalThis, "CSS", {
    configurable: true,
    value: { escape: (id: string) => id },
  });
  const occurrence = new BrowserInputRoot(root);
  const detach = editor.attach(occurrence);
  const content = root.querySelector<HTMLElement>("[data-block-content]")!;
  const focus = jest.spyOn(content, "focus").mockImplementation(() => detach());
  const selection = document.getSelection()!;
  selection.setBaseAndExtent(outside.firstChild!, 2, outside.firstChild!, 2);
  try {
    expect(editor.browserSelection.focusBlock({ blockId: "first", offset: 1 })).toBe("detached");
    expect(occurrence.isAttached()).toBe(true);
    expect(selection.focusNode).toBe(outside.firstChild);
    expect(selection.focusOffset).toBe(2);
  } finally {
    focus.mockRestore();
    detach();
    occurrence.detach();
    editor.destroy();
    selection.removeAllRanges();
    root.remove();
    outside.remove();
    if (css) {
      Object.defineProperty(globalThis, "CSS", css);
    } else {
      Reflect.deleteProperty(globalThis, "CSS");
    }
  }
});

it("does not restore a range when focus detaches Page but leaves its Root active", () => {
  const editor = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  root.innerHTML = '<div data-block-id="first"><span data-block-content>First</span></div>';
  const outside = document.createElement("div");
  outside.textContent = "Outside";
  document.body.append(root, outside);
  const css = Object.getOwnPropertyDescriptor(globalThis, "CSS");
  Object.defineProperty(globalThis, "CSS", {
    configurable: true,
    value: { escape: (id: string) => id },
  });
  const occurrence = new BrowserInputRoot(root);
  const detach = editor.attach(occurrence);
  const content = root.querySelector<HTMLElement>("[data-block-content]")!;
  const focus = jest.spyOn(content, "focus").mockImplementation(() => detach());
  const native = document.getSelection()!;
  native.setBaseAndExtent(outside.firstChild!, 2, outside.firstChild!, 2);
  try {
    expect(
      editor.browserSelection.restoreEditorDOMSelection({
        type: "selection",
        blocks: [{ id: "first", start: 1, end: 3 }],
        anchorBlockId: "first",
        focusBlockId: "first",
      }),
    ).toBe(false);
    expect(occurrence.isAttached()).toBe(true);
    expect(native.focusNode).toBe(outside.firstChild);
    expect(native.focusOffset).toBe(2);
  } finally {
    focus.mockRestore();
    detach();
    occurrence.detach();
    editor.destroy();
    native.removeAllRanges();
    root.remove();
    outside.remove();
    if (css) {
      Object.defineProperty(globalThis, "CSS", css);
    } else {
      Reflect.deleteProperty(globalThis, "CSS");
    }
  }
});
