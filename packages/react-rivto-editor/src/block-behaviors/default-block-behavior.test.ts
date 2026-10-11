import { createTestReactEditor as createReactEditor } from "../test-utils";
/**
 * Generic behavior fallback and dispatcher wiring for unregistered block types.
 *
 * @module
 */
import { createCaretSelection } from "@chulane/rivto";
import { createTestCoreEditor } from "../test-utils";

import { defaultWritingBlockExtension, listShortcutsExtension } from "../extensions/built-ins/built-ins";
import { createTableBlockInput, tableExtension } from "../extensions/containers/table/table";
import { firstKeyboardTarget } from "../managers/events/selection";
import { createBlockBehaviorContext } from "./context";
import { DefaultBlockBehavior } from "./default-block-behavior";
import type { BlockDropContext } from "./types";

class RejectingBlockBehavior extends DefaultBlockBehavior {
  /**
   * Rejects every drop so the registry path can be checked.
   *
   * @param _context - Unused candidate destination.
   * @returns Always `false`.
   */
  override acceptsDrop(_context: BlockDropContext): boolean {
    return false;
  }
}

test("resolve falls back to DefaultBlockBehavior and indent stays free at the root", async () => {
  const editor = await createTestCoreEditor();
  const editorView = createReactEditor({
    editor,
    extensions: [defaultWritingBlockExtension()],
  });
  const first = editor.blocks.insertBlock({ type: "paragraph", content: "First" }).id;
  const second = editor.blocks.insertBlock({ type: "paragraph", content: "Second" }, first).id;
  expect(editorView.runtime.blockBehaviors.resolve(second)).toBeInstanceOf(DefaultBlockBehavior);
  expect(editorView.runtime.blockBehaviors.has("paragraph")).toBe(false);
  editor.blocks.indentBlock(second);
  expect(editor.blocks.getParentId(second)).toBe(first);
  editor.blocks.outdentBlock(second);
  expect(editor.blocks.getParentId(second)).toBeNull();
  editorView.runtime.destroy();
  editor.destroy();
});

test("asks the resolved behavior whether a drop is accepted", async () => {
  const editor = await createTestCoreEditor();
  const rejectingView = new RejectingBlockBehavior();
  const editorView = createReactEditor({
    editor,
    extensions: [
      defaultWritingBlockExtension(),
      {
        id: "test.reject-drop",
        setup: (editorRuntime) => editorRuntime.blockBehaviors.register("paragraph", rejectingView),
      },
    ],
  });
  const targetId = editor.blocks.insertBlock({ type: "paragraph" }).id;

  expect(editorView.runtime.blockBehaviors.acceptsDrop({ kind: "inside", parentId: targetId }, [editor.blocks.getBlock(targetId)!])).toBe(false);

  editorView.runtime.destroy();
  editor.destroy();
});

