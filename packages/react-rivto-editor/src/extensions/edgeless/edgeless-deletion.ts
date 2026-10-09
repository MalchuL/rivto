import type { EditorRuntime } from "../../editor-runtime";
import type { EditorViewApi } from "../../types";
import { BUILTIN_KEYMAP, KEYBOARD_BINDING_IDS, isHTMLElementNode } from "../../managers";
import { getEdgelessRuntime } from "../built-ins/selection/edgeless-runtime";
import { blockIdsOf } from "../../elements/block-element-projection";
import { isStructuralSelection } from "@chulane/rivto";

/** Removes selected descendants whose selected ancestor already owns them. */
function topLevelSelection(editorView: EditorViewApi, blockIds: readonly string[]): string[] {
  const selected = new Set(blockIds);
  return blockIds.filter((id) => {
    let parentId = editorView.blocks.getParentId(id);
    while (parentId) {
      if (selected.has(parentId)) return false;
      parentId = editorView.blocks.getParentId(parentId);
    }
    return true;
  });
}

/** Deletes selected blocks, including nested blocks, as one structural transaction. */
export function registerEdgelessDeletion(editorRuntime: EditorRuntime): void {
  const selection = getEdgelessRuntime(editorRuntime);
  editorRuntime.keyboard.register({
    id: KEYBOARD_BINDING_IDS.edgelessSelectionDelete,
    keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.edgelessSelectionDelete],
    mode: "edgeless",
    when: ({ selection: coreSelection, raw: event }) => {
      const hasCanvas = selection.get().active && selection.get().items.length > 0;
      if (!hasCanvas && !isStructuralSelection(coreSelection)) return false;
      const target = event.target;
      return isHTMLElementNode(target) &&
        !target.isContentEditable &&
        !/^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(target.tagName);
    },
  }, ({ editorView, root }) => {
    const canvas = selection.get();
    let handled = false;
    if (canvas.active && canvas.items.length && editorView.commands.has("edgeless.visual.delete")) {
      editorView.commands.execute("edgeless.visual.delete", { selection: true });
      root.focus({ preventScroll: true });
      handled = true;
    } else {
      const current = editorView.selection.get();
      const core = isStructuralSelection(current) ? current : undefined;
      const blockIds = canvas.active && canvas.items.length
        ? canvas.items.flatMap((id) => {
          const element = editorView.elements.getElement(id);
          return element?.type === "block" ? blockIdsOf(element, editorView.blocks.getRootIds()) : [];
        })
        : core?.blocks.map((block) => block.id) ?? [];
      const targets = topLevelSelection(editorView, blockIds);
      if (targets.length) {
        if (canvas.active && canvas.items.length) {
          editorView.history.batchUpdates(() => {
            targets.forEach((id) => editorView.blocks.removeBlock(id));
            editorView.elements.removeElements(canvas.items);
          });
          selection.clear();
        } else {
          editorView.selection.delete();
        }
        root.focus({ preventScroll: true });
        requestAnimationFrame(() => root.focus({ preventScroll: true }));
        handled = true;
      }
    }
    return handled;
  });

}
