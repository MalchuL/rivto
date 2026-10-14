import { createStructuralSelection, getSelectedBlockIds } from "@chulane/rivto";
import type { ReactPanelApi } from "../../panels/types";
import type { BlockContextMenuContext } from "./types";

/**
 * Captures menu targets and replaces the panel selection with those whole blocks.
 *
 * An existing selection is retained only when it structurally selects the clicked
 * block; otherwise that block becomes the sole target. Targets are ordered by the
 * panel's block traversal. Root targets exclude any block with a selected ancestor,
 * so subtree operations do not process selected descendants twice.
 *
 * @param reactPanel - Invoking occurrence whose blocks and selection are read.
 * @param blockId - Document-local ID of the handle that opened the menu.
 * @returns Panel context with ordered target IDs and ancestor-deduplicated roots.
 * The IDs remain captured while menu focus changes; execution rechecks existence.
 */
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

/**
 * Checks that captured target IDs still exist through the invoking panel's blocks.
 *
 * This checks the explicit blockIds list, not the selection currently focused in
 * DOM or the provenance of an arbitrary caller-supplied context.
 *
 * @param context - Captured targets and the panel used to resolve them.
 * @returns No value when the target list is nonempty and every block exists.
 * @throws If the target list is empty, a target has disappeared, or the panel's
 * block access rejects the read.
 */
export function assertBlockMenuTargets(context: BlockContextMenuContext): void {
  if (
    !context.blockIds.length ||
    context.blockIds.some((id) => !context.reactPanel.blocks.hasBlock(id))
  ) {
    throw new Error("Block context menu targets are no longer available");
  }
}

/**
 * Looks up and executes an action against the captured menu targets.
 *
 * Target existence is checked before looking up the current registration. The
 * availability predicate is evaluated again, so an action removed or made
 * unavailable since the menu rendered cannot execute. No transaction is added
 * around the callback; the action owns its batching and asynchronous work.
 *
 * @param id - Stable ID of the action in the invoking editor's menu registry.
 * @param context - Captured panel and target IDs passed to the action unchanged.
 * @returns A promise resolving when the action's synchronous or asynchronous work finishes.
 * @throws If targets are stale, the registration has no executor, availability is
 * false, or the action rejects. Callback errors propagate to the caller.
 */
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
