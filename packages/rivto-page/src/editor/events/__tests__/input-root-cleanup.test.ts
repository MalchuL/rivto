import { attachTestRoot } from "../../../test-utils/attach-test-root";
import type { BlockInputRoot } from "../types";
import { BlockEditorController } from "../../block-editor-controller";
import { TestBlockEditorAdapter } from "../../../test-utils/test-block-editor-adapter";

it("invalidates the occurrence root even when an attachment cleanup fails", () => {
  const editor = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
  const element = document.createElement("div");
  element.dataset.rivtoBlockEditor = "true";
  const roots: Array<Pick<BlockInputRoot, "isAttached">> = [];
  editor.events.observe("capture-root", { type: "click", priority: 0 }, (event) => {
    roots.push(event.root);
  });
  const removeFailure = editor.events.onDetach(() => {
    throw new Error("cleanup failed");
  });
  try {
    const detach = attachTestRoot(editor, element);
    element.click();
    expect(roots[0].isAttached()).toBe(true);
    expect(detach).toThrow("Editor event cleanup failed");
    expect(roots[0].isAttached()).toBe(false);
    removeFailure();
    const detachReplacement = attachTestRoot(editor, element);
    element.click();
    expect(roots[1].isAttached()).toBe(true);
    expect(roots[0].isAttached()).toBe(false);
    detachReplacement();
  } finally {
    removeFailure();
    editor.destroy();
  }
});
