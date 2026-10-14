import { createStructuralSelection } from "@chulane/rivto";
import { createTestCoreEditor, createTestReactEditor } from "../../test-utils";
import { standardPreset } from "../../extensions/built-ins/built-ins";
import { embeddingExtension } from "../../extensions/embedding/embedding";
import { blockMenuTargets, executeBlockMenuEntry } from "../block-context-menu/targets";
import type { ClipboardBundle } from "@chulane/rivto";

/** Captures browser clipboard flavors without a native clipboard in the headless model tests. */
function clipboard(write: (data: Record<string, Blob>[]) => Promise<void>) {
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const originalItem = Object.getOwnPropertyDescriptor(globalThis, "ClipboardItem");
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { clipboard: { write } },
  });
  Object.defineProperty(globalThis, "ClipboardItem", {
    configurable: true,
    value: class {
      /** Retains blobs as a browser-independent test double. */
      constructor(data: Record<string, Blob>) {
        return data;
      }
    },
  });
  return () => {
    for (const [key, descriptor] of [
      ["navigator", originalNavigator],
      ["ClipboardItem", originalItem],
    ] as const) {
      if (descriptor) {
        Object.defineProperty(globalThis, key, descriptor);
      } else {
        Reflect.deleteProperty(globalThis, key);
      }
    }
  };
}

test("embedding copy emits only selected roots and pastes qualified references into another document", async () => {
  const source = await createTestCoreEditor();
  const target = await createTestCoreEditor();
  const a = createTestReactEditor({
    editor: source,
    extensions: [standardPreset(), embeddingExtension()],
  });
  const b = createTestReactEditor({
    editor: target,
    extensions: [standardPreset(), embeddingExtension()],
  });
  const parent = a.blocks.insertBlock({ type: "paragraph", children: [{ type: "paragraph" }] });
  a.selection.set(createStructuralSelection([parent.id, parent.children[0]!.id]));
  let html = "";
  const restore = clipboard(async (items) => {
    html = await items[0]!["text/html"]!.text();
  });
  try {
    await executeBlockMenuEntry("embedding.copy", blockMenuTargets(a, parent.id));
    const bundle = JSON.parse(
      decodeURIComponent(html.match(/data-rivto-clipboard="([^"]+)"/)![1]!),
    ) as ClipboardBundle;
    expect(bundle.blocks).toHaveLength(1);
    expect(bundle.blocks[0]?.children).toEqual([]);
    expect(source.blocks.getRootIds()).toEqual([parent.id]);
    b.clipboard.paste({ bundle });
    const embedding = target.blocks.getBlocks()[0]!;
    expect(embedding.id).not.toBe(parent.id);
    b.clipboard.paste({ bundle });
    expect(new Set(target.blocks.getRootIds()).size).toBe(2);
    expect(embedding.props).toMatchObject({
      targetBlockId: parent.id,
      targetDocumentId: source.getDocument().id,
    });
  } finally {
    restore();
    a.editor.destroy();
    b.editor.destroy();
    await source.destroy();
    await target.destroy();
  }
});

test("denied clipboard writes leave cut targets and their descendants intact", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core, extensions: [standardPreset()] });
  const block = panel.blocks.insertBlock({
    type: "paragraph",
    content: "Keep",
    children: [{ type: "paragraph", content: "Child" }],
  });
  const restore = clipboard(async () => {
    throw new Error("Permission denied");
  });
  try {
    await expect(
      executeBlockMenuEntry("clipboard.cut", blockMenuTargets(panel, block.id)),
    ).rejects.toThrow("Permission denied");
    expect(core.blocks.getBlock(block.id)).toEqual(block);
  } finally {
    restore();
    panel.editor.destroy();
    await core.destroy();
  }
});
