import { attachTestRoot } from "../../../test-utils/attach-test-root";
import { BrowserInputRoot } from "@chulane/rivto-root/browser";
import { BlockLayoutRegions } from "../../../presentation/components/block-layout/block-layout-regions";
import { BlockPointerHitTest } from "../block-pointer-hit-test";
import { BlockEditorController } from "../../block-editor-controller";
import { TestBlockEditorAdapter } from "../../../test-utils/test-block-editor-adapter";
import { BlockNativeSelection } from "../block-native-selection";
import { BlockDOMSelection } from "../block-dom-selection";

it("leaves pending host restoration untouched but captures the live caret before input", () => {
  const adapter = new TestBlockEditorAdapter();
  const editor = new BlockEditorController({ adapter });
  const suspended = jest.fn(() => true);
  const selection = { ...adapter.selection, isNativeSelectionSuspended: suspended };
  const native = new BlockNativeSelection(
    editor.events,
    selection,
    { isSelectionOwned: () => false },
    editor.browserSelection,
  );
  const read = jest.spyOn(BlockDOMSelection.prototype, "readEditorDOMSelection");
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  root.innerHTML =
    '<div data-block-id="one"><div data-block-content contenteditable="true">Text</div></div>';
  document.body.append(root);
  native.install();
  attachTestRoot(editor, root);
  document.dispatchEvent(new Event("selectionchange"));
  expect(read).not.toHaveBeenCalled();
  root
    .querySelector("[data-block-content]")!
    .dispatchEvent(new Event("beforeinput", { bubbles: true }));
  expect(read).toHaveBeenCalledTimes(1);
  suspended.mockReturnValue(false);
  document.dispatchEvent(new Event("selectionchange"));
  expect(read).toHaveBeenCalledTimes(2);
  editor.destroy();
  root.remove();
  read.mockRestore();
});

it("keeps a host pointer endpoint on the enclosing block across nested editors", () => {
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  root.innerHTML =
    '<div data-block-id="reference"><div class="rivto-block-row"></div><div data-slot-position="body"><div data-rivto-block-editor><div data-block-id="foreign"><span>Foreign text</span></div></div></div><div class="rivto-block-children"><div data-block-id="child"><div class="rivto-block-row"></div></div></div></div>';
  document.body.append(root);
  Object.defineProperty(document, "elementFromPoint", {
    configurable: true,
    value: () => root.querySelector("span"),
  });
  expect(
    new BlockPointerHitTest(
      new BrowserInputRoot(root),
      new BlockLayoutRegions(),
    ).readBlockIdAtPoint(10, 10),
  ).toBe("reference");
  const nested = root.querySelector<HTMLElement>("[data-rivto-block-editor]")!;
  expect(
    new BlockPointerHitTest(
      new BrowserInputRoot(nested),
      new BlockLayoutRegions(),
    ).readBlockIdAtPoint(10, 10),
  ).toBe("foreign");
  root.remove();
});
