import type { BlockSelection } from "@chulane/rivto";
import type { ReactEditor } from "../../types";
import { BUILTIN_KEYMAP, KEYBOARD_BINDING_IDS, isHTMLElementNode } from "../../managers";
import { getEdgelessRuntime } from "./edgeless-runtime";
import { blockIdsOf } from "../../surfaces/edgeless/block-elements";

/** Removes selected descendants whose selected ancestor already owns them. */
function topLevelSelection(editor: ReactEditor["editor"], blockIds: readonly string[]): string[] {
  const selected = new Set(blockIds);
  return blockIds.filter((id) => {
    let parentId = editor.blocks.getParentId(id);
    while (parentId) {
      if (selected.has(parentId)) return false;
      parentId = editor.blocks.getParentId(parentId);
    }
    return true;
  });
}

/** Deletes selected blocks, including nested blocks, as one structural transaction. */
export function registerEdgelessDeletion(reactEditor: ReactEditor): void {
  const { editor } = reactEditor;
  const selection = getEdgelessRuntime(reactEditor);
  reactEditor.keyboard.register({
    id: KEYBOARD_BINDING_IDS.edgelessSelectionDelete,
    keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.edgelessSelectionDelete],
    mode: "edgeless",
    when: ({ selection: coreSelection, raw: event }) => {
      const hasCanvas = selection.get().active && selection.get().items.length > 0;
      if (!hasCanvas && !coreSelection.some((item) => item.type === "block")) return false;
      const target = event.target;
      return isHTMLElementNode(target) &&
        !target.isContentEditable &&
        !/^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(target.tagName);
    },
  }, ({ root }) => {
    const canvas = selection.get();
    let handled = false;
    if (canvas.active && canvas.items.length && editor.commands.has("edgeless.visual.delete")) {
      editor.execute("edgeless.visual.delete", { selection: true });
      root.focus({ preventScroll: true });
      handled = true;
    } else {
      const core = editor.selection.get().find((item): item is BlockSelection => item.type === "block");
      const blockIds = canvas.active && canvas.items.length
        ? canvas.items.flatMap((id) => {
          const element = editor.elements.getElement(id);
          return element?.type === "block" ? blockIdsOf(element, editor.blocks.getRootIds()) : [];
        })
        : core?.blockIds ?? [];
      const targets = topLevelSelection(editor, blockIds);
      if (targets.length) {
        if (canvas.active && canvas.items.length) {
          editor.batchUpdates(() => {
            targets.forEach((id) => editor.blocks.removeBlock(id));
            editor.elements.removeElements(canvas.items);
          });
          selection.clear();
        } else {
          editor.deleteSelection();
        }
        root.focus({ preventScroll: true });
        requestAnimationFrame(() => root.focus({ preventScroll: true }));
        handled = true;
      }
    }
    return handled;
  });

}
