import type {
  BlockSelection,
  EditorSelection,
  TextSelection,
} from "@chulane/rivto";
import { readEditorDOMSelection } from "../events/utils/selection/editor-dom-selection";
import {
  useEditor,
  useEditorRoot,
  useKeyboardEvent,
} from "../hooks";
import { useEffect } from "react";
import { reconcileCollapsedSelection } from "./utils/page-selection";
import { BUILTIN_KEYMAP, KEYBOARD_BINDING_IDS } from "../events/keymap";

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
 * the first selected block's state. Multiple changes route through the atomic
 * editor command rather than producing one undo item per block.
 */
export function PageCollapsePlugin() {
  const editor = useEditor();
  const { element: root } = useEditorRoot();
  const revision = editor.revision;

  useEffect(() => {
    const current = editor.selection.get();
    const next = reconcileCollapsedSelection(editor.getBlocks(), current);
    if (next !== current) {
      editor.execute("selection.set", { selection: next });
      // A native Range retains detached text nodes after React removes a
      // collapsed subtree. Clear it and focus the page's block-selection owner.
      root?.ownerDocument.getSelection()?.removeAllRanges();
      root?.focus({ preventScroll: true });
    }
  }, [editor, revision, root]);

  const setCollapsed = (value: boolean | "toggle"): boolean => {
    if (!root) return false;
    const current = editor.selection.get();
    // Chromium may deliver the shortcut before its selectionchange event after
    // a click. Reading the native caret keeps the keybinding deterministic.
    const nativeSelection = readEditorDOMSelection(root);
    const selection = nativeSelection?.length ? nativeSelection : current;
    const ids = collapseTargets(selection);
    if (!ids.length) return false;
    const firstId = ids[0]!;
    if (!editor.getBlock(firstId)) return false;

    editor.setBlocksCollapsed(
      ids,
      value === "toggle" ? !editor.getBlockCollapsed(firstId) : value,
    );
    return true;
  };

  useKeyboardEvent({
    id: KEYBOARD_BINDING_IDS.blockCollapse,
    keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.blockCollapse]!,
    mode: "block",
  }, () => setCollapsed(true));
  useKeyboardEvent({
    id: KEYBOARD_BINDING_IDS.blockExpand,
    keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.blockExpand]!,
    mode: "block",
  }, () => setCollapsed(false));
  useKeyboardEvent({
    id: KEYBOARD_BINDING_IDS.blockToggleCollapse,
    keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.blockToggleCollapse]!,
    mode: "block",
  }, () => setCollapsed("toggle"));

  return null;
}
