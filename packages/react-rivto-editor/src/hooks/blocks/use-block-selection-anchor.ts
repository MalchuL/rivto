import { isCaretSelection, resolveBlockRange } from "@chulane/rivto";
import { useLayoutEffect, type RefObject } from "react";
import { BLOCK_SELECTION_ANCHOR_ATTRIBUTE } from "../../constants";
import { useEditorView } from "../../editor-view/use-editor-view";
import { restoreDOMSelection } from "../../managers";

/** Props spread onto any renderer region from which selection may begin. */
export interface BlockSelectionAnchorAttributes {
  /**
   * Presence marker consumed by the text-selection extension for gesture eligibility.
   *
   * Text mode places it on the contenteditable alongside `data-block-content`;
   * structural mode places it on the region representing the complete block.
   * Interactive elements must ignore clicks whose event is `defaultPrevented`
   * because a completed pointer drag claims the browser's synthetic click.
   */
  readonly [BLOCK_SELECTION_ANCHOR_ATTRIBUTE]: "";
}

const selectionAnchorAttributes: BlockSelectionAnchorAttributes = { [BLOCK_SELECTION_ANCHOR_ATTRIBUTE]: "" };

/**
 * Restores a pending command's caret when its renderer mounts or changes editor/ID.
 * @param blockId - Stable block ID owning the pending caret.
 * @param elementRef - Text editable; when omitted, focus returns to the surface root.
 * @returns Nothing; layout cleanup cancels stale queued focus restoration.
 */
export function useRestoreBlockFocus(blockId: string, elementRef?: RefObject<HTMLDivElement | null>): void {
  const editorView = useEditorView();
  /** Restores a pending command's caret after commit; cleanup cancels stale work. */
  useLayoutEffect(() => {
    const textEdit = elementRef !== undefined;
    const element = elementRef ? elementRef.current : editorView.events.getRoot();
    if (!element || !editorView.selection.hasPendingSelectionCallback) return;
    const selection = editorView.selection.snapshot();
    if (selection?.focusBlockId !== blockId || !isCaretSelection(selection)) return;

    // A structural command remounts the focused editable before its scheduled
    // frame. Restore its caret immediately after the commit so the next key cannot land
    // on the document body. Only the pending command's own caret may take focus;
    // expanded ranges still wait until every endpoint has synchronized its text.
    // A contentless renderer uses the surface root so shortcuts such as undo
    // remain available after its previous editable element has been removed.
    let mounted = true;
    // Wait for the remaining layout effects without waiting for a paint.
    // Focusing inside the commit forces layout while React is still updating
    // sibling blocks. A newer selection or an unmount invalidates this work.
    queueMicrotask(() => {
      if (!mounted || !element.isConnected || !editorView.selection.hasPendingSelectionCallback ||
        editorView.selection.snapshot() !== selection) return;
      element.focus({ preventScroll: true });
      if (textEdit) {
        const range = selection.blocks[0]!;
        const point = { textOffset: resolveBlockRange(element.textContent?.length ?? 0, range.start, range.end).startOffset };
        restoreDOMSelection(element, { anchor: point, focus: point });
      } else {
        element.ownerDocument.getSelection()?.removeAllRanges();
      }
    });
    return () => { mounted = false; };
  }, [editorView, blockId, elementRef]);
}

/**
 * Marks one contentless region for whole-block selection and restores pending focus.
 * Enter/Tab behavior, clipboard policy, block selection, and slash commands remain
 * extension responsibilities. Interactive descendants must respect defaultPrevented.
 * @param blockId - Stable ID of the structural block; no document subscription is created.
 * @returns Stable presence attributes to spread on the single structural selection region.
 * @throws If called outside an EditorView subtree.
 */
export function useBlockSelectionAnchor(blockId: string): BlockSelectionAnchorAttributes {
  useRestoreBlockFocus(blockId);
  return selectionAnchorAttributes;
}
