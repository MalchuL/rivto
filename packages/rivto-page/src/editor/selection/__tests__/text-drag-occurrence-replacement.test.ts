import { attachTestRoot } from "../../../test-utils/attach-test-root";
import { getBrowserElementIdentity } from "@chulane/rivto-root/browser";
import { BlockEditorController } from "../../block-editor-controller";
import { TestBlockEditorAdapter } from "../../../test-utils/test-block-editor-adapter";
import { BlockPointerHitTest } from "../block-pointer-hit-test";
import { BrowserInputRoot } from "@chulane/rivto-root/browser";
import { BlockSelectionExtensions } from "../block-selection-extensions";

it("does not restore old text endpoints after a selection subscriber replaces the occurrence", () => {
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
  editor.extensions.register("pointer", extensions.feature("pointer"));
  jest.spyOn(editor.keyboard, "isHeld").mockReturnValue(true);
  const firstRoot = document.createElement("div");
  const replacement = document.createElement("div");
  firstRoot.dataset.rivtoBlockEditor = "true";
  replacement.dataset.rivtoBlockEditor = "true";
  firstRoot.innerHTML =
    '<div data-block-id="first"><div data-block-content data-block-selection-anchor>First</div></div><div data-block-id="second"><div data-block-content data-block-selection-anchor>Second</div></div>';
  replacement.textContent = "Replacement";
  document.body.append(firstRoot, replacement);
  const [first, second] = firstRoot.querySelectorAll<HTMLElement>("[data-block-content]");
  const restoreGeometry = mockTextDragGeometry(first, second);
  const detachFirst = attachTestRoot(editor, firstRoot);
  const set = adapter.selection.set.bind(adapter.selection);
  const change = jest.spyOn(adapter.selection, "set").mockImplementation((selection) => {
    set(selection);
    detachFirst();
    attachTestRoot(editor, replacement);
    document
      .getSelection()!
      .setBaseAndExtent(replacement.firstChild!, 1, replacement.firstChild!, 3);
  });
  try {
    first.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 0, clientX: 1 }));
    window.dispatchEvent(
      new MouseEvent("pointermove", { bubbles: true, cancelable: true, clientX: 20 }),
    );
    expect(change).toHaveBeenCalledTimes(1);
    expect(editor.inputRoot?.getElementIdentity?.()).toBe(getBrowserElementIdentity(replacement));
    expect(document.getSelection()?.toString()).toBe("ep");
  } finally {
    change.mockRestore();
    restoreGeometry();
    editor.destroy();
    firstRoot.remove();
    replacement.remove();
    document.getSelection()?.removeAllRanges();
  }
});

/**
 * Supplies deterministic caret hit testing for the two fixture blocks.
 *
 * @param first - Editable content at the fixed endpoint.
 * @param second - Editable content at the moving endpoint.
 * @returns Cleanup restoring the original geometry methods.
 */
function mockTextDragGeometry(first: HTMLElement, second: HTMLElement): () => void {
  Object.defineProperty(first, "isContentEditable", { configurable: true, value: true });
  const gesture = jest
    .spyOn(BrowserInputRoot.prototype, "createTextSelectionGesture")
    .mockReturnValue({
      readAnchor: () => ({ ownerId: "first", offset: 1 }),
      readHead: () => ({ ownerId: "second", offset: 2 }),
      hasAnchor: () => true,
      hasPendingHead: () => true,
      hasHead: () => true,
      commitHead: () => {},
      setAnchor: () => true,
      restore: () =>
        document.getSelection()!.setBaseAndExtent(first.firstChild!, 1, second.firstChild!, 2),
    });
  const hit = jest
    .spyOn(BlockPointerHitTest.prototype, "readBlockIdAtPoint")
    .mockReturnValue("second");
  return () => {
    gesture.mockRestore();
    hit.mockRestore();
  };
}
