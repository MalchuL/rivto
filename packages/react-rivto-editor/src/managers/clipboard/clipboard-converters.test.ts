import { createCaretSelection, createStructuralSelection } from "@chulane/rivto";
import { createTestCoreEditor, createTestReactEditor } from "../../test-utils";
import { slashCommandExtension } from "../../extensions/built-ins/built-ins";
import { edgelessSelectionExtension } from "../../extensions/edgeless";
import { edgelessVisualsExtension } from "../../extensions/edgeless/visuals";

async function fixture() {
  const editor = await createTestCoreEditor({ mode: "edgeless" });
  const reactPanel = createTestReactEditor({ editor, extensions: [slashCommandExtension(), edgelessSelectionExtension(), edgelessVisualsExtension({ toolbar: false })] });
  return { editor, reactPanel, clipboard: reactPanel.editor.clipboard,
    close: () => { reactPanel.editor.destroy(); editor.destroy(); } };
}

test("converts each copied descendant once and supplies complete destination IDs before insertion", async () => {
  const f = await fixture();
  const root = f.editor.blocks.insertBlock({ id: "root", type: "paragraph", props: { transient: true, ref: "child" },
    children: [{ id: "child", type: "paragraph", content: "child" }] });
  const calls: string[] = [];
  const dispose = f.clipboard.registerBlockConverter("paragraph", {
    copy(block) { calls.push(`copy:${block.id}`); const props = { ...block.props }; delete props.transient; return { props }; },
    paste(block, context) {
      calls.push(`paste:${block.id}`);
      expect(f.editor.blocks.hasBlock(context.blockIdMap.get("root")!)).toBe(false);
      expect(context.blockIdMap.size).toBe(2);
      return { props: { ...block.props, ref: context.blockIdMap.get(String(block.props.ref)) ?? null } };
    },
  });
  const source = f.clipboard.copy(createStructuralSelection([root.id]))!;
  expect(source.blocks[0]!.props).toEqual({ ref: "child" });
  expect(f.editor.blocks.getBlockNode(root.id)!.props.transient).toBe(true);
  f.clipboard.paste({ bundle: source, placement: { mergeText: false } }, f.reactPanel);
  const pasted = f.editor.blocks.getBlocks().find(block => block.id !== root.id)!;
  expect(pasted.props.ref).toBe(pasted.children[0]!.id);
  expect(source.blocks[0]!.props.ref).toBe("child");
  expect(calls).toEqual(["copy:root", "copy:child", "paste:root", "paste:child"]);
  dispose(); dispose();
  f.clipboard.registerBlockConverter("paragraph", {});
  expect(() => f.clipboard.registerBlockConverter("paragraph", {})).toThrow();
  f.close();
  expect(() => f.clipboard.registerBlockConverter("another", {})).toThrow();
});

test("converter errors prevent insertion and processor errors remove created records", async () => {
  const f = await fixture();
  const source = { version: 4 as const, blocks: [{ id: "copied-block", type: "paragraph", content: "copied", props: {}, listProps: {}, pluginData: {}, children: [] }],
    elements: [{ id: "copied-element", type: "custom", childIds: [], props: {}, frame: { x: 0, y: 0, width: 100, height: 100 }, zIndex: 0 }] };
  const before = f.editor.getDocument().getSnapshot();
  const selection = f.reactPanel.selection.get();
  const stop = f.clipboard.registerElementConverter("custom", { paste() { throw new Error("reject converter"); } });
  expect(() => f.clipboard.paste({ bundle: source }, f.reactPanel)).toThrow("reject converter");
  expect(f.editor.getDocument().getSnapshot()).toEqual(before);
  expect(f.reactPanel.selection.get()).toEqual(selection);
  stop();
  const processor = f.editor.elements.registerProcessor({ id: "reject", priority: 0, processor() { throw new Error("reject processor"); } });
  expect(() => f.clipboard.paste({ bundle: source }, f.reactPanel)).toThrow("reject processor");
  expect(f.editor.getDocument().getSnapshot()).toEqual(before);
  processor(); f.close();
});

