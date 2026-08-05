import {
  createRivtoEditor,
  DEFAULT_BLOCK_TYPE,
  type RivtoEditorApi,
} from "@chulane/rivto";
import { crossDocumentBlockTransfer } from "./cross-document-block-transfer";

function createEditor(): RivtoEditorApi {
  const editor = createRivtoEditor();
  editor.blocksRegistry.defineBlock({ type: "test.counter", defaultProps: { count: 0 } });
  return editor;
}

describe("cross-document block transfer", () => {
  test("preserves selected subtree order, data, and internal links", () => {
    const source = createEditor();
    const destination = createEditor();
    const first = source.blocks.insertBlock({
      id: "first",
      type: DEFAULT_BLOCK_TYPE,
      content: "First",
      collapsed: true,
      listProps: { type: "checkbox", checked: true },
      pluginData: { test: { retained: true } },
      children: [{ id: "child", type: "test.counter", props: { count: 4 } }],
    });
    const second = source.blocks.insertBlock({ id: "second", type: DEFAULT_BLOCK_TYPE, content: "Second" });
    const outside = source.blocks.insertBlock({ id: "outside", type: DEFAULT_BLOCK_TYPE, content: "Outside" });
    source.links.createLink({ id: "internal", from: { blockId: first }, to: { blockId: "child" }, meta: { kind: "test" } });
    source.links.createLink({ id: "external", from: { blockId: "child" }, to: { blockId: outside } });
    const target = destination.blocks.insertBlock({ id: "target", type: DEFAULT_BLOCK_TYPE, content: "Target" });
    source.history.clear();
    destination.history.clear();

    crossDocumentBlockTransfer(source, destination, [first, second], { targetId: target, position: "inside" });

    expect(source.blocks.getRootIds()).toEqual([outside]);
    expect(source.links.getLinks()).toEqual([]);
    expect(destination.blocks.getChildIds(target)).toEqual([first, second]);
    expect(destination.blocks.getBlock(first)).toMatchObject({
      id: first,
      collapsed: true,
      listProps: { type: "checkbox", checked: true },
      pluginData: { test: { retained: true } },
      children: [{ id: "child", type: "test.counter", props: { count: 4 } }],
    });
    expect(destination.links.getLinks()).toEqual([{
      id: "internal",
      from: { blockId: first },
      to: { blockId: "child" },
      meta: { kind: "test" },
    }]);

    destination.undo();
    expect(destination.blocks.getRootIds()).toEqual([target]);
    expect(source.blocks.getRootIds()).toEqual([outside]);
    source.undo();
    expect(source.blocks.getRootIds()).toEqual([first, second, outside]);
    expect(source.links.getLink("internal")).toBeDefined();

    source.destroy();
    destination.destroy();
  });

  test("appends into an empty destination", () => {
    const source = createEditor();
    const destination = createEditor();
    source.blocks.insertBlock({ id: "moved", type: DEFAULT_BLOCK_TYPE, content: "Moved" });

    crossDocumentBlockTransfer(source, destination, ["moved"], { targetId: null, position: "after" });

    expect(source.blocks.getBlocks()).toEqual([]);
    expect(destination.blocks.getRootIds()).toEqual(["moved"]);
    source.destroy();
    destination.destroy();
  });

  test.each(["block", "link"])("rejects a duplicate %s ID without changing either document", (kind) => {
    const source = createEditor();
    const destination = createEditor();
    source.blocks.insertBlock({
      id: "moved",
      type: DEFAULT_BLOCK_TYPE,
      children: [{ id: "child", type: DEFAULT_BLOCK_TYPE }],
    });
    source.links.createLink({ id: "shared-link", from: { blockId: "moved" }, to: { blockId: "child" } });
    if (kind === "block") {
      destination.blocks.insertBlock({ id: "child", type: DEFAULT_BLOCK_TYPE });
    } else {
      const one = destination.blocks.insertBlock({ id: "one", type: DEFAULT_BLOCK_TYPE });
      const two = destination.blocks.insertBlock({ id: "two", type: DEFAULT_BLOCK_TYPE });
      destination.links.createLink({ id: "shared-link", from: { blockId: one }, to: { blockId: two } });
    }
    const sourceBefore = source.dump();
    const destinationBefore = destination.dump();

    expect(() => crossDocumentBlockTransfer(source, destination, ["moved"], {
      targetId: null,
      position: "after",
    })).toThrow(`Destination already contains ${kind}`);
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
