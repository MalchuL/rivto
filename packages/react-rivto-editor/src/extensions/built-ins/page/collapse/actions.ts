import type {
  BlockContextMenuContext,
  BlockContextMenuRegistration,
} from "../../../../managers/block-context-menu/types";
import { ChevronsDownUpIcon, ChevronsUpDownIcon } from "lucide-react";

/**
 * Updates collapse state throughout the captured root subtrees in one bulk call.
 *
 * Each reachable ID is visited once, including hidden descendants. Missing blocks
 * are skipped. Only blocks with children and a different collapse value are
 * patched; leaf blocks and their existing properties remain unchanged.
 *
 * @param context - Panel operations and selected roots from the open menu.
 * @param collapsed - True to collapse every parent, false to expand every parent.
 * @returns No value; changes are applied through the panel's updateBlocks operation.
 */
export function setSubtreesCollapsed(context: BlockContextMenuContext, collapsed: boolean): void {
  const { reactPanel, rootIds } = context;
  const ids: string[] = [];
  const pending = [...rootIds];
  const seen = new Set<string>();
  while (pending.length) {
    const id = pending.pop()!;
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    const block = reactPanel.blocks.getBlockNode(id);
    if (!block) {
      continue;
    }
    pending.push(...block.childIds);
    if (block.childIds.length && block.listProps.collapsed !== collapsed) {
      ids.push(id);
    }
  }
  reactPanel.blocks.updateBlocks(ids.map((id) => ({ id, patch: { listProps: { collapsed } } })));
}

/**
 * Registers Collapse subtree and Expand whole subtree menu actions.
 *
 * Both actions visit captured root subtrees, including hidden descendants, and
 * write the collapse extension's persisted list property through panel operations.
 *
 * @param menu - Block menu registration capability owned by the extension lifecycle.
 * @returns No value; registration cleanup belongs to the active extension lifecycle.
 * @throws If the registry is inactive or a contribution ID is already registered.
 */
export function registerBlockCollapseActions(menu: BlockContextMenuRegistration): void {
  for (const [id, title, collapsed, icon] of [
    ["collapse", "Collapse subtree", true, ChevronsDownUpIcon],
    ["expand", "Expand whole subtree", false, ChevronsUpDownIcon],
  ] as const) {
    menu.register({
      id: `block.${id}`,
      title,
      icon,
      order: 60,
      /**
       * Applies this entry's collapse state to all parent blocks in the selected subtrees.
       *
       * @param context - Invoking panel and captured root IDs.
       * @returns No value after the bulk collapse update completes.
       */
      execute: (context) => setSubtreesCollapsed(context, collapsed),
    });
  }
}
