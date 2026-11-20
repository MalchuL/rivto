import { attachTestRoot } from "../../../test-utils/attach-test-root";
import { BlockEditorController } from "../../block-editor-controller";
import { TestBlockEditorAdapter } from "../../../test-utils/test-block-editor-adapter";
import { mockCaretGeometry } from "./caret-geometry";

it("measures the adjacent rendered occurrence even when both shells share a block ID", () => {
  const editor = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  root.innerHTML =
    '<div data-block-id="same"><span data-block-content>First</span></div><div data-block-id="same"><span data-block-content>Second</span></div>';
  const css = Object.getOwnPropertyDescriptor(globalThis, "CSS");
  const escape = (id: string) => id;
  Object.defineProperty(globalThis, "CSS", { configurable: true, value: { escape } });
  const restoreGeometry = mockCaretGeometry(
    (text, offset) => offset * 10 - (text === "Second" ? 10 : 0),
  );
  const mount = jest.fn();
  try {
    attachTestRoot(editor, root);
    expect(
      editor.browserSelection.verticalCaretPosition({ blockId: "same", offset: 1 }, "down", mount),
    ).toEqual({ blockId: "same", offset: 2 });
    expect(mount).not.toHaveBeenCalled();
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
