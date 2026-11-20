import { attachTestRoot } from "../../../test-utils/attach-test-root";
import { BlockEditorController } from "../../block-editor-controller";
import { TestBlockEditorAdapter } from "../../../test-utils/test-block-editor-adapter";

it("keeps horizontal navigation inside a local scope and stops at contentless blocks", () => {
  const editor = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  root.innerHTML =
    '<div data-card><div data-block-id="empty"></div><div data-block-id="first"><span data-block-content>First</span></div><div data-block-id="second"><span data-block-content>Second</span></div></div><div data-block-id="outside"><span data-block-content>Outside</span></div>';
  const css = Object.getOwnPropertyDescriptor(globalThis, "CSS");
  const escape = (id: string) => id;
  Object.defineProperty(globalThis, "CSS", { configurable: true, value: { escape } });
  const mount = jest.fn();
  try {
    attachTestRoot(editor, root);
    expect(
      editor.browserSelection.adjacentCaretPosition("first", "left", "[data-card]", mount),
    ).toBeUndefined();
    expect(
      editor.browserSelection.adjacentCaretPosition("first", "right", "[data-card]", mount),
    ).toEqual({ blockId: "second", offset: 0 });
    expect(
      editor.browserSelection.adjacentCaretPosition("second", "left", "[data-card]", mount),
    ).toEqual({ blockId: "first", offset: 5 });
    expect(
      editor.browserSelection.adjacentCaretPosition("second", "right", "[data-card]", mount),
    ).toBeUndefined();
    expect(mount).not.toHaveBeenCalled();
  } finally {
    editor.destroy();
    if (css) {
      Object.defineProperty(globalThis, "CSS", css);
    } else {
      Reflect.deleteProperty(globalThis, "CSS");
    }
  }
});

it("mounts an adjacent block at the occurrence edge and ignores remounts", () => {
  const editor = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  root.innerHTML = '<div data-block-id="first"><span data-block-content>First</span></div>';
  const css = Object.getOwnPropertyDescriptor(globalThis, "CSS");
  const escape = (id: string) => id;
  Object.defineProperty(globalThis, "CSS", { configurable: true, value: { escape } });
  try {
    const detach = attachTestRoot(editor, root);
    const mount = jest.fn(() =>
      root.insertAdjacentHTML(
        "beforeend",
        '<div data-block-id="second"><span data-block-content>Second</span></div>',
      ),
    );
    expect(
      editor.browserSelection.adjacentCaretPosition("first", "right", "[data-card]", mount),
    ).toEqual({ blockId: "second", offset: 0 });
    expect(mount).toHaveBeenCalledWith("first", 1);
    const stale = editor.browserSelection.adjacentCaretPosition(
      "second",
      "right",
      "[data-card]",
      () => {
        detach();
        attachTestRoot(editor, root);
        root.insertAdjacentHTML(
          "beforeend",
          '<div data-block-id="third"><span data-block-content>Third</span></div>',
        );
      },
    );
    expect(stale).toBeUndefined();
  } finally {
    editor.destroy();
    if (css) {
      Object.defineProperty(globalThis, "CSS", css);
    } else {
      Reflect.deleteProperty(globalThis, "CSS");
    }
  }
});
