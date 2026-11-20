/** @jest-environment ./jest-browser-environment.mjs */
import { createTestCoreEditor, createTestReactEditor } from "../../../test-utils";
import { BLOCK_TEXT_METADATA_KEY } from "../block-text-metadata";

it("publishes and restores a directed range only in an attached occurrence", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  panel.editor.blockTypes.register({
    definition: { type: "range-fixture", metadata: { [BLOCK_TEXT_METADATA_KEY]: true } },
    render: () => null,
  });
  const first = core.blocks.insertBlock({ type: "range-fixture", content: "First" }).id;
  const second = core.blocks.insertBlock({ type: "range-fixture", content: "Second" }).id;
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  root.innerHTML = `<div data-block-id="${first}"><span data-block-content contenteditable="true">First</span></div><div data-block-id="${second}"><span data-block-content contenteditable="true">Second</span></div>`;
  for (const block of root.querySelectorAll<HTMLElement>("[data-block-id]")) {
    block.scrollIntoView = () => {};
  }
  document.body.append(root);
  const css = Object.getOwnPropertyDescriptor(globalThis, "CSS");
  Object.defineProperty(globalThis, "CSS", {
    configurable: true,
    value: { escape: (id: string) => id },
  });
  try {
    const anchor = { blockId: second, offset: 3 };
    const head = { blockId: first, offset: 1 };
    panel.setRoot(root);
    expect(panel.selection.selectTextRange(anchor, head)).toBe(true);
    const selection = panel.selection.get();
    expect(selection?.anchorBlockId).toBe(second);
    expect(selection?.focusBlockId).toBe(first);
    expect(document.getSelection()!.anchorOffset).toBe(3);
    expect(document.getSelection()!.focusOffset).toBe(1);
    expect(panel.selection.selectTextRange({ blockId: "missing", offset: 0 }, head)).toBe(false);
    expect(panel.selection.get()).toEqual(selection);
    panel.setRoot(null);
    expect(panel.selection.selectTextRange(anchor, head)).toBe(false);
  } finally {
    panel.editor.destroy();
    await core.destroy();
    root.remove();
    document.getSelection()?.removeAllRanges();
    if (css) {
      Object.defineProperty(globalThis, "CSS", css);
    } else {
      Reflect.deleteProperty(globalThis, "CSS");
    }
  }
});
