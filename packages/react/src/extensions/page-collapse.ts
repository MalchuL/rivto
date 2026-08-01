import type {
  BlockSelection,
  EditorSelection,
  TextSelection,
} from "@chulane/rivto";
import type { ReactEditor } from "../types";
import { reconcileCollapsedSelection } from "./page-selection-utils";
import { BUILTIN_KEYMAP, KEYBOARD_BINDING_IDS } from "../managers";

/** Resolves the edited block or all blocks in the active whole-block selection. */
function collapseTargets(
  selection: EditorSelection,
): string[] {
  const blocks = selection.find((item): item is BlockSelection => item.type === "block");
  if (blocks) return blocks.blockIds;
  const text = selection.find((item): item is TextSelection => item.type === "text");
  return text ? [text.head.blockId] : [];
}

/**
 * Installs Logseq-style collapse shortcuts and repairs selections after any
 * local or remote document update hides their endpoints.
 *
 * Ctrl/Cmd+Up collapses, Ctrl/Cmd+Down expands, and Ctrl/Cmd+; toggles using
 * the first selected block's state. Multiple changes route through the generic
 * atomic block-update command rather than producing one undo item per block.
 */
export function registerCollapse(reactEditor: ReactEditor): () => void {
  const { editor } = reactEditor;
  const reconcile = () => {
    if (editor.mode.get() !== "block") return;
    const root = reactEditor.events.getRoot();
    const current = editor.selection.get();
    const next = reconcileCollapsedSelection(editor.getBlocks(), current);
    if (next !== current) {
      editor.selection.set(next);
      // A native Range retains detached text nodes after React removes a
      // collapsed subtree. Clear it and focus the page's block-selection owner.
      root?.ownerDocument.getSelection()?.removeAllRanges();
      root?.focus({ preventScroll: true });
    }
  };
  const unsubscribeDocument = editor.document.subscribe(reconcile);
  const unsubscribeSelection = editor.selection.subscribe(reconcile);

  const setCollapsed = (root: HTMLElement, value: boolean | "toggle"): boolean => {
    const current = editor.selection.get();
    // Chromium may deliver the shortcut before its selectionchange event after
    // a click. Reading the native caret keeps the keybinding deterministic.
    const nativeSelection = reactEditor.selection.readDOM();
    const selection = nativeSelection?.length ? nativeSelection : current;
    const ids = collapseTargets(selection);
    if (!ids.length) return false;
    const blocks = [...new Set(ids)].map((id) => editor.getBlock(id));
    if (blocks.some((block) => !block)) return false;
    const first = blocks[0]!;
    const collapsed = value === "toggle" ? !first.collapsed : value;
    const updates = blocks.flatMap((block) => (
      block && (!collapsed || block.children.length > 0) && block.collapsed !== collapsed
        ? [{ id: block.id, patch: { collapsed } }]
        : []
    ));
    if (updates.length) editor.updateBlocks(updates);
    return true;
  };

  reactEditor.events.register({
    id: KEYBOARD_BINDING_IDS.blockCollapse,
    keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.blockCollapse]!,
    mode: "block",
  }, ({ root }) => setCollapsed(root, true));
  reactEditor.events.register({
    id: KEYBOARD_BINDING_IDS.blockExpand,
    keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.blockExpand]!,
    mode: "block",
  }, ({ root }) => setCollapsed(root, false));
  reactEditor.events.register({
    id: KEYBOARD_BINDING_IDS.blockToggleCollapse,
    keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.blockToggleCollapse]!,
    mode: "block",
  }, ({ root }) => setCollapsed(root, "toggle"));

  return () => {
    unsubscribeSelection();
    unsubscribeDocument();
  };
}
