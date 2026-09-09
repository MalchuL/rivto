import { type RivtoEditorApi } from "@chulane/rivto";
import { createTestCoreEditor as createRivtoEditor } from "../../test-utils";
import { crossDocumentBlockTransfer } from "./cross-document-block-transfer";

function createEditor(): RivtoEditorApi {
  const editor = createRivtoEditor();
  editor.blocksRegistry.defineBlock({ type: "test.counter", defaultProps: { count: 0 } });
  return editor;
}

describe("cross-document block transfer", () => {
  test("preserves selected subtree order and data", () => {
    const source = createEditor();
    const destination = createEditor();
    const first = source.blocks.insertBlock({
      id: "first",
      type: "paragraph",
      content: "First",
      listProps: { collapsed: true, type: "checkbox", checked: true },
      pluginData: { test: { retained: true } },
      children: [{ id: "child", type: "test.counter", props: { count: 4 } }],
    });
    const second = source.blocks.insertBlock({ id: "second", type: "paragraph", content: "Second" });
    const outside = source.blocks.insertBlock({ id: "outside", type: "paragraph", content: "Outside" });
    const target = destination.blocks.insertBlock({ id: "target", type: "paragraph", content: "Target" });
    source.history.clear();
    destination.history.clear();

    crossDocumentBlockTransfer(source, destination, [first, second], { targetId: target, position: "inside" });

    expect(source.blocks.getRootIds()).toEqual([outside]);
    expect(destination.blocks.getChildIds(target)).toEqual([first, second]);
    expect(destination.blocks.getBlock(first)).toMatchObject({
      id: first,
      listProps: { collapsed: true, type: "checkbox", checked: true },
      pluginData: { test: { retained: true } },
      children: [{ id: "child", type: "test.counter", props: { count: 4 } }],
    });

    destination.undo();
    expect(destination.blocks.getRootIds()).toEqual([target]);
    expect(source.blocks.getRootIds()).toEqual([outside]);
    source.undo();
    expect(source.blocks.getRootIds()).toEqual([first, second, outside]);

    source.destroy();
    destination.destroy();
  });

  test("appends into an empty destination", () => {
    const source = createEditor();
    const destination = createEditor();
    source.blocks.insertBlock({ id: "moved", type: "paragraph", content: "Moved" });

    crossDocumentBlockTransfer(source, destination, ["moved"], { targetId: null, position: "after" });

    expect(source.blocks.getBlocks()).toEqual([]);
    expect(destination.blocks.getRootIds()).toEqual(["moved"]);
    source.destroy();
    destination.destroy();
  });

  test("rejects a duplicate block ID without changing either document", () => {
    const source = createEditor();
    const destination = createEditor();
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

  test("validates destination definitions before changing either document", () => {
    const source = createEditor();
    const destination = createRivtoEditor();
    source.blocks.insertBlock({ id: "custom", type: "test.counter", props: { count: 9 } });
    const sourceBefore = source.dump();

    expect(() => crossDocumentBlockTransfer(source, destination, ["custom"], {
      targetId: null,
      position: "after",
    })).toThrow("Unknown block type test.counter");
    expect(source.dump()).toEqual(sourceBefore);
    expect(destination.blocks.getBlocks()).toEqual([]);
    source.destroy();
    destination.destroy();
  });
});