test.each(["checkbox", "numbered_list", "start_numbered_list", "continue_numbered_list"])(
  "empty %s clears its marker before outdenting one level per Enter",
  async (type) => {
    const originalFrame = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = (() => 1) as typeof requestAnimationFrame;
    const editor = await createTestCoreEditor();
    const editorView = createReactEditor({
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
      const behavior = new DefaultBlockBehavior();
      /** @returns Nothing after dispatching one Enter from a fresh block snapshot. */
      const pressEnter = () => {
        const selection = createCaretSelection(child, 0);
        const context = createBlockBehaviorContext(editorView, child, {} as HTMLElement, selection)!;
        const target = firstKeyboardTarget(selection)!;
        editor.history.batchUpdates(() => behavior.onSplit(context, target));
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
      editorView.runtime.destroy();
      editor.destroy();
      globalThis.requestAnimationFrame = originalFrame;
    }
  },
);

test.each(["block", "edgeless"] as const)("empty root list marker clears in %s mode", async (mode) => {
  const originalFrame = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = (() => 1) as typeof requestAnimationFrame;
  const editor = await createTestCoreEditor();
  const editorView = createReactEditor({
    editor,
    extensions: [defaultWritingBlockExtension(), listShortcutsExtension()],
  });
  try {
    editorView.runtime.mode.set(mode);
    const id = editor.blocks.insertBlock({
      type: "paragraph",
      listProps: { type: "checkbox", checked: true, custom: "keep" },
    }).id;
    const selection = createCaretSelection(id, 0);
    const context = createBlockBehaviorContext(editorView, id, {} as HTMLElement, selection)!;
    expect(new DefaultBlockBehavior().onSplit(context, firstKeyboardTarget(selection)!)).toBe("handled");
    expect(editor.blocks.getParentId(id)).toBeNull();
    expect(editor.blocks.getBlockNode(id)?.listProps).toEqual({ custom: "keep" });
  } finally {
    editorView.runtime.destroy();
    editor.destroy();
    globalThis.requestAnimationFrame = originalFrame;
  }
});

test("empty checkbox clearing follows the host writing predicate for another block type", async () => {
  const originalFrame = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = (() => 1) as typeof requestAnimationFrame;
  const editor = await createTestCoreEditor();
  const editorView = createReactEditor({
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
    const context = createBlockBehaviorContext(editorView, id, {} as HTMLElement, selection)!;
    expect(new DefaultBlockBehavior().onSplit(context, firstKeyboardTarget(selection)!)).toBe("handled");
    expect(editor.blocks.getBlockNode(id)?.listProps.type).toBeUndefined();
  } finally {
    editorView.runtime.destroy();
    editor.destroy();
    globalThis.requestAnimationFrame = originalFrame;
  }
});

test("contentless custom blocks do not lose checkbox state on Enter", async () => {
  const originalFrame = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = (() => 1) as typeof requestAnimationFrame;
  const editor = await createTestCoreEditor();
  editor.blockRegistry.defineBlock({ type: "custom-control" });
  const editorView = createReactEditor({
    editor,
    extensions: [defaultWritingBlockExtension(), listShortcutsExtension()],
  });
  try {
    const id = editor.blocks.insertBlock({
      type: "custom-control", listProps: { type: "checkbox", checked: true },
    }).id;
    const selection = createCaretSelection(id, 0);
    const context = createBlockBehaviorContext(editorView, id, {} as HTMLElement, selection)!;
    new DefaultBlockBehavior().onSplit(context, firstKeyboardTarget(selection)!);
    expect(editor.blocks.getBlockNode(id)?.listProps.type).toBe("checkbox");
  } finally {
    editorView.runtime.destroy();
    editor.destroy();
    globalThis.requestAnimationFrame = originalFrame;
  }
});

test("empty block Enter respects an outline floor", async () => {
  const originalFrame = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = (() => 1) as typeof requestAnimationFrame;
  const editor = await createTestCoreEditor();
  const editorView = createReactEditor({
    editor,
    extensions: [defaultWritingBlockExtension(), tableExtension()],
  });
  try {
    const table = editor.blocks.insertBlock(createTableBlockInput()).id;
    const cell = editor.blocks.getBlock(table)!.children[0]!.children[0]!.id;
    const child = editor.blocks.insertBlock({ type: "paragraph" }).id;
    editor.blocks.moveBlocks([child], cell, "inside");
    const selection = createCaretSelection(child, 0);
    const context = createBlockBehaviorContext(editorView, child, {} as HTMLElement, selection)!;
    expect(new DefaultBlockBehavior().onSplit(context, firstKeyboardTarget(selection)!)).toBe("handled");
    expect(editor.blocks.getParentId(child)).toBe(cell);
  } finally {
    editorView.runtime.destroy();
    editor.destroy();
    globalThis.requestAnimationFrame = originalFrame;
  }
});

test("drop validation checks the destination parent and every source snapshot", async () => {
  const { kanbanExtension } = await import("../extensions/containers/kanban/kanban");
  const { columnsExtension } = await import("../extensions/containers/columns/columns");
  const editor = await createTestCoreEditor();
  const editorView = createReactEditor({ editor, extensions: [defaultWritingBlockExtension(), kanbanExtension(), columnsExtension(), tableExtension()] });
  try {
    for (const [parentType, shellType] of [["kanban", "kanban-column"], ["columns", "columns-column"], ["table", "table-row"], ["table-row", "table-cell"]]) {
      const parent = editor.blocks.insertBlock({ type: parentType!, children: [{ type: shellType! }] });
      const shell = editor.blocks.getBlock(parent.id)!.children[0]!;
      const content = editor.blocks.insertBlock({ type: "paragraph" });
      const destination = { kind: "between", parentId: parent.id, previousId: shell.id, nextId: null, depth: 1 } as const;
      expect(editorView.runtime.blockBehaviors.acceptsDrop(destination, [content])).toBe(false);
      expect(editorView.runtime.blockBehaviors.acceptsDrop(destination, [{ ...shell, id: "foreign-shell" }])).toBe(true);
      expect(editorView.runtime.blockBehaviors.acceptsDrop(destination, [shell, content])).toBe(false);
      expect(editorView.runtime.blockBehaviors.acceptsDrop({ ...destination, parentId: null }, [shell])).toBe(false);
      if (shellType === "kanban-column" || shellType === "columns-column" || shellType === "table-cell") {
        expect(editorView.runtime.blockBehaviors.acceptsDrop({ kind: "inside", parentId: shell.id }, [{ ...content, id: "foreign-content" }])).toBe(true);
      }
    }
  } finally {
    editorView.runtime.destroy();
    editor.destroy();
  }
});
