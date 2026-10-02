/**
 * Consistency between the block editor and the plain-text projection.
 *
 * Both views read and write the same blocks. These tests run single-block and
 * multi-block edits, then check that the plain outline and the stored tree
 * still describe the same visible blocks.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { EditorBlock, RivtoEditorApi } from "@chulane/rivto";
import { EditorView } from "../../editor-view";
import { matchesShortcut, parseShortcut } from "../../managers";
import { createReactEditor } from "../../react-editor";
import { createTestCoreEditor } from "../../test-utils";
import { splitBlockAt } from "../../views";
import { standardPreset } from "../built-ins/built-ins";
import {
  isPlainBlockVisible,
  plainEditorExtension,
  plainIndentBlocks,
  projectPlainOutline,
  type PlainOutlineNode,
} from "./index";

const PARAGRAPH = "paragraph";
const WIDGET = "widget";
const NOTE = "note";

function createPair(blockTypes: readonly string[] = [PARAGRAPH], options?: {
  readonly separators?: boolean;
  readonly bullets?: boolean;
}) {
  const editor = createTestCoreEditor();
  editor.blockRegistry.defineBlock({ type: WIDGET, title: "Widget" });
  editor.blockRegistry.defineBlock({ type: NOTE, title: "Note" });
  const types = new Set(blockTypes);
  const reactEditor = createReactEditor({
    editor,
    extensions: [
      standardPreset(),
      plainEditorExtension({
        blockTypes,
        separators: options?.separators,
        bullets: options?.bullets,
      }),
    ],
  });
  return { editor, reactEditor, types };
}

function collectIds(editor: RivtoEditorApi): string[] {
  const ids: string[] = [];
  const walk = (nodes: readonly EditorBlock[]) => {
    for (const node of nodes) {
      ids.push(node.id);
      walk(node.children);
    }
  };
  walk(editor.blocks.getBlocks());
  return ids;
}

function flatten(nodes: readonly PlainOutlineNode[]): PlainOutlineNode[] {
  return nodes.flatMap((node) => [node, ...flatten(node.children)]);
}

function assertAligned(editor: RivtoEditorApi, types: ReadonlySet<string>): void {
  const plain = new Map(flatten(projectPlainOutline(editor.blocks, types)).map((node) => [node.id, node]));
  for (const id of collectIds(editor)) {
    const stored = editor.blocks.getBlockNode(id);
    const shown = plain.get(id);
    if (isPlainBlockVisible(editor.blocks, id, types)) {
      expect(shown?.content).toBe(stored?.content);
      expect(shown?.type).toBe(stored?.type);
      expect(shown?.parentId).toBe(editor.blocks.getParentId(id));
    } else {
      expect(shown).toBeUndefined();
    }
  }
}

describe("plain and block editors stay consistent", () => {
  const editors: Array<ReturnType<typeof createPair>> = [];

  afterEach(async () => {
    const pending = editors.splice(0);
    await Promise.all(pending.map(async ({ editor, reactEditor }) => {
      reactEditor.destroy();
      await editor.destroy();
    }));
  });

  function open(blockTypes?: readonly string[], options?: {
    readonly separators?: boolean;
    readonly bullets?: boolean;
  }) {
    const pair = createPair(blockTypes, options);
    editors.push(pair);
    return pair;
  }

  test("Shift+Enter does not split a block, and a newline stays in that block", () => {
    const enter = parseShortcut("Enter");
    const plainEnter = { key: "Enter", code: "Enter", shiftKey: false, altKey: false, ctrlKey: false, metaKey: false } as KeyboardEvent;
    const shiftEnter = { ...plainEnter, shiftKey: true } as KeyboardEvent;
    expect(matchesShortcut(enter, plainEnter)).toBe(true);
    expect(matchesShortcut(enter, shiftEnter)).toBe(false);

    const { editor, types } = open();
    const id = editor.blocks.insertBlock({
      type: PARAGRAPH,
      content: "first line\nsecond line\nthird line",
    }).id;
    assertAligned(editor, types);
    expect(editor.blocks.getRootIds()).toEqual([id]);
    expect(projectPlainOutline(editor.blocks, types)).toEqual([
      expect.objectContaining({ id, content: "first line\nsecond line\nthird line", depth: 0, parentId: null, children: [] }),
    ]);
  });

  test("Enter's split inserts the following text as the next block", () => {
    const { editor, reactEditor, types } = open();
    const sourceId = editor.blocks.insertBlock({ type: PARAGRAPH, content: "HelloWorld" }).id;
    const source = editor.blocks.getBlock(sourceId)!;
    const created = splitBlockAt(reactEditor, source, 5);
    assertAligned(editor, types);
    expect(editor.blocks.getBlockNode(sourceId)?.content).toBe("Hello");
    expect(created.content).toBe("World");
    expect(editor.blocks.getParentId(created.id)).toBeNull();
    expect(editor.blocks.getRootIds()).toEqual([sourceId, created.id]);
    expect(flatten(projectPlainOutline(editor.blocks, types)).map((node) => node.content)).toEqual(["Hello", "World"]);
  });

  test("Enter under a block that already has children nests the new block there", () => {
    const { editor, reactEditor, types } = open();
    const parentId = editor.blocks.insertBlock({ type: PARAGRAPH, content: "Parent text" }).id;
    const childId = editor.blocks.insertBlock({ type: PARAGRAPH, content: "Existing child" }, parentId).id;
    editor.blocks.indentBlock(childId);
    const parent = editor.blocks.getBlock(parentId)!;
    const created = splitBlockAt(reactEditor, parent, 6);
    editor.blocks.indentBlock(created.id);
    editor.blocks.moveBlock(created.id, null);
    assertAligned(editor, types);
    expect(editor.blocks.getBlockNode(parentId)?.childIds).toEqual([created.id, childId]);
    expect(editor.blocks.getBlockNode(created.id)?.content).toBe(" text");
    const [outline] = projectPlainOutline(editor.blocks, types);
    expect(outline?.children.map((node) => node.id)).toEqual([created.id, childId]);
  });

  test("single and many block edits stay aligned, including hidden branches", () => {
    const { editor, types } = open();
    const first = editor.blocks.insertBlock({ type: PARAGRAPH, content: "one" }).id;
    const second = editor.blocks.insertBlock({ type: PARAGRAPH, content: "two" }, first).id;
    const third = editor.blocks.insertBlock({ type: PARAGRAPH, content: "three" }, second).id;
    const widget = editor.blocks.insertBlock({
      type: WIDGET,
      content: "hidden-widget-text",
      children: [{ type: PARAGRAPH, content: "should-stay-hidden" }],
    }, third).id;
    assertAligned(editor, types);
    expect(flatten(projectPlainOutline(editor.blocks, types)).map((node) => node.id)).toEqual([first, second, third]);

    editor.blocks.updateBlock(first, { content: "one\nstill one block" });
    editor.blocks.updateBlocks([
      { id: second, patch: { content: "two\nlines" } },
      { id: third, patch: { content: "three updated" } },
    ]);
    assertAligned(editor, types);
    expect(editor.blocks.getRootIds()).toHaveLength(4);

    editor.blocks.moveBlocks([third, second], first, "before");
    assertAligned(editor, types);
    expect(editor.blocks.getRootIds().filter((id) => id !== widget)).toEqual(
      flatten(projectPlainOutline(editor.blocks, types)).map((node) => node.id),
    );

    editor.blocks.removeBlocks([second, third]);
    assertAligned(editor, types);
    expect(flatten(projectPlainOutline(editor.blocks, types)).map((node) => node.id)).toEqual([first]);
    expect(editor.blocks.getBlockNode(widget)?.content).toBe("hidden-widget-text");

    const extra = editor.blocks.insertBlock({ type: PARAGRAPH, content: "tail" }, first).id;
    const joined = editor.blocks.mergeBlocks(first, extra);
    assertAligned(editor, types);
    expect(editor.blocks.getBlockNode(first)?.content).toBe("one\nstill one blocktail");
    expect(joined).toBe("one\nstill one block".length);
    expect(editor.blocks.getBlockNode(extra)).toBeUndefined();
  });

  test("plain indent skips a hidden sibling that block indent would adopt", () => {
    const plain = open();
    const block = open();
    const seed = (editor: RivtoEditorApi) => {
      const visible = editor.blocks.insertBlock({ type: PARAGRAPH, content: "Visible" }).id;
      const widget = editor.blocks.insertBlock({ type: WIDGET, content: "Hidden" }, visible).id;
      const below = editor.blocks.insertBlock({ type: PARAGRAPH, content: "Below" }, widget).id;
      const trailing = editor.blocks.insertBlock({ type: PARAGRAPH, content: "Trailing" }, below).id;
      return { visible, widget, below, trailing };
    };
    const plainIds = seed(plain.editor);
    const blockIds = seed(block.editor);

    expect(plainIndentBlocks(plain.editor.blocks, [plainIds.below, plainIds.trailing], plain.types)).toBe(true);
    expect(plain.editor.blocks.getParentId(plainIds.below)).toBe(plainIds.visible);
    expect(plain.editor.blocks.getParentId(plainIds.trailing)).toBe(plainIds.visible);
    expect(plain.editor.blocks.getBlockNode(plainIds.visible)?.childIds).toEqual([plainIds.below, plainIds.trailing]);
    expect(plain.editor.blocks.getParentId(plainIds.widget)).toBeNull();
    assertAligned(plain.editor, plain.types);
    plain.editor.history.undo();
    expect(plain.editor.blocks.getParentId(plainIds.below)).toBeNull();
    assertAligned(plain.editor, plain.types);

    block.editor.blocks.indentBlocks([blockIds.below, blockIds.trailing]);
    expect(block.editor.blocks.getParentId(blockIds.below)).toBe(blockIds.widget);
    expect(block.editor.blocks.getParentId(blockIds.trailing)).toBe(blockIds.widget);
  });

  test("plain indent matches block indent when the previous sibling is visible", () => {
    const plain = open();
    const block = open();
    const seed = (editor: RivtoEditorApi) => {
      const parent = editor.blocks.insertBlock({ type: PARAGRAPH, content: "Parent" }).id;
      const child = editor.blocks.insertBlock({ type: PARAGRAPH, content: "Child" }, parent).id;
      return { parent, child };
    };
    const plainIds = seed(plain.editor);
    const blockIds = seed(block.editor);
    expect(plainIndentBlocks(plain.editor.blocks, [plainIds.child], plain.types)).toBe(true);
    block.editor.blocks.indentBlock(blockIds.child);
    expect(plain.editor.blocks.getParentId(plainIds.child)).toBe(plainIds.parent);
    expect(block.editor.blocks.getParentId(blockIds.child)).toBe(blockIds.parent);
    assertAligned(plain.editor, plain.types);
    assertAligned(block.editor, block.types);

    plain.editor.blocks.outdentBlock(plainIds.child);
    block.editor.blocks.outdentBlock(blockIds.child);
    expect(plain.editor.blocks.getParentId(plainIds.child)).toBeNull();
    expect(block.editor.blocks.getParentId(blockIds.child)).toBeNull();
    assertAligned(plain.editor, plain.types);
  });

  test("an extra allowed type is shown and other types stay hidden", () => {
    const { editor, types } = open([PARAGRAPH, NOTE]);
    const note = editor.blocks.insertBlock({ type: NOTE, content: "Note body" }).id;
    const widget = editor.blocks.insertBlock({
      type: WIDGET,
      content: "widget body",
      children: [{ type: NOTE, content: "note inside widget" }],
    }, note).id;
    assertAligned(editor, types);
    expect(flatten(projectPlainOutline(editor.blocks, types)).map((node) => node.id)).toEqual([note]);
    expect(editor.blocks.getBlockNode(widget)).toBeDefined();
    expect(isPlainBlockVisible(editor.blocks, widget, types)).toBe(false);
  });

  test("plain mode renders the same text without hidden blocks, borders, or bullets when disabled", () => {
    const shown = open();
    const parent = shown.editor.blocks.insertBlock({ type: PARAGRAPH, content: "Visible note" }).id;
    const child = shown.editor.blocks.insertBlock({ type: PARAGRAPH, content: "Nested note" }, parent).id;
    shown.editor.blocks.indentBlock(child);
    shown.editor.blocks.insertBlock({
      type: WIDGET,
      content: "hidden-widget-text",
      children: [{ type: PARAGRAPH, content: "should-stay-hidden" }],
    }, child);
    shown.editor.mode.set("plain");
    const plainHtml = renderToStaticMarkup(createElement(EditorView, { reactEditor: shown.reactEditor }));
    expect(plainHtml).toContain("Visible note");
    expect(plainHtml).toContain("Nested note");
    expect(plainHtml).toContain("plain-bullet");
    expect(plainHtml).toContain("data-plain-editor=\"true\"");
    expect(plainHtml).not.toContain("data-separators");
    expect(plainHtml).not.toContain("hidden-widget-text");
    expect(plainHtml).not.toContain("should-stay-hidden");
    expect(plainHtml).not.toContain("data-block-type=\"widget\"");
    expect(plainHtml).not.toContain("border-dashed");

    shown.editor.mode.set("block");
    const blockHtml = renderToStaticMarkup(createElement(EditorView, { reactEditor: shown.reactEditor }));
    expect(blockHtml).toContain("Visible note");
    expect(blockHtml).toContain("Nested note");
    expect(blockHtml).toContain("hidden-widget-text");
    expect(blockHtml).toContain("should-stay-hidden");
    expect(blockHtml).not.toContain("plain-bullet");

    const separated = open(undefined, { separators: true, bullets: false });
    const root = separated.editor.blocks.insertBlock({ type: PARAGRAPH, content: "Root line" }).id;
    const nested = separated.editor.blocks.insertBlock({ type: PARAGRAPH, content: "Nested line" }, root).id;
    separated.editor.blocks.indentBlock(nested);
    separated.editor.mode.set("plain");
    const separatedHtml = renderToStaticMarkup(createElement(EditorView, { reactEditor: separated.reactEditor }));
    expect(separatedHtml).toContain("data-separators=\"true\"");
    expect(separatedHtml).toContain("Root line");
    expect(separatedHtml).toContain("Nested line");
    expect(separatedHtml).not.toContain("plain-bullet");
  });
});
