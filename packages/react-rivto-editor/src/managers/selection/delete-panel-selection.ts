import { getSelectedBlockIds, isStructuralSelection } from "@chulane/rivto";
import { createBlockBehaviorContext } from "../../block-behaviors/utils/context";
import type { ReactPanelApi } from "../../panels/types";

/**
 * Deletes the panel's current selection using registered container policies.
 *
 * For structural selections, the behavior registry consults each distinct block
 * behavior once. The first handled or rejected outcome claims the whole selection and
 * suppresses generic deletion. Otherwise selection.delete handles the selection, including expanded
 * text. Policy calls and deletion share one panel batch; focus is left to callers.
 *
 * @param reactPanel - Occurrence whose current selection and block behaviors are used.
 * @param root - Mounted surface root passed to structural-deletion behavior contexts.
 * @returns No value after the selected behavior or generic deletion completes.
 * @throws If context resolution, a behavior handler or delegated selection deletion fails.
 */
export function deletePanelSelection(reactPanel: ReactPanelApi, root: HTMLElement): void {
  const current = reactPanel.selection.get();
  reactPanel.batchUpdates(() => {
    if (current && isStructuralSelection(current)) {
      const ids = getSelectedBlockIds(current);
      const firstId = ids.find((id) => reactPanel.blocks.getBlockNode(id));
      const context = firstId
        ? createBlockBehaviorContext(reactPanel, firstId, root, current)
        : undefined;
      // A handled or rejected outcome claims the whole selection and skips generic deletion.
      if (
        context &&
        reactPanel.editor.blockBehaviors.dispatch("onStructuralDelete", context, ids)
      ) {
        return;
      }
    }
    reactPanel.selection.delete();
  });
}
