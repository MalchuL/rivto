import { type RivtoEditorApi } from "@chulane/rivto";
import { createTestCoreEditor as createRivtoEditor } from "../../../test-utils";
import { crossDocumentBlockTransfer } from "./cross-document-block-transfer";

async function createEditor(): Promise<RivtoEditorApi> {
  const editor = await createRivtoEditor();
  editor.blockRegistry.defineBlock({ type: "test.counter", defaultProps: { count: 0 } });
  return editor;
}

describe("cross-document block transfer", () => {
  test("preserves selected subtree order and data", async () => {
    const source = await createEditor();
    const destination = await createEditor();
    const first = source.blocks.insertBlock({
      id: "first",
      type: "paragraph",
      content: "First",
      listProps: { collapsed: true, type: "checkbox", checked: true },
      pluginData: { test: { retained: true } },
      children: [{ id: "child", type: "test.counter", props: { count: 4 } }],
    }).id;
    const second = source.blocks.insertBlock({ id: "second", type: "paragraph", content: "Second" }).id;
    const outside = source.blocks.insertBlock({ id: "outside", type: "paragraph", content: "Outside" }).id;
    const target = destination.blocks.insertBlock({ id: "target", type: "paragraph", content: "Target" }).id;
    source.history.clear();
    destination.history.clear();

    crossDocumentBlockTransfer(source, destination, [first, second], { targetId: target, position: "inside" });

    expect(source.blocks.getRootIds()).toEqual([outside]);
    expect(destination.blocks.getBlockNode(target)?.childIds).toEqual([first, second]);
    expect(destination.blocks.getBlock(first)).toMatchObject({
      id: first,
      listProps: { collapsed: true, type: "checkbox", checked: true },
      pluginData: { test: { retained: true } },
      children: [{ id: "child", type: "test.counter", props: { count: 4 } }],
    });

    destination.history.undo();
    expect(destination.blocks.getRootIds()).toEqual([target]);
    expect(source.blocks.getRootIds()).toEqual([outside]);
    source.history.undo();
    expect(source.blocks.getRootIds()).toEqual([first, second, outside]);

    source.destroy();
    destination.destroy();
  });

  test("appends into an empty destination", async () => {
    const source = await createEditor();
    const destination = await createEditor();
    source.blocks.insertBlock({ id: "moved", type: "paragraph", content: "Moved" });

    crossDocumentBlockTransfer(source, destination, ["moved"], { targetId: null, position: "after" });

    expect(source.blocks.getBlocks()).toEqual([]);
    expect(destination.blocks.getRootIds()).toEqual(["moved"]);
    source.destroy();
    destination.destroy();
  });

  test("rejects a duplicate block ID without changing either document", async () => {
    const source = await createEditor();
    const destination = await createEditor();
    source.blocks.insertBlock({
      id: "moved",
      type: "paragraph",
      children: [{ id: "child", type: "paragraph" }],
    });
    destination.blocks.insertBlock({ id: "child", type: "paragraph" });
    const sourceBefore = source.dump();
    const destinationBefore = destination.dump();

    expect(() => crossDocumentBlockTransfer(source, destination, ["moved"], {
      targetId: null,
      position: "after",
    })).toThrow("Destination already contains block");
    expect(source.dump()).toEqual(sourceBefore);
    expect(destination.dump()).toEqual(destinationBefore);
    source.destroy();
    destination.destroy();
  });

  test("validates destination definitions before changing either document", async () => {
    const source = await createEditor();
    const destination = await createRivtoEditor();
    source.blocks.insertBlock({ id: "custom", type: "test.counter", props: { count: 9 } });
    const sourceBefore = source.dump();

    expect(() => crossDocumentBlockTransfer(source, destination, ["custom"], {
      targetId: null,
      position: "after",
    })).toThrow("Block type test.counter is not registered");
    expect(source.dump()).toEqual(sourceBefore);
    expect(destination.blocks.getBlocks()).toEqual([]);
    source.destroy();
    destination.destroy();
  });
});

test("transfers between two source models using one editor runtime", async () => {
  const { DocumentModelImpl } = await import("@chulane/document-model");
  const { YjsDoc } = await import("@chulane/crdt-doc");
  const editor = await createEditor();
  editor.blocks.insertBlock({ id: "host", type: "paragraph", content: "Host" });
  const source = new DocumentModelImpl(new YjsDoc(crypto.randomUUID()));
  const destination = new DocumentModelImpl(new YjsDoc(crypto.randomUUID()));
  source.blocks.insertBlock({ id: "moved", type: "paragraph", content: "Moved" });
  source.history.clear(); destination.history.clear();
  const { createTestMultiEditor } = await import("../../../test-utils");
  const { createEditorRuntime } = await import("../../../editor-runtime");
  const runtime = await createTestMultiEditor([source, destination]);
  crossDocumentBlockTransfer(runtime.getEditor(source.id)!, runtime.getEditor(destination.id)!, ["moved"], { targetId: null, position: "after" });
  expect(source.blocks.hasBlock("moved")).toBe(false);
  expect(destination.blocks.getBlockNode("moved")?.content).toBe("Moved");
  expect(editor.blocks.getRootIds()).toEqual(["host"]);
  destination.history.undo(); source.history.undo();
  expect(source.blocks.getBlockNode("moved")?.content).toBe("Moved");
  expect(destination.blocks.getRootIds()).toEqual([]);
  await runtime.destroy(); await editor.destroy();
});

test("rejects overlapping roots and processor-changed identities before writing either document", async () => {
  const source = await createEditor(); const destination = await createEditor();
  source.blocks.insertBlock({ id: "parent", type: "paragraph", children: [{ id: "child", type: "paragraph" }] });
  const before = source.dump();
  expect(() => crossDocumentBlockTransfer(source, destination, ["parent", "child"], { targetId: null, position: "after" })).toThrow();
  expect(destination.blocks.getRootIds()).toEqual([]);
  const stop = destination.blocks.registerProcessor({ id: "rewrite", priority: 0, processor: (block) => ({ ...block, id: `${block.id}-changed` }) });
  expect(() => crossDocumentBlockTransfer(source, destination, ["parent"], { targetId: null, position: "after" })).toThrow("preserve block IDs");
  expect(source.dump()).toEqual(before); expect(destination.blocks.getRootIds()).toEqual([]);
  stop(); await source.destroy(); await destination.destroy();
});
