/** Clipboard operations retain hierarchy and handle text ranges explicitly. */
import { createTestEditor as createRivtoEditor, createStructuralSelection, testCaret, testRange } from "../../editor/test-utils";
import { PasteStrategyRegistry } from "./strategies";

describe("core ClipboardManager", () => {
  it.each(["block", "edgeless"] as const)("replaces an explicit reverse text range in %s mode atomically", (mode) => {
    const editor = createRivtoEditor({ mode });
    const id = editor.blocks.insertBlock({ type: "paragraph", content: "BeforeAfter",
      children: [{ type: "paragraph", content: "Keep child" }] });
    const textTarget = testRange(editor, { blockId: id, offset: 6 }, { blockId: id, offset: 0 });
    const bundle = editor.clipboard.copyText(textTarget)!;
    expect(bundle.blocks[0]?.children).toEqual([]);
    expect(bundle.blocks[0]?.content).toBe("Before");
    const updates = jest.fn();
    editor.document.subscribe(updates);
    const caret = editor.clipboard.paste({ textTarget, text: "One\nTwo", defaultBlockType: "paragraph" });
    expect(updates).toHaveBeenCalledTimes(1);
    const roots = editor.blocks.getBlocks();
    expect(roots.map((block) => block.content)).toEqual(["One", "TwoAfter"]);
    expect(roots[0]?.children[0]?.content).toBe("Keep child");
    expect(caret).toEqual({ blockId: roots[1]!.id, offset: 3 });
    expect(editor.selection.get()).toMatchObject({
      blocks: [{ id: roots[1]!.id, start: 3, end: 3 }],
    });
    editor.undo();
    expect(editor.blocks.getBlocks()).toMatchObject([{ id, content: "BeforeAfter", children: [{ content: "Keep child" }] }]);
    editor.destroy();
  });

  it("copies overlapping offsets as empty text and still pastes at the clamped caret", () => {
    const editor = createRivtoEditor();
    const first = editor.blocks.insertBlock({ type: "paragraph", content: "First" });
    const last = editor.blocks.insertBlock({ type: "paragraph", content: "Last" }, first);
    const crossBlock = testRange(editor, { blockId: first, offset: 2 }, { blockId: last, offset: 1 });
    expect(editor.clipboard.copyText(crossBlock)?.blocks.map((block) => block.content)).toEqual(["rst", "L"]);
    const textTarget = testRange(editor, { blockId: first, offset: 0 }, { blockId: first, offset: 99 });
    expect(editor.clipboard.copyText(textTarget)?.blocks[0]?.content).toBe("");
    expect(editor.clipboard.paste({ textTarget, text: "Replacement", defaultBlockType: "paragraph" }))
      .toEqual({ blockId: first, offset: 11 });
    expect(editor.blocks.getBlock(first)?.content).toBe("ReplacementFirst");
    editor.destroy();
  });

  it("imports older partial-text bundles with multiple blocks into an explicit target", () => {
    const editor = createRivtoEditor();
    const id = editor.blocks.insertBlock({ type: "paragraph", content: "LeftRight" });
    const bundle = { version: 4 as const, startsWithText: true, blocks: ["First", "Middle", "Last"].map((content) => ({
      id: content, type: "paragraph", content, props: {}, listProps: {}, pluginData: {}, children: [],
    })) };
    const caret = editor.clipboard.paste({ bundle, textTarget: testCaret(id, 4) });
    const blocks = editor.blocks.getBlocks();
    expect(blocks.map((block) => block.content)).toEqual(["LeftFirst", "Middle", "LastRight"]);
    expect(caret).toEqual({ blockId: blocks[2]!.id, offset: 4 });
    editor.undo();
    expect(editor.blocks.getBlocks()).toMatchObject([{ id, content: "LeftRight" }]);
    editor.destroy();
  });

  it("copies and atomically cuts the current structured selection", () => {
    const editor = createRivtoEditor();
    const id = editor.blocks.insertBlock({ type: "paragraph", content: "Selected" });
    editor.selection.set(createStructuralSelection([id], id, id));
    const updates = jest.fn();
    editor.document.subscribe(updates);

    expect(editor.clipboard.copy()?.blocks[0]?.content).toBe("Selected");
    expect(updates).not.toHaveBeenCalled();
    expect(editor.clipboard.cut()?.blocks).toMatchObject([{ id, content: "Selected" }]);
    expect(updates).toHaveBeenCalledTimes(1);
    expect(editor.blocks.getBlocks()).toEqual([]);
    expect(editor.selection.get()).toBeUndefined();

    editor.undo();
    expect(editor.blocks.getBlocks()).toMatchObject([{ id, content: "Selected" }]);
    editor.destroy();
  });

  it("preserves copied hierarchy in the structured bundle", () => {
    const editor = createRivtoEditor();
    const first = editor.blocks.insertBlock({
      type: "paragraph",
      content: "Root <one>\nline",
      children: [{
        type: "paragraph",
        content: "Child\ncontinuation",
        children: [{ type: "paragraph", content: "Grandchild" }],
      }],
    });
    editor.blocks.updateBlock(first, { listProps: { collapsed: true } });
    const second = editor.blocks.insertBlock({ type: "paragraph", content: "Second" }, first);
    editor.selection.set(createStructuralSelection([first, second], first, second));

    const payload = editor.clipboard.copy()!;

    expect(payload.blocks).toMatchObject([{
      id: first,
      listProps: { collapsed: true },
      children: [{ content: "Child\ncontinuation", children: [{ content: "Grandchild" }] }],
    }, { id: second }]);
    editor.destroy();
  });

  it("trims copied text in the structured bundle", () => {
    const editor = createRivtoEditor();
    editor.blocksRegistry.defineBlock({ type: "test.raw" });
    const id = editor.blocks.insertBlock({ type: "test.raw", content: "Selected text" });
    const textTarget = testRange(editor, { blockId: id, offset: 0 }, { blockId: id, offset: 8 });

    const payload = editor.clipboard.copyText(textTarget)!;

    expect(payload.blocks[0]?.content).toBe("Selected");
    expect(editor.selection.get()).toBeUndefined();
    editor.destroy();
  });

  it("does not interpret extension-owned list properties", () => {
    const editor = createRivtoEditor();
    const start = editor.blocks.insertBlock({ type: "paragraph", content: "One", listProps: { type: "start_numbered_list" } });
    const next = editor.blocks.insertBlock({ type: "paragraph", content: "Two", listProps: { type: "numbered_list" } }, start);
    const gap = editor.blocks.insertBlock({ type: "paragraph", content: "Gap" }, next);
    const task = editor.blocks.insertBlock({ type: "paragraph", content: "Done", listProps: { type: "checkbox", checked: true } }, gap);
    const resume = editor.blocks.insertBlock({ type: "paragraph", content: "Three", listProps: { type: "continue_numbered_list" } }, task);
    editor.selection.set(createStructuralSelection([start, next, gap, task, resume], start, resume));

    const payload = editor.clipboard.copy()!;
    expect(payload.blocks).toMatchObject([
      { listProps: { type: "start_numbered_list" } },
      { listProps: { type: "numbered_list" } },
      { listProps: {} },
      { listProps: { type: "checkbox", checked: true } },
      { listProps: { type: "continue_numbered_list" } },
    ]);
    const target = createRivtoEditor();
    target.clipboard.paste({ bundle: payload, placement: { mergeText: false } });
    expect(target.blocks.getBlocks()).toMatchObject([
      { listProps: { type: "start_numbered_list" } },
      { listProps: { type: "numbered_list" } },
      { listProps: {} },
      { listProps: { type: "checkbox", checked: true } },
      { listProps: { type: "continue_numbered_list" } },
    ]);
    target.destroy();
    editor.destroy();
  });

  it("prefers structured data over plain text", () => {
    const source = createRivtoEditor();
    const copiedId = source.blocks.insertBlock({ type: "paragraph", content: "Structured" });
    source.selection.set(createStructuralSelection([copiedId]));
    const payload = source.clipboard.copy()!;
    expect(payload.version).toBe(4);

    const target = createRivtoEditor();
    const targetId = target.blocks.insertBlock({ type: "paragraph", content: "" });
    const textTarget = testCaret(targetId, 0);
    target.clipboard.paste({
      textTarget,
      structured: JSON.stringify(payload),
      text: "plain",
    });
    expect(target.blocks.getBlocks().map(({ content }) => content)).toEqual(["", "Structured"]);


    target.clipboard.paste({ textTarget, text: "plain", defaultBlockType: "paragraph" });
    expect(target.blocks.getBlock(targetId)?.content).toBe("plain");
    target.clipboard.paste({
      textTarget: testCaret(targetId, 5),
      structured: JSON.stringify({ ...payload, version: 1 }),
      text: "fallback",
      defaultBlockType: "paragraph",
    });
    expect(target.blocks.getBlocks().map(({ content }) => content)).toEqual([
      "plainfallback",
      "Structured",
    ]);
    source.destroy();
    target.destroy();
  });

  it("places paste after a selected parent when focus ends on its nested child", () => {
    const editor = createRivtoEditor();
    const parent = editor.blocks.insertBlock({
      type: "paragraph",
      content: "Parent",
      children: [{ type: "paragraph", content: "Child" }],
    });
    const child = editor.blocks.getChildIds(parent)[0]!;
    const tail = editor.blocks.insertBlock({ type: "paragraph", content: "Tail" }, parent);
    editor.selection.set(createStructuralSelection([parent, child], parent, child));

    editor.clipboard.paste({
      bundle: {
        version: 4,
        blocks: [{
          id: "clipboard-block",
          type: "paragraph",
          listProps: {},
          props: {},
          pluginData: {},
          content: "Pasted",
          children: [],
        }],
      },
      placement: { parentId: parent, afterId: child, mergeText: false },
    });

    const roots = editor.blocks.getBlocks();
    expect(roots.map(({ content }) => content)).toEqual(["Parent", "Pasted", "Tail"]);
    expect(roots.map(({ id }) => id)).toEqual([parent, expect.any(String), tail]);
    expect(editor.blocks.getBlock(parent)?.children.map(({ id }) => id)).toEqual([child]);
    editor.destroy();
  });

  it("restores original block IDs when pasting a cut bundle", () => {
    const editor = createRivtoEditor();
    const first = editor.blocks.insertBlock({
      type: "paragraph",
      content: "First",
      children: [{ type: "paragraph", content: "Nested" }],
    });
    const child = editor.blocks.getBlock(first)!.children[0]!.id;
    const second = editor.blocks.insertBlock({ type: "paragraph", content: "Second" }, first);
    editor.selection.set(createStructuralSelection([first, second], first, second));

    const payload = editor.clipboard.cut()!;
    editor.clipboard.paste({ bundle: payload, placement: { mergeText: false } });

    expect(editor.blocks.getBlocks()).toMatchObject([
      { id: first, content: "First", children: [{ id: child, content: "Nested" }] },
      { id: second, content: "Second" },
    ]);
    editor.destroy();
  });

  it("remints IDs when originals still exist in the destination", () => {
    const editor = createRivtoEditor();
    const first = editor.blocks.insertBlock({ type: "paragraph", content: "First" });
    const second = editor.blocks.insertBlock({ type: "paragraph", content: "Second" }, first);
    editor.selection.set(createStructuralSelection([first, second], first, second));
    let generated = 0;
    editor.document.blocks.generateId = () => `pasted-${++generated}`;
    let importedIds: ReadonlyMap<string, string> | undefined;
    editor.clipboard.pasteStrategies.register("test.observe-import", {
      matches: () => true,
      paste: (context) => {
        importedIds = context.blockIdMap;
        return undefined;
      },
    });

    const payload = editor.clipboard.copy()!;
    editor.clipboard.paste({ bundle: payload, placement: { mergeText: false } });

    const ids = editor.blocks.getBlocks().map((block) => block.id);
    expect(ids).toEqual([first, second, "pasted-1", "pasted-2"]);
    expect([...(importedIds ?? [])]).toEqual([
      [first, "pasted-1"],
      [second, "pasted-2"],
    ]);
    editor.destroy();
  });

  it("passes element import identities to later paste strategies", () => {
    const editor = createRivtoEditor();
    const selection = { type: "selection" as const, blocks: [], pluginData: { test: true } };
    const elementIdMap = new Map([["source-element", "pasted-element"]]);
    let observed: ReadonlyMap<string, string> | undefined;
    editor.clipboard.pasteStrategies.register("test.element-import", {
      matches: () => true,
      paste: () => ({ proposedSelection: selection, elementIdMap }),
    });
    editor.clipboard.pasteStrategies.register("test.observe-element-import", {
      matches: (context) => {
        observed = context.elementIdMap;
        return true;
      },
      paste: () => undefined,
    });

    editor.clipboard.paste();

    expect(observed).toBe(elementIdMap);
    editor.destroy();
  });

  it("remints IDs when pasting the same cut bundle a second time", () => {
    const editor = createRivtoEditor();
    const id = editor.blocks.insertBlock({ type: "paragraph", content: "Twice" });
    editor.selection.set(createStructuralSelection([id], id, id));

    const payload = editor.clipboard.cut()!;
    editor.clipboard.paste({ bundle: payload, placement: { mergeText: false } });
    editor.clipboard.paste({ bundle: payload, placement: { mergeText: false } });

    const ids = editor.blocks.getBlocks().map((block) => block.id);
    expect(ids).toHaveLength(2);
    expect(ids[0]).toBe(id);
    expect(ids[1]).not.toBe(id);
    editor.destroy();
  });

  it("preserves multiline plain text inside one block when requested", () => {
    const editor = createRivtoEditor();
    const id = editor.blocks.insertBlock({ type: "paragraph", content: "Before " });
    const textTarget = testCaret(id, 7);

    editor.clipboard.paste({
      textTarget,
      text: "first\n    second",
      defaultBlockType: "paragraph",
      placement: { preserveNewlines: true },
    });

    expect(editor.blocks.getRootIds()).toEqual([id]);
    expect(editor.blocks.getBlock(id)?.content).toBe("Before first\n    second");
    editor.destroy();
  });

  it("does not claim the clipboard for a collapsed caret", () => {
    const editor = createRivtoEditor();
    const id = editor.blocks.insertBlock({ type: "paragraph", content: "Hello" });
    const textTarget = testCaret(id, 2);

    expect(editor.clipboard.copyText(textTarget)).toBeUndefined();
    expect(editor.clipboard.cut()).toBeUndefined();
    expect(editor.blocks.getBlock(id)?.content).toBe("Hello");
    editor.destroy();
  });

  it("copies and deletes an explicitly selected empty block", () => {
    const editor = createRivtoEditor();
    const id = editor.blocks.insertBlock({ type: "paragraph", content: "" });
    editor.selection.set(createStructuralSelection([id]));

    expect(editor.clipboard.copy()?.blocks).toMatchObject([{ id, content: "" }]);
    editor.selection.delete();
    expect(editor.blocks.getBlock(id)).toBeUndefined();
    editor.destroy();
  });

  it("marks a prefix range as text and merges it into the destination", () => {
    const source = createRivtoEditor();
    const sourceId = source.blocks.insertBlock({ type: "paragraph", content: "Hello" });
    const bundle = source.clipboard.copyText(testRange(
      source,
      { blockId: sourceId, offset: 0 },
      { blockId: sourceId, offset: 3 },
    ))!;
    expect(bundle.startsWithText).toBe(true);

    const target = createRivtoEditor();
    const targetId = target.blocks.insertBlock({ type: "paragraph", content: "AB" });
    target.clipboard.paste({ bundle, textTarget: testCaret(targetId, 1) });
    expect(target.blocks.getBlock(targetId)?.content).toBe("AHelB");
    source.destroy();
    target.destroy();
  });

  it("rejects cyclic structured clipboard input and no-ops without a text fallback", () => {
    const editor = createRivtoEditor();
    const id = editor.blocks.insertBlock({ type: "paragraph", content: "Kept" });
    const cyclic = {
      id: "cycle",
      type: "paragraph",
      listProps: {},
      props: {},
      pluginData: {},
      content: "Loop",
      children: [] as unknown[],
    };
    cyclic.children.push(cyclic);

    editor.clipboard.paste({
      bundle: { version: 4, blocks: [cyclic] } as never,
    });
    expect(editor.blocks.getRootIds()).toEqual([id]);
    expect(editor.blocks.getBlock(id)?.content).toBe("Kept");
    editor.destroy();
  });

  it("inserts a mergeable bundle as blocks when mergeText is false", () => {
    const editor = createRivtoEditor();
    const id = editor.blocks.insertBlock({ type: "paragraph", content: "Host" });
    editor.clipboard.paste({
      textTarget: testCaret(id, 2),
      placement: { mergeText: false },
      bundle: {
        version: 4,
        startsWithText: true,
        blocks: [{
          id: "clip", type: "paragraph", content: "Clip", props: {}, listProps: {}, pluginData: {}, children: [],
        }],
      },
    });
    expect(editor.blocks.getBlocks().map((block) => block.content)).toEqual(["Host", "Clip"]);
    editor.destroy();
  });

  it("owns strategy IDs at registration without stale disposers removing replacements", () => {
    const registry = new PasteStrategyRegistry();
    const first = { matches: () => true, paste: () => undefined };
    const replacement = { matches: () => true, paste: () => undefined };
    const disposeFirst = registry.register("test", first);
    registry.register("test", replacement);

    disposeFirst();

    expect(registry.findMatchingPasteStrategies({ selection: undefined }, {})).toEqual([replacement]);
  });
});