test("Duplicate shares converters and restores the complete result with one undo", async () => {
  const f = await fixture();
  const node = f.editor.elements.insertElement({ id: "object", type: "custom", props: { value: 7 }, frame: { x: 0, y: 0, width: 30, height: 40 }, zIndex: 0 });
  const calls: string[] = [];
  f.clipboard.registerElementConverter("custom", {
    copy(element, context) { calls.push(context.operation); return { props: { ...element.props, copied: true } }; },
    paste(element, context) { calls.push(context.operation); return { props: { ...element.props, target: context.elementIdMap.get(node.id)! } }; },
  });
  f.editor.commands.execute("edgeless.selection.set", [node.id]);
  f.editor.history.clear();
  const copied = f.editor.commands.execute("edgeless.visual.duplicate") as typeof node[];
  expect(calls).toEqual(["duplicate", "duplicate"]);
  expect(copied[0]!.props).toEqual({ value: 7, copied: true, target: copied[0]!.id });
  expect(copied[0]!.frame.x).toBe(24);
  f.editor.history.undo(); expect(f.editor.elements.hasElement(copied[0]!.id)).toBe(false);
  f.editor.history.redo(); expect(f.editor.elements.getElementNode(copied[0]!.id)!.props).toEqual(copied[0]!.props);
  f.close();
});

test("portable formats include group children and referenced blocks only once", async () => {
  const f = await fixture();
  f.editor.blocks.insertBlock({ id: "text-block", type: "paragraph", content: "Block text" });
  const group = f.editor.elements.insertElement({ id: "group", type: "group", zIndex: 0, children: [
    { id: "note", type: "sticker", props: { text: "Note" }, frame: { x: 0, y: 0, width: 80, height: 80 }, zIndex: 0 },
    { id: "card", type: "block", props: { startBlockId: "text-block", endBlockId: "text-block" }, frame: { x: 100, y: 0, width: 80, height: 80 }, zIndex: 1 },
  ] });
  const bundle = f.clipboard.copyElements([group.id], f.reactPanel);
  expect(f.reactPanel.editor.clipboardFormats.formatBundle(bundle).plain).toBe("Note\nBlock text");
  expect(bundle.blocks).toHaveLength(1);
  f.close();
});

test("type parsers are disposed and ordinary text keeps its fallback", async () => {
  const f = await fixture();
  const stop = f.clipboard.registerBlockConverter("paragraph", { parseText: text => text === "custom" ? { blocks: [{ type: "paragraph", content: "parsed" }] } : undefined });
  const context = { surface: "page" as const, defaultBlockType: "paragraph" };
  expect(f.reactPanel.editor.clipboardFormats.parseContent({ html: "", text: "custom" }, context)).toEqual({ blocks: [{ type: "paragraph", content: "parsed" }] });
  expect(f.reactPanel.editor.clipboardFormats.parseContent({ html: "", text: "ordinary" }, context)).toBeUndefined();
  stop();
  expect(f.reactPanel.editor.clipboardFormats.parseContent({ html: "", text: "custom" }, context)).toBeUndefined();
  f.close();
});

test("Cut formats before deleting and supplies its receiving panel to converters", async () => {
  const f = await fixture();
  const root = f.editor.blocks.insertBlock({ id: "cut", type: "paragraph", content: "keep on failure" });
  f.reactPanel.selection.set(createStructuralSelection([root.id]));
  const stop = f.clipboard.registerBlockConverter("paragraph", {
    copy(_block, context) { expect(context.operation).toBe("cut"); expect(context.reactPanel).toBe(f.reactPanel); return {}; },
    format() { throw new Error("cannot format"); },
  });
  expect(() => f.reactPanel.clipboard.cut()).toThrow("cannot format");
  expect(f.editor.blocks.hasBlock(root.id)).toBe(true);
  stop(); f.close();
});

for (const unrelated of [0, 200]) {
  test(`converter work follows the copied subtree, not ${unrelated} unrelated blocks`, async () => {
    const f = await fixture();
    f.editor.blocks.importForest(Array.from({ length: unrelated }, (_, index) => ({ id: `other-${index}`, type: "paragraph", content: "other" })));
    const root = f.editor.blocks.insertBlock({ id: "selected", type: "paragraph", children: [{ id: "selected-child", type: "paragraph" }] });
    let copies = 0, pastes = 0;
    f.clipboard.registerBlockConverter("paragraph", { copy() { copies++; return {}; }, paste() { pastes++; return {}; } });
    const bundle = f.clipboard.copy(createStructuralSelection([root.id]))!;
    f.clipboard.paste({ bundle, placement: { mergeText: false } }, f.reactPanel);
    expect({ copies, pastes }).toEqual({ copies: 2, pastes: 2 });
    f.close();
  });
}

