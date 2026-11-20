/** @jest-environment ./jest-browser-environment.mjs */
import { createTestCoreEditor, createTestReactEditor } from "../../../test-utils";
import { BLOCK_TEXT_METADATA_KEY } from "../block-text-metadata";

const css = Object.getOwnPropertyDescriptor(globalThis, "CSS");
beforeAll(() => {
  Object.defineProperty(globalThis, "CSS", {
    configurable: true,
    value: { escape: (id: string) => id },
  });
});
afterAll(() => {
  if (css) {
    Object.defineProperty(globalThis, "CSS", css);
  } else {
    Reflect.deleteProperty(globalThis, "CSS");
  }
});

it("reads and restores selection as soon as a panel root is registered and after replacement", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  panel.editor.blockTypes.register({
    definition: { type: "text-fixture", metadata: { [BLOCK_TEXT_METADATA_KEY]: true } },
    render: () => null,
  });
  const firstId = core.blocks.insertBlock({ type: "text-fixture", content: "First" }).id;
  const secondId = core.blocks.insertBlock({ type: "text-fixture", content: "Second" }).id;
  const roots = [document.createElement("div"), document.createElement("div")];
  for (const root of roots) {
    root.dataset.rivtoBlockEditor = "true";
    root.innerHTML = `<div data-block-id="${firstId}"><span data-block-content contenteditable="true">First</span></div><div data-block-id="${secondId}"><span data-block-content contenteditable="true">Second</span></div>`;
    document.body.append(root);
  }
  try {
    panel.setRoot(roots[0]);
    const first = roots[0].querySelectorAll("[data-block-content]");
    document.getSelection()!.setBaseAndExtent(first[1].firstChild!, 3, first[0].firstChild!, 1);
    const selection = panel.selection.readDOM();
    expect(selection?.anchorBlockId).toBe(secondId);
    expect(selection?.focusBlockId).toBe(firstId);
    expect(selection?.blocks.map(({ id }) => id)).toEqual([firstId, secondId]);
    panel.setRoot(roots[1]);
    expect(panel.selection.readDOM()).toBeUndefined();
    expect(panel.selection.restoreDOM(selection, { scroll: false })).toBe(true);
    const restored = document.getSelection()!;
    const second = roots[1].querySelectorAll("[data-block-content]");
    expect(restored.anchorNode).toBe(second[1].firstChild);
    expect(restored.anchorOffset).toBe(3);
    expect(restored.focusNode).toBe(second[0].firstChild);
    expect(restored.focusOffset).toBe(1);
    roots[1].removeAttribute("data-rivto-block-editor");
    expect(panel.selection.readDOM()).toBeUndefined();
    expect(panel.selection.restoreDOM(selection, { scroll: false })).toBe(false);
    panel.setRoot(null);
    expect(panel.selection.readDOM()).toBeUndefined();
    expect(panel.selection.restoreDOM(selection, { scroll: false })).toBe(false);
  } finally {
    panel.editor.destroy();
    await core.destroy();
    roots.forEach((root) => root.remove());
    document.getSelection()?.removeAllRanges();
  }
});
