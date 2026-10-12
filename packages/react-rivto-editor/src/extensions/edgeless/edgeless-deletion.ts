import { isStructuralSelection } from "@chulane/rivto";
import type { PanelAPI } from "../../panels/types";
import type { ReactEditorApi } from "../../editor/types";
import { blockIdsOf } from "../../elements/block-element-projection";
import { BUILTIN_KEYMAP, KEYBOARD_BINDING_IDS, isHTMLElementNode } from "../../managers";
import { getEdgelessRuntime } from "../built-ins/selection/edgeless-runtime";

/** Removes selected descendants whose selected ancestor already owns them. */
function topLevelSelection(panel: PanelAPI, blockIds: readonly string[]): string[] {
  const selected = new Set(blockIds);
  return blockIds.filter((id) => {
    let parentId = panel.blocks.getParentId(id);
    while (parentId) {
      if (selected.has(parentId)) return false;
      parentId = panel.blocks.getParentId(parentId);
    }
    return true;
  });
}

/** Deletes selected blocks, including nested blocks, as one structural transaction. */
export function registerEdgelessDeletion(reactEditor: ReactEditorApi): void {
  const selection = getEdgelessRuntime(reactEditor);
  reactEditor.keyboard.register({
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
  }, ({ panel, root }) => {
    const canvas = selection.get();
    let handled = false;
    if (canvas.active && canvas.items.length && panel.editor.document.commands.has("edgeless.visual.delete")) {
      panel.editor.document.commands.execute("edgeless.visual.delete", { panel, payload: { selection: true } });
      root.focus({ preventScroll: true });
      handled = true;
    } else {
      const current = panel.selection.get();
      const core = isStructuralSelection(current) ? current : undefined;
      const blockIds = canvas.active && canvas.items.length
        ? canvas.items.flatMap((id) => {
          const element = panel.elements.getElementNode(id);
          return element?.type === "block" ? blockIdsOf(element, panel.blocks.getRootIds()) : [];
        })
        : core?.blocks.map((block) => block.id) ?? [];
      const targets = topLevelSelection(panel, blockIds);
      if (targets.length && targets.every(id => panel.blocks.canRemove(id))) {
        if (canvas.active && canvas.items.length) {
          panel.editor.document.history.batchUpdates(() => {
            panel.blocks.removeBlocks(targets);
            panel.elements.removeElements(canvas.items);
          });
          selection.clear();
        } else {
          panel.selection.delete();
        }
        root.focus({ preventScroll: true });
        requestAnimationFrame(() => root.focus({ preventScroll: true }));
        handled = true;
      }
    }
    return handled;
  });

}
