/**
 * Generic view fallback and dispatcher wiring for unregistered block types.
 *
 * @module
 */
import { createCaretSelection } from "@chulane/rivto";
import { createTestCoreEditor } from "../test-utils";
import { createReactEditor } from "../react-editor";
import { defaultWritingBlockExtension, listShortcutsExtension } from "../extensions/built-ins/built-ins";
import { tableExtension, createTableBlockInput } from "../extensions/containers/table/table";
import { BaseBlockView } from "./base-view";
import { createBlockViewContext } from "./context";
import { firstKeyboardTarget } from "../managers/events/selection";
import type { BlockViewDropContext } from "./types";

class RejectingBlockView extends BaseBlockView {
  /**
   * Rejects every drop so the registry path can be checked.
   *
   * @param _context - Unused candidate destination.
   * @returns Always `false`.
   */
  override acceptsDrop(_context: BlockViewDropContext): boolean {
    return false;
  }
}

test("resolve falls back to BaseBlockView and indent stays free at the root", () => {
  const editor = createTestCoreEditor();
  const reactEditor = createReactEditor({
    editor,
    extensions: [defaultWritingBlockExtension()],
  });
  const first = editor.blocks.insertBlock({ type: "paragraph", content: "First" }).id;
  const second = editor.blocks.insertBlock({ type: "paragraph", content: "Second" }, first).id;
  expect(reactEditor.views.resolve(second)).toBeInstanceOf(BaseBlockView);
  expect(reactEditor.views.has("paragraph")).toBe(false);
  editor.blocks.indentBlock(second);
  expect(editor.blocks.getParentId(second)).toBe(first);
  editor.blocks.outdentBlock(second);
  expect(editor.blocks.getParentId(second)).toBeNull();
  reactEditor.destroy();
  editor.destroy();
});

test("asks the resolved view whether a drop is accepted", () => {
  const editor = createTestCoreEditor();
  const rejectingView = new RejectingBlockView();
  const reactEditor = createReactEditor({
    editor,
    extensions: [
      defaultWritingBlockExtension(),
      {
        id: "test.reject-drop",
        setup: (reactEditor) => reactEditor.views.register("paragraph", rejectingView),
      },
    ],
  });
  const targetId = editor.blocks.insertBlock({ type: "paragraph" }).id;

  expect(reactEditor.views.acceptsDrop(targetId, ["source"])).toBe(false);

  reactEditor.destroy();
  editor.destroy();
});

test.each(["checkbox", "numbered_list", "start_numbered_list", "continue_numbered_list"])(
  "empty %s clears its marker before outdenting one level per Enter",
  (type) => {
    const originalFrame = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = (() => 1) as typeof requestAnimationFrame;
    const editor = createTestCoreEditor();
    const reactEditor = createReactEditor({
      editor,
      extensions: [defaultWritingBlockExtension(), listShortcutsExtension()],
    });
    try {
      const root = editor.blocks.insertBlock({ type: "paragraph", content: "Root" }).id;
      const parent = editor.blocks.insertBlock({ type: "paragraph", content: "Parent" }, root).id;
      editor.blocks.indentBlock(parent);
      const child = editor.blocks.insertBlock({
        type: "paragraph",
        listProps: { type, checked: true, custom: "keep" },
      }, parent).id;
      editor.blocks.indentBlock(child);
      const view = new BaseBlockView();
      /** @returns Nothing after dispatching one Enter from a fresh block snapshot. */
      const pressEnter = () => {
        const selection = createCaretSelection(child, 0);
        const context = createBlockViewContext(reactEditor, child, {} as HTMLElement, selection)!;
        const target = firstKeyboardTarget(selection)!;
        editor.history.batchUpdates(() => view.onSplit(context, target));
      };

      pressEnter();
      expect(editor.blocks.getParentId(child)).toBe(parent);
      expect(editor.blocks.getBlockNode(child)?.listProps).toEqual({ custom: "keep" });
      pressEnter();
      expect(editor.blocks.getParentId(child)).toBe(root);
      pressEnter();
      expect(editor.blocks.getParentId(child)).toBeNull();
      expect(editor.blocks.getBlockNode(child)?.id).toBe(child);

      editor.history.undo();
      expect(editor.blocks.getParentId(child)).toBe(root);
      editor.history.undo();
      expect(editor.blocks.getParentId(child)).toBe(parent);
      editor.history.undo();
      expect(editor.blocks.getBlockNode(child)?.listProps.type).toBe(type);
    } finally {
      reactEditor.destroy();
      editor.destroy();
      globalThis.requestAnimationFrame = originalFrame;
    }
  },
);

