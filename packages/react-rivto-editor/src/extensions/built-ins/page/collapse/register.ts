/**
 * Editor interaction contracts and operations. Browser editing context is separate from core whole-block selection; document mutations use core managers.
 */
import { BlockCollapseSlot } from "../../../../blocks/block-slot-controls";
import type { ReactEditor } from "../../../../types";
import { reconcileCollapsedSelection } from "../navigation";
import { BUILTIN_KEYMAP, KEYBOARD_BINDING_IDS } from "../../../../managers";
import { collapseTargets } from "./utils";

/**
 * Installs outliner collapse shortcuts and repairs selections after any
 * local or remote document update hides their endpoints.
 *
 * Ctrl/Cmd+Up collapses, Ctrl/Cmd+Down expands, and Ctrl/Cmd+; toggles using
 * the first selected block's state. Multiple changes route through the generic
 * atomic block-update command rather than producing one undo item per block.
 *
 * @param reactEditor - Runtime receiving collapse state and keyboard registrations.
 * @returns Cleanup for document and selection reconciliation subscriptions.
 */
export function registerCollapse(reactEditor: ReactEditor): () => void {
  reactEditor.blocks.registerListProps({
    id: "collapse",
    defaults: { collapsed: false },
    validate: (candidate) => typeof candidate.collapsed === "boolean",
  });
  reactEditor.surfaces.registerBlockSlot({
    position: "left-top",
    priority: 100,
    component: BlockCollapseSlot,
    when: ({ block }) => block.children.length > 0,
  });
  const reconcile = () => {
    const root = reactEditor.events.getRoot();
    const current = reactEditor.selection.get();
    const next = reconcileCollapsedSelection(reactEditor.blocks.getBlocks(), current);
    if (next !== current) {
      if (next) reactEditor.selection.set(next);
      else reactEditor.selection.clear();
      // A native Range retains detached text nodes after React removes a
      // collapsed subtree. Clear it and focus the page's block-selection owner.
      root?.ownerDocument.getSelection()?.removeAllRanges();
      root?.focus({ preventScroll: true });
    }
  };
  const unsubscribeDocument = reactEditor.subscribe(reconcile);
  const unsubscribeSelection = reactEditor.selection.subscribe(reconcile);

  const setCollapsed = (value: boolean | "toggle"): boolean => {
    const current = reactEditor.selection.get();
    // Chromium may deliver the shortcut before its selectionchange event after
    // a click. Reading the native caret keeps the keybinding deterministic.
    const nativeSelection = reactEditor.selection.readDOM();
    const selection = nativeSelection ?? current;
    const ids = collapseTargets(selection);
    if (!ids.length) return false;
    const blocks = [...new Set(ids)].map((id) => reactEditor.blocks.getBlock(id));
    if (blocks.some((block) => !block)) return false;
    const first = blocks[0]!;
    const collapsed = value === "toggle" ? first.listProps.collapsed !== true : value;
    const updates = blocks.flatMap((block) => (
      block && (!collapsed || block.children.length > 0) && block.listProps.collapsed !== collapsed
        ? [{ id: block.id, patch: { listProps: { collapsed } } }]
        : []
    ));
    if (updates.length) reactEditor.blocks.updateBlocks(updates);
    return true;
  };

  reactEditor.keyboard.register({
    id: KEYBOARD_BINDING_IDS.blockCollapse,
    keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.blockCollapse]!,
    when: ({ mode, blockElement }) => mode === "block" || Boolean(blockElement),
  }, () => setCollapsed(true));
  reactEditor.keyboard.register({
    id: KEYBOARD_BINDING_IDS.blockExpand,
    keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.blockExpand]!,
    when: ({ mode, blockElement }) => mode === "block" || Boolean(blockElement),
  }, () => setCollapsed(false));
  reactEditor.keyboard.register({
    id: KEYBOARD_BINDING_IDS.blockToggleCollapse,
    keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.blockToggleCollapse]!,
    when: ({ mode, blockElement }) => mode === "block" || Boolean(blockElement),
  }, () => setCollapsed("toggle"));

  return () => {
    unsubscribeSelection();
    unsubscribeDocument();
  };
}