test("portable formatting keeps a selected child whose parent is not selected", async () => {
  const f = await fixture();
  f.editor.elements.insertElement({ id: "group", type: "group", zIndex: 0, children: [
    { id: "note", type: "sticker", props: { text: "Selected" }, frame: { x: 0, y: 0, width: 80, height: 80 }, zIndex: 0 },
  ] });
  const bundle = f.clipboard.copyElements(["group"], f.reactPanel);
  bundle.selectedElementIds = ["note"];
  expect(f.reactPanel.editor.clipboardFormats.formatBundle(bundle).plain).toBe("Selected");
  f.close();
});

test("all converters see the same element map when an empty block card is omitted", async () => {
  const f = await fixture();
  let seen: string[] = [];
  f.clipboard.registerBlockConverter("paragraph", { paste(_block, context) { seen = [...context.elementIdMap.keys()]; return {}; } });
  const bundle = { version: 4 as const, blocks: [{ id: "text", type: "paragraph", content: "text", props: {}, listProps: {}, pluginData: {}, children: [] }],
    elements: [{ id: "empty-card", type: "block", props: { startBlockId: "missing", endBlockId: "missing" }, frame: { x: 0, y: 0, width: 80, height: 80 }, childIds: [], zIndex: 0 }] };
  f.clipboard.paste({ bundle, placement: { mergeText: false } }, f.reactPanel);
  expect(seen).toEqual([]);
  expect(f.editor.elements.getElementNodes().some(node => node.type === "block")).toBe(false);
  f.close();
});

test("partial text maps the merged first block to the caret destination only", async () => {
  const f = await fixture();
  const target = f.editor.blocks.insertBlock({ id: "target", type: "paragraph", content: "AB" });
  const bundle = { version: 4 as const, fromTextSelection: true, blocks: ["first", "second"].map(id => ({
    id, type: "paragraph", content: id, props: {}, listProps: {}, pluginData: {}, children: [],
  })) };
  const maps: Array<ReadonlyMap<string, string>> = [];
  f.clipboard.registerBlockConverter("paragraph", { paste(block, context) {
    maps.push(new Map(context.blockIdMap));
    return { props: { ...block.props, reference: context.blockIdMap.get("first")! } };
  } });
  f.clipboard.paste({ bundle, textTarget: createCaretSelection(target.id, 1) }, f.reactPanel);
  expect(maps[0]!.get("first")).toBe(target.id);
  const second = f.editor.blocks.getBlockNode(maps[0]!.get("second")!)!;
  expect(second).toMatchObject({ content: "secondB", props: { reference: target.id } });
  expect(f.editor.blocks.getBlockNode(target.id)!.content).toBe("Afirst");
  maps.length = 0;
  f.clipboard.paste({ bundle, textTarget: createStructuralSelection([target.id]) }, f.reactPanel);
  expect(maps[0]!.get("first")).not.toBe(target.id);
  expect(f.editor.blocks.getBlockNode(maps[0]!.get("first")!)!.content).toBe("first");
  f.close();
});

test("a canvas bundle does not also paste its portable text as document blocks", async () => {
  const f = await fixture();
  const node = f.editor.elements.insertElement({ id: "note", type: "sticker", props: { text: "First\nSecond" }, frame: { x: 0, y: 0, width: 80, height: 80 }, zIndex: 0 });
  const bundle = f.clipboard.copyElements([node.id], f.reactPanel);
  for (const preserveNewlines of [false, true]) {
    f.clipboard.paste({ bundle, text: "First\nSecond", defaultBlockType: "paragraph", placement: { preserveNewlines } }, f.reactPanel);
    expect(f.editor.blocks.getRootIds()).toEqual([]);
  }
  expect(f.editor.elements.getElementNodes()).toHaveLength(3);
  f.close();
});

