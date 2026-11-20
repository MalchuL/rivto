import { attachTestRoot } from "../../../test-utils/attach-test-root";
import { getBrowserElementIdentity } from "@chulane/rivto-root/browser";
import { BlockEditorController } from "../../block-editor-controller";
import { TestBlockEditorAdapter } from "../../../test-utils/test-block-editor-adapter";
import { BlockSelectionExtensions } from "../block-selection-extensions";

it("leaves replacement focus and selection untouched during a structural click", () => {
  const adapter = new TestBlockEditorAdapter();
  adapter.setNode("first", { content: "First" });
  adapter.setBlockIds(["first"]);
  const editor = new BlockEditorController({ adapter });
  const extensions = new BlockSelectionExtensions({
    toggle: "toggle",
    range: "range",
    exact: "exact",
  });
  editor.extensions.register("click", extensions.feature("click"));
  const first = document.createElement("div");
  const replacement = document.createElement("div");
  first.dataset.rivtoBlockEditor = "true";
  replacement.dataset.rivtoBlockEditor = "true";
  first.innerHTML = '<div data-block-id="first"><div data-block-selection-anchor>First</div></div>';
  replacement.textContent = "Replacement";
  document.body.append(first, replacement);
  const focusReplacement = jest.spyOn(replacement, "focus");
  const set = adapter.selection.set.bind(adapter.selection);
  const detachFirst = attachTestRoot(editor, first);
  const change = jest.spyOn(adapter.selection, "set").mockImplementation((selection) => {
    set(selection);
    detachFirst();
    attachTestRoot(editor, replacement);
    document
      .getSelection()!
      .setBaseAndExtent(replacement.firstChild!, 1, replacement.firstChild!, 3);
  });
  try {
    first
      .querySelector("[data-block-selection-anchor]")!
      .dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
    expect(change).toHaveBeenCalledTimes(1);
    expect(editor.inputRoot?.getElementIdentity?.()).toBe(getBrowserElementIdentity(replacement));
    expect(focusReplacement).not.toHaveBeenCalled();
    expect(document.getSelection()?.toString()).toBe("ep");
  } finally {
    change.mockRestore();
    focusReplacement.mockRestore();
    editor.destroy();
    first.remove();
    replacement.remove();
    document.getSelection()?.removeAllRanges();
  }
});