test.each(["block", "edgeless"] as const)("empty root list marker clears in %s mode", (mode) => {
  const originalFrame = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = (() => 1) as typeof requestAnimationFrame;
  const editor = createTestCoreEditor();
  const reactEditor = createReactEditor({
    editor,
    extensions: [defaultWritingBlockExtension(), listShortcutsExtension()],
  });
  try {
    editor.mode.set(mode);
    const id = editor.blocks.insertBlock({
      type: "paragraph",
      listProps: { type: "checkbox", checked: true, custom: "keep" },
    }).id;
    const selection = createCaretSelection(id, 0);
    const context = createBlockViewContext(reactEditor, id, {} as HTMLElement, selection)!;
    expect(new BaseBlockView().onSplit(context, firstKeyboardTarget(selection)!)).toBe("handled");
    expect(editor.blocks.getParentId(id)).toBeNull();
    expect(editor.blocks.getBlockNode(id)?.listProps).toEqual({ custom: "keep" });
  } finally {
    reactEditor.destroy();
    editor.destroy();
    globalThis.requestAnimationFrame = originalFrame;
  }
});

test("empty checkbox clearing follows the host writing predicate for another block type", () => {
  const originalFrame = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = (() => 1) as typeof requestAnimationFrame;
  const editor = createTestCoreEditor();
  const reactEditor = createReactEditor({
    editor,
    extensions: [defaultWritingBlockExtension({
      type: "note",
      isEmptyBlock: (block) => block.type === "note" && block.content === "",
    }), listShortcutsExtension()],
  });
  try {
    const id = editor.blocks.insertBlock({
      type: "note", listProps: { type: "checkbox", checked: true },
    }).id;
    const selection = createCaretSelection(id, 0);
    const context = createBlockViewContext(reactEditor, id, {} as HTMLElement, selection)!;
    expect(new BaseBlockView().onSplit(context, firstKeyboardTarget(selection)!)).toBe("handled");
    expect(editor.blocks.getBlockNode(id)?.listProps.type).toBeUndefined();
  } finally {
    reactEditor.destroy();
    editor.destroy();
    globalThis.requestAnimationFrame = originalFrame;
  }
});

test("contentless custom blocks do not lose checkbox state on Enter", () => {
  const originalFrame = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = (() => 1) as typeof requestAnimationFrame;
  const editor = createTestCoreEditor();
  editor.blockRegistry.defineBlock({ type: "custom-control" });
  const reactEditor = createReactEditor({
    editor,
    extensions: [defaultWritingBlockExtension(), listShortcutsExtension()],
  });
  try {
    const id = editor.blocks.insertBlock({
      type: "custom-control", listProps: { type: "checkbox", checked: true },
    }).id;
    const selection = createCaretSelection(id, 0);
    const context = createBlockViewContext(reactEditor, id, {} as HTMLElement, selection)!;
    new BaseBlockView().onSplit(context, firstKeyboardTarget(selection)!);
    expect(editor.blocks.getBlockNode(id)?.listProps.type).toBe("checkbox");
  } finally {
    reactEditor.destroy();
    editor.destroy();
    globalThis.requestAnimationFrame = originalFrame;
  }
});

test("empty block Enter respects an outline floor", () => {
  const originalFrame = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = (() => 1) as typeof requestAnimationFrame;
  const editor = createTestCoreEditor();
  const reactEditor = createReactEditor({
    editor,
    extensions: [defaultWritingBlockExtension(), tableExtension()],
  });
  try {
    const table = editor.blocks.insertBlock(createTableBlockInput()).id;
    const cell = editor.blocks.getBlock(table)!.children[0]!.children[0]!.id;
    const child = editor.blocks.insertBlock({ type: "paragraph" }).id;
    editor.blocks.moveBlocks([child], cell, "inside");
    const selection = createCaretSelection(child, 0);
    const context = createBlockViewContext(reactEditor, child, {} as HTMLElement, selection)!;
    expect(new BaseBlockView().onSplit(context, firstKeyboardTarget(selection)!)).toBe("handled");
    expect(editor.blocks.getParentId(child)).toBe(cell);
  } finally {
    reactEditor.destroy();
    editor.destroy();
    globalThis.requestAnimationFrame = originalFrame;
  }
});
