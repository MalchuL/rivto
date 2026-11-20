import { attachTestRoot } from "../../../test-utils/attach-test-root";
import { BlockEditorController } from "../../block-editor-controller";
import { TestBlockEditorAdapter } from "../../../test-utils/test-block-editor-adapter";
import { BlockSelectionExtensions } from "../block-selection-extensions";

it("selects structural anchors but ignores editable and text-node targets", () => {
  const adapter = new TestBlockEditorAdapter();
  adapter.setNode("block", { content: "Text" });
  adapter.setBlockIds(["block"]);
  const editor = new BlockEditorController({ adapter });
  const extensions = new BlockSelectionExtensions({
    toggle: "toggle",
    range: "range",
    exact: "exact",
  });
  editor.extensions.register("click", extensions.feature("click"));
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  root.innerHTML =
    '<div data-block-id="block"><div data-block-selection-anchor><span>Text</span></div></div>';
  const anchor = root.querySelector<HTMLElement>("[data-block-selection-anchor]")!;
  const target = anchor.querySelector("span")!;
  let editable = false;
  Object.defineProperty(anchor, "isContentEditable", { configurable: true, get: () => editable });
  document.body.append(root);
  const set = jest.spyOn(adapter.selection, "set");
  try {
    attachTestRoot(editor, root);
    target.firstChild!.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0 }));
    editable = true;
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0 }));
    expect(set).not.toHaveBeenCalled();
    editable = false;
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
    expect(set).toHaveBeenCalledTimes(1);
    expect(adapter.selection.get()?.blocks).toEqual([{ id: "block", start: 0, end: -1 }]);
  } finally {
    set.mockRestore();
    editor.destroy();
    root.remove();
    document.getSelection()?.removeAllRanges();
  }
});
