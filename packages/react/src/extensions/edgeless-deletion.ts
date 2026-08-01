import type { BlockSelection } from "@chulane/rivto";
import type { ReactEditor } from "../types";
import { BUILTIN_KEYMAP, KEYBOARD_BINDING_IDS } from "../managers";

/** Removes selected descendants whose selected ancestor already owns them. */
function topLevelSelection(editor: ReactEditor["editor"], blockIds: readonly string[]): string[] {
  const selected = new Set(blockIds);
  return blockIds.filter((id) => {
    let parentId = editor.getParentId(id);
    while (parentId) {
      if (selected.has(parentId)) return false;
      parentId = editor.getParentId(parentId);
    }
    return true;
  });
}

/** Deletes selected blocks, including nested blocks, as one structural transaction. */
export function registerEdgelessDeletion(reactEditor: ReactEditor): void {
  const { editor } = reactEditor;
  reactEditor.keyboard.register({
    id: KEYBOARD_BINDING_IDS.edgelessSelectionDelete,
    keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.edgelessSelectionDelete],
    mode: "edgeless",
    when: ({ selection, raw: event }) => {
      if (!selection.some((item) => item.type === "block")) return false;
      const target = event.target;
      return target instanceof HTMLElement &&
        !target.isContentEditable &&
        !/^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(target.tagName);
    },
  }, ({ root }) => {
    const selected = editor.selection.get()
      .find((item): item is BlockSelection => item.type === "block");
    if (!selected) return false;
    const targets = topLevelSelection(editor, selected.blockIds);
    const populated = targets.some((id) => {
      const block = editor.getBlock(id);
      return Boolean(block && (block.content !== "" || block.children.length > 0));
    });
    if (populated) {
      editor.batchUpdates(() => targets.forEach((id) => editor.clearBlock(id)));
      root.focus({ preventScroll: true });
      requestAnimationFrame(() => root.focus({ preventScroll: true }));
      return true;
    }

    editor.deleteSelection();
    const current = editor.selection.get().find((item) => item.type === "text");
    const blockIds = current
      ? [current.head.blockId]
      : editor.getBlocks().slice(0, 1).map((block) => block.id);
    if (blockIds.length) {
      editor.selection.set([{
        type: "block",
        blockIds,
        anchorBlockId: blockIds[0]!,
        focusBlockId: blockIds.at(-1)!,
      }]);
    } else {
      editor.selection.clear();
    }
    root.focus({ preventScroll: true });
    requestAnimationFrame(() => root.focus({ preventScroll: true }));
    return true;
  });

}
