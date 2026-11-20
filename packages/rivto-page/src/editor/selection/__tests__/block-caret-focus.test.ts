import { attachTestRoot } from "../../../test-utils/attach-test-root";
import { BlockEditorController } from "../../block-editor-controller";
import { TestBlockEditorAdapter } from "../../../test-utils/test-block-editor-adapter";

it("focuses only editable content owned by the attached occurrence", () => {
  const editor = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  root.innerHTML =
    '<div data-rivto-block-editor><div data-block-id="text"><span data-block-content contenteditable="true">Foreign</span></div></div><div data-block-id="text"><span data-block-content contenteditable="true" tabindex="0">ab<strong>cd</strong></span></div><div data-block-id="structural"></div><div data-block-id="duplicate"></div><div data-block-id="duplicate"><span data-block-content>Later</span></div>';
  document.body.append(root);
  const css = Object.getOwnPropertyDescriptor(globalThis, "CSS");
  Object.defineProperty(globalThis, "CSS", {
    configurable: true,
    value: { escape: (id: string) => id },
  });
  const position = { blockId: "text", offset: 3 };
  const content = root.querySelectorAll<HTMLElement>("[data-block-content]")[1]!;
  const focus = jest.spyOn(content, "focus");
  try {
    expect(editor.browserSelection.focusBlock(position)).toBe("detached");
    const detach = attachTestRoot(editor, root);
    expect(editor.browserSelection.focusBlock({ blockId: "missing", offset: 0 })).toBe("unmounted");
    expect(editor.browserSelection.focusBlock({ blockId: "structural", offset: 0 })).toBe(
      "no-content",
    );
    expect(editor.browserSelection.focusBlock({ blockId: "duplicate", offset: 0 })).toBe(
      "no-content",
    );
    expect(editor.browserSelection.focusBlock(position)).toBe("focus-requested");
    expect(focus).toHaveBeenCalledWith();
    expect(document.activeElement).toBe(content);
    expect(document.getSelection()?.focusNode?.textContent).toBe("cd");
    expect(document.getSelection()?.focusOffset).toBe(1);
    detach();
    expect(editor.browserSelection.focusBlock(position)).toBe("detached");
  } finally {
    focus.mockRestore();
    editor.destroy();
    root.remove();
    document.getSelection()?.removeAllRanges();
    if (css) {
      Object.defineProperty(globalThis, "CSS", css);
    } else {
      Reflect.deleteProperty(globalThis, "CSS");
    }
  }
});

it("skips child content when focusing a parent block", () => {
  const editor = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  root.innerHTML =
    '<div data-block-id="parent"><div data-block-id="child"><span data-block-content contenteditable="true">Child</span></div><span data-block-content contenteditable="true" tabindex="0">Parent</span></div>';
  document.body.append(root);
  const css = Object.getOwnPropertyDescriptor(globalThis, "CSS");
  Object.defineProperty(globalThis, "CSS", {
    configurable: true,
    value: { escape: (id: string) => id },
  });
  try {
    attachTestRoot(editor, root);
    expect(editor.browserSelection.focusBlock({ blockId: "parent", offset: 2 })).toBe(
      "focus-requested",
    );
    const selection = document.getSelection()!;
    expect(selection.focusNode?.textContent).toBe("Parent");
    expect(selection.focusOffset).toBe(2);
  } finally {
    editor.destroy();
    root.remove();
    document.getSelection()?.removeAllRanges();
    if (css) {
      Object.defineProperty(globalThis, "CSS", css);
    } else {
      Reflect.deleteProperty(globalThis, "CSS");
    }
  }
});
