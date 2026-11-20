import { attachTestRoot } from "../../../test-utils/attach-test-root";
import { BlockEditorController } from "../../block-editor-controller";
import { TestBlockEditorAdapter } from "../../../test-utils/test-block-editor-adapter";
import { mockCaretGeometry } from "./caret-geometry";

it("resolves visual movement within the attached occurrence", () => {
  const editor = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  root.innerHTML =
    '<div data-rivto-block-editor><div data-block-id="first"><span data-block-content>Foreign</span></div></div><div data-block-id="first"><span data-block-content>First</span></div><div data-block-id="second"><span data-block-content>Second</span></div>';
  const css = Object.getOwnPropertyDescriptor(globalThis, "CSS");
  const escape = (id: string) => id;
  Object.defineProperty(globalThis, "CSS", { configurable: true, value: { escape } });
  const restoreGeometry = mockCaretGeometry(
    (text, offset) => offset * 10 + (text === "Second" ? 10 : 0),
  );
  const mount = jest.fn();
  try {
    expect(
      editor.browserSelection.verticalCaretPosition({ blockId: "first", offset: 2 }, "down", mount),
    ).toBeUndefined();
    const detach = attachTestRoot(editor, root);
    expect(
      editor.browserSelection.verticalCaretPosition({ blockId: "first", offset: 2 }, "down", mount),
    ).toEqual({ blockId: "second", offset: 1 });
    expect(mount).not.toHaveBeenCalled();
    detach();
  } finally {
    restoreGeometry();
    editor.destroy();
    if (css) {
      Object.defineProperty(globalThis, "CSS", css);
    } else {
      Reflect.deleteProperty(globalThis, "CSS");
    }
  }
});

it("rejects an adjacent result after the occurrence is remounted", () => {
  const editor = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  root.innerHTML = '<div data-block-id="first"><span data-block-content>First</span></div>';
  const css = Object.getOwnPropertyDescriptor(globalThis, "CSS");
  Object.defineProperty(globalThis, "CSS", {
    configurable: true,
    value: { escape: (id: string) => id },
  });
  const restoreGeometry = mockCaretGeometry((_text, offset) => offset * 10);
  try {
    const detach = attachTestRoot(editor, root);
    const position = editor.browserSelection.verticalCaretPosition(
      { blockId: "first", offset: 0 },
      "down",
      () => {
        detach();
        attachTestRoot(editor, root);
      },
    );
    expect(position).toBeUndefined();
  } finally {
    restoreGeometry();
    editor.destroy();
    if (css) {
      Object.defineProperty(globalThis, "CSS", css);
    } else {
      Reflect.deleteProperty(globalThis, "CSS");
    }
  }
});
