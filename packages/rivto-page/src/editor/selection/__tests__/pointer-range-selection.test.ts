import { attachTestRoot } from "../../../test-utils/attach-test-root";
import { BlockEditorController } from "../../block-editor-controller";
import { TestBlockEditorAdapter } from "../../../test-utils/test-block-editor-adapter";
import { BlockSelectionExtensions } from "../block-selection-extensions";

it("extends the attached occurrence's live selection before a delayed selectionchange", () => {
  const adapter = new TestBlockEditorAdapter();
  adapter.setNode("first", { content: "First" });
  adapter.setNode("second", { content: "Second" });
  adapter.setBlockIds(["first", "second"]);
  const editor = new BlockEditorController({ adapter });
  const extensions = new BlockSelectionExtensions({
    toggle: "toggle",
    range: "range",
    exact: "exact",
  });
  editor.extensions.register("range", extensions.feature("range"));
  jest
    .spyOn(editor.keyboard, "isHeld")
    .mockReturnValueOnce(true)
    .mockReturnValueOnce(true)
    .mockReturnValue(false);
  const read = jest.spyOn(editor.browserSelection, "readEditorDOMSelection");
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  root.tabIndex = -1;
  root.innerHTML =
    '<div data-block-id="first"><span data-block-content>First</span></div><div data-block-id="second"><div data-block-selection-anchor>Second</div></div>';
  document.body.append(root);
  attachTestRoot(editor, root);
  try {
    const text = root.querySelector("[data-block-content]")!.firstChild!;
    document.getSelection()!.setBaseAndExtent(text, 1, text, 1);
    root
      .querySelector("[data-block-selection-anchor]")!
      .dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, cancelable: true, button: 0 }));
    expect(read).toHaveBeenCalledTimes(1);
    expect(adapter.selection.get()?.blocks.map(({ id }) => id)).toEqual(["first", "second"]);
  } finally {
    editor.destroy();
    root.remove();
    document.getSelection()?.removeAllRanges();
  }
});
