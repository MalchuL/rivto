import { attachTestRoot } from "../../../test-utils/attach-test-root";
import { BlockEditorController } from "../../block-editor-controller";
import { TestBlockEditorAdapter } from "../../../test-utils/test-block-editor-adapter";
import { mockCaretGeometry } from "./caret-geometry";

it("mounts a neighbor at the rendered edge before measuring it", () => {
  const editor = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  root.innerHTML = '<div data-block-id="first"><span data-block-content>First</span></div>';
  const css = Object.getOwnPropertyDescriptor(globalThis, "CSS");
  const escape = (id: string) => id;
  Object.defineProperty(globalThis, "CSS", { configurable: true, value: { escape } });
  const mount = jest.fn(() => {
    root.insertAdjacentHTML(
      "beforeend",
      '<div data-block-id="second"><span data-block-content>Second</span></div>',
    );
  });
  const restoreGeometry = mockCaretGeometry(
    (text, offset) => offset * 10 + (text === "Second" ? 20 : 0),
  );
  try {
    attachTestRoot(editor, root);
    expect(
      editor.browserSelection.verticalCaretPosition({ blockId: "first", offset: 2 }, "down", mount),
    ).toEqual({ blockId: "second", offset: 0 });
    expect(mount).toHaveBeenCalledWith("first", 1);
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
