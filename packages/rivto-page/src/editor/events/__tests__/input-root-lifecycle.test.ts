import { attachTestRoot } from "../../../test-utils/attach-test-root";
import type { BlockInputRoot } from "../types";
import { BlockEditorController } from "../../block-editor-controller";
import { TestBlockEditorAdapter } from "../../../test-utils/test-block-editor-adapter";

it("shares an input root within an attachment and invalidates it after remount", () => {
  const editor = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
  const element = document.createElement("div");
  element.dataset.rivtoBlockEditor = "true";
  element.tabIndex = -1;
  document.body.append(element);
  const roots: Array<Pick<BlockInputRoot, "isAttached" | "focus">> = [];
  editor.events.observe("test.root", { type: "click", priority: 0 }, (event) => {
    roots.push(event.root);
  });
  const focus = jest.spyOn(element, "focus");
  try {
    const detachFirst = attachTestRoot(editor, element);
    element.click();
    element.click();
    expect(roots[0]).toBe(roots[1]);
    detachFirst();
    const detachSecond = attachTestRoot(editor, element);
    detachFirst();
    element.click();
    expect(roots[2]).not.toBe(roots[0]);
    roots[0]!.focus();
    expect(focus).not.toHaveBeenCalled();
    roots[2]!.focus();
    expect(focus).toHaveBeenCalledTimes(1);
    detachSecond();
  } finally {
    focus.mockRestore();
    editor.destroy();
    element.remove();
  }
});