test("slash Duplicate uses block converters and keeps the entire operation undoable", async () => {
  const f = await fixture();
  f.reactPanel.mode.set("block");
  const root = f.editor.blocks.insertBlock({ id: "source", type: "paragraph", children: [{ id: "child", type: "paragraph" }] });
  const operations: string[] = [];
  f.clipboard.registerBlockConverter("paragraph", {
    copy(_block, context) { operations.push(context.operation); return {}; },
    paste(block, context) { operations.push(context.operation); return { props: { ...block.props, source: context.blockIdMap.get("source")! } }; },
  });
  f.editor.history.clear();
  f.reactPanel.slashCommands.execute("block.duplicate", { blockId: root.id });
  const duplicate = f.editor.blocks.getBlocks().find(block => block.id !== root.id)!;
  expect(operations).toEqual(["duplicate", "duplicate", "duplicate", "duplicate"]);
  expect(duplicate.children[0]!.props.source).toBe(duplicate.id);
  f.editor.history.undo();
  expect(f.editor.blocks.getRootIds()).toEqual([root.id]);
  f.close();
});

test("failure after canvas insertion removes imported trees and separators, keeping source records", async () => {
  const f = await fixture();
  // A card needs the separator type when it is inserted after an existing block range.
  const { separatorBlockExtension } = await import("../../extensions/built-ins/separator/separator-block");
  const stopSeparator = f.reactPanel.editor.extensions.install(separatorBlockExtension());
  f.editor.blocks.insertBlock({ id: "original", type: "paragraph", content: "Keep" });
  f.editor.elements.insertElement({ id: "original-card", type: "block", props: { startBlockId: "original", endBlockId: "original" }, frame: { x: 0, y: 0, width: 80, height: 80 }, zIndex: 0 });
  const bundle = f.clipboard.copyElements(["original-card"], f.reactPanel);
  f.reactPanel.selection.set(createStructuralSelection(["original"]));
  const before = f.editor.getDocument().getSnapshot();
  const selection = f.reactPanel.selection.get();
  f.editor.history.clear();
  // Register a failure after the element strategy, when records and a separator already exist.
  const { ElementPasteStrategy } = await import("../../extensions/built-ins/clipboard/element-paste-strategy");
  const stopElements = f.clipboard.pasteStrategies.register("test.elements", new ElementPasteStrategy(f.reactPanel));
  const stop = f.clipboard.pasteStrategies.register("test.fail", {
    matches: () => true,
    paste() {
      expect(f.editor.elements.getElementNodes()).toHaveLength(2);
      expect(f.editor.blocks.getRootIds()).toHaveLength(3);
      throw new Error("late failure");
    },
  });
  expect(() => f.clipboard.paste({ bundle, placement: { mergeText: false } }, f.reactPanel)).toThrow("late failure");
  expect(f.editor.getDocument().getSnapshot()).toEqual(before);
  expect(f.reactPanel.selection.get()).toEqual(selection);
  f.editor.history.undo();
  expect(f.editor.getDocument().getSnapshot()).toEqual(before);
  f.editor.history.redo();
  expect(f.editor.getDocument().getSnapshot()).toEqual(before);
  stop(); stopElements(); stopSeparator(); f.close();
});

test("cleanup keeps an existing text destination when a later strategy fails", async () => {
  const f = await fixture();
  f.reactPanel.mode.set("block");
  f.editor.blocks.insertBlock({ id: "target", type: "paragraph", content: "AB" });
  const bundle = { version: 4 as const, fromTextSelection: true, blocks: ["first", "second"].map(id => ({
    id, type: "paragraph", content: id, props: {}, listProps: {}, pluginData: {}, children: [],
  })) };
  const stop = f.clipboard.pasteStrategies.register("test.fail", { matches: () => true, paste() { throw new Error("late failure"); } });
  expect(() => f.clipboard.paste({ bundle, textTarget: createCaretSelection("target", 1) }, f.reactPanel)).toThrow("late failure");
  expect(f.editor.blocks.getRootIds()).toEqual(["target"]);
  expect(f.editor.blocks.getBlockNode("target")!.content).toBe("Afirst");
  stop(); f.close();
});
