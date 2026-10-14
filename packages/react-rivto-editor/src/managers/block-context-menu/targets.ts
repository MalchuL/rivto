import { createStructuralSelection, getSelectedBlockIds } from "@chulane/rivto";
import type { ReactPanelApi } from "../../panels/types";
import type { BlockContextMenuContext } from "./types";

/** Captures structural targets, preserving a selected group only when it contains the clicked block. */
export function blockMenuTargets(
  reactPanel: ReactPanelApi,
  blockId: string,
): BlockContextMenuContext {
  const selection = reactPanel.selection.get();
  const blockIds = reactPanel.blocks.getOrderedIds(
    selection && reactPanel.selection.isBlockSelected(blockId)
      ? getSelectedBlockIds(selection)
      : [blockId],
  );
  const selected = new Set(blockIds);
  const rootIds = blockIds.filter((id) => {
    let parent = reactPanel.blocks.getParentId(id);
    while (parent) {
      if (selected.has(parent)) {
        return false;
      }
      parent = reactPanel.blocks.getParentId(parent);
    }
    return true;
  });
  reactPanel.selection.set(createStructuralSelection(blockIds, blockId));
  return { reactPanel, blockId, blockIds, rootIds };
}

/** Rejects stale panel targets before an action can mutate another occurrence or deleted block. */
export function assertBlockMenuTargets(context: BlockContextMenuContext): void {
  if (
    !context.blockIds.length ||
    context.blockIds.some((id) => !context.reactPanel.blocks.hasBlock(id))
  ) {
    throw new Error("Block context menu targets are no longer available");
  }
}

/** Executes a registered action after rechecking targets and extension availability. */
export async function executeBlockMenuEntry(
  id: string,
  context: BlockContextMenuContext,
): Promise<void> {
  assertBlockMenuTargets(context);
  const entry = context.reactPanel.editor.blockContextMenu.get(id);
  if (!entry?.execute || entry.isAvailable?.(context) === false) {
    throw new Error(`Block context menu action ${id} is unavailable`);
  }
  await entry.execute(context);
}
