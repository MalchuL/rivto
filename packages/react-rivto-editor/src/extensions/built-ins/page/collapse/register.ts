import type { EditorRuntime } from "../../../../editor-runtime";
/**
 * Editor interaction contracts and operations. Browser editing context is separate from core whole-block selection; document mutations use core managers.
 */
import { BlockCollapseSlot } from "../../../../blocks/block-slot-controls/block-slot-controls";
import type { EditorViewApi } from "../../../../types";
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
 * @param editorRuntime - Runtime receiving collapse state and keyboard registrations.
 * @returns Cleanup for document and selection reconciliation subscriptions.
 */
export function registerCollapse(editorRuntime: EditorRuntime): () => void {
  editorRuntime.slashCommands.register({
    id: "block.collapse",
    title: "Collapse block",
    group: "Actions",
    keywords: ["fold", "hide"],
    isAvailable: ({ blockId }) => {
      const block = editorRuntime.blocks.getBlockNode(blockId);
      return editorRuntime.blockListProps.has("collapse") &&
        Boolean(block?.childIds.length && block.listProps.collapsed !== true);
    },
    execute: ({ blockId }) => editorRuntime.blocks.updateBlock(blockId, { listProps: { collapsed: true } }),
  });

  editorRuntime.slashCommands.register({
    id: "block.expand",
    title: "Expand block",
    group: "Actions",
    keywords: ["unfold", "show"],
    isAvailable: ({ blockId }) => {
      const block = editorRuntime.blocks.getBlockNode(blockId);
      return editorRuntime.blockListProps.has("collapse") &&
        Boolean(block?.childIds.length && block.listProps.collapsed === true);
    },
    execute: ({ blockId }) => editorRuntime.blocks.updateBlock(blockId, { listProps: { collapsed: false } }),
  });

  editorRuntime.blockListProps.register({
    id: "collapse",
    childrenVisible: (block) => block.listProps.collapsed !== true,
    defaults: { collapsed: false },
    isValid: (candidate) => typeof candidate.collapsed === "boolean",
  });
  editorRuntime.surfaces.registerBlockSlot({
    position: "left-top",
    priority: 100,
    component: BlockCollapseSlot,
    when: ({ block }) => block.childIds.length > 0,
  });
  const reconcile = () => {
    const current = editorRuntime.selection.get();
    if (!current) return;
    const view = editorRuntime.events.getDocumentView();
    const api = view ?? editorRuntime;
    if (!api.selection.get()) {
      // A remote move can put selected blocks outside the active subtree.
      if (view) api.selection.clear();
      return;
    }
    const reconcileView = () => {
      const root = view?.events.getRoot();
      const boundary = view?.rootBlockId;
      const next = reconcileCollapsedSelection(api.blocks, current, boundary);
      if (next !== current) {
        if (next) api.selection.set(next);
        else api.selection.clear();
        // A native Range retains detached text nodes after React removes a
        // collapsed subtree. Clear it and focus the page's block-selection owner.
        root?.ownerDocument.getSelection()?.removeAllRanges();
        root?.focus({ preventScroll: true });
      }
    };
    reconcileView();
  };
  const unsubscribeDocument = editorRuntime.subscribe(reconcile);
  const unsubscribeSelection = editorRuntime.selection.subscribe(reconcile);
  const uninstallReconciliation = () => { unsubscribeSelection(); unsubscribeDocument(); };

  const setCollapsed = (editorView: EditorViewApi, value: boolean | "toggle"): boolean => {
    const current = editorView.selection.get();
    // Chromium may deliver the shortcut before its selectionchange event after
    // a click. Reading the native caret keeps the keybinding deterministic.
    const nativeSelection = editorView.selection.readDOM();
    const selection = nativeSelection ?? current;
    const ids = collapseTargets(selection);
    if (!ids.length) return false;
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.some((id) => !editorView.blocks.hasBlock(id))) return false;
    const first = editorView.blocks.getBlockNode(uniqueIds[0]!);
    if (!first) return false;
    const collapsed = value === "toggle" ? first.listProps.collapsed !== true : value;
    const updates = uniqueIds.flatMap((id) => {
      const block = editorView.blocks.getBlockNode(id);
      return block && (!collapsed || block.childIds.length > 0) && block.listProps.collapsed !== collapsed
        ? [{ id, patch: { listProps: { collapsed } } }]
        : [];
    });
    if (updates.length) editorView.blocks.updateBlocks(updates);
    return true;
  };

  editorRuntime.keyboard.register({
    id: KEYBOARD_BINDING_IDS.blockCollapse,
    keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.blockCollapse]!,
    when: ({ mode, blockElement }) => mode === "block" || Boolean(blockElement),
  }, ({ editorView }) => setCollapsed(editorView,true));
  editorRuntime.keyboard.register({
    id: KEYBOARD_BINDING_IDS.blockExpand,
    keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.blockExpand]!,
    when: ({ mode, blockElement }) => mode === "block" || Boolean(blockElement),
  }, ({ editorView }) => setCollapsed(editorView,false));
  editorRuntime.keyboard.register({
    id: KEYBOARD_BINDING_IDS.blockToggleCollapse,
    keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.blockToggleCollapse]!,
    when: ({ mode, blockElement }) => mode === "block" || Boolean(blockElement),
  }, ({ editorView }) => setCollapsed(editorView,"toggle"));

  return () => {
    uninstallReconciliation();
  };
}
