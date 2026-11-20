import { attachTestRoot } from "../../../test-utils/attach-test-root";
import { BlockEditorController } from "../../block-editor-controller";
import { TestBlockEditorAdapter } from "../../../test-utils/test-block-editor-adapter";

it("focuses the occurrence and scrolls its own selected block", () => {
  const editor = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  root.tabIndex = 0;
  root.innerHTML =
    '<div data-rivto-block-editor><div data-block-id="target"></div></div><div data-block-id="target"></div>';
  document.body.append(root);
  const nested = root.querySelector<HTMLElement>("[data-rivto-block-editor] [data-block-id]")!;
  const owned = root.lastElementChild as HTMLElement;
  nested.scrollIntoView = jest.fn();
  owned.scrollIntoView = jest.fn();
  const css = Object.getOwnPropertyDescriptor(globalThis, "CSS");
  Object.defineProperty(globalThis, "CSS", {
    configurable: true,
    value: { escape: (id: string) => id },
  });
  try {
    expect(editor.browserSelection.focusBlockSelection("target")).toBe(false);
    attachTestRoot(editor, root);
    const range = document.createRange();
    range.selectNode(owned);
    document.getSelection()!.addRange(range);
    expect(editor.browserSelection.focusBlockSelection("target")).toBe(true);
    expect(document.getSelection()!.rangeCount).toBe(0);
    expect(document.activeElement).toBe(root);
    expect(owned.scrollIntoView).toHaveBeenCalledWith({ block: "nearest" });
    expect(nested.scrollIntoView).not.toHaveBeenCalled();
    expect(editor.browserSelection.focusBlockSelection("missing")).toBe(true);
  } finally {
    editor.destroy();
    root.remove();
    if (css) {
      Object.defineProperty(globalThis, "CSS", css);
    } else {
      Reflect.deleteProperty(globalThis, "CSS");
    }
  }
});
