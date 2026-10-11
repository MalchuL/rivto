import { useCallback, useLayoutEffect, useMemo, type HTMLAttributes, type RefObject } from "react";
import { BLOCK_CONTENT_ATTRIBUTE, BLOCK_SELECTION_ANCHOR_ATTRIBUTE } from "../../constants";
import { useEditorView } from "../../editor-view/use-editor-view";
import { BlockEditingController } from "./block-editing-controller";
import { useRestoreBlockFocus, type BlockSelectionAnchorAttributes } from "./use-block-selection-anchor";

/** Props spread onto a collaborative plain-text contenteditable element. */
export interface BlockTextEditingAttributes extends BlockSelectionAnchorAttributes {
  /** Ref used to synchronize external content and preserve DOM selections. */
  readonly ref: RefObject<HTMLDivElement | null>;
  /** Native plain-text editing mode; rich HTML is not persisted by this hook. */
  readonly contentEditable: "plaintext-only";
  /** Acknowledges that the browser, rather than React children, owns the text. */
  readonly suppressContentEditableWarning: true;
  /** Stable marker used by delegated events and DOM-selection utilities. */
  readonly [BLOCK_CONTENT_ATTRIBUTE]: "";
  /** Persists native browser edits through the block command API. */
  readonly onInput: NonNullable<HTMLAttributes<HTMLDivElement>["onInput"]>;
  /** Defers synchronization while an IME composition is active. */
  readonly onCompositionStart: NonNullable<HTMLAttributes<HTMLDivElement>["onCompositionStart"]>;
  /** Commits the completed IME composition as one plain-text update. */
  readonly onCompositionEnd: NonNullable<HTMLAttributes<HTMLDivElement>["onCompositionEnd"]>;
}

/**
 * Synchronizes one browser-owned plain-text editable without subscribing to the document.
 * External commands, undo/redo, and remote CRDT updates reconcile before paint.
 * DOM selection offsets are saved and restored when replacement is necessary;
 * IME composition owns the DOM until composition end. React must not supply text children.
 * @param blockId - Stable persisted ID receiving native input through the block manager.
 * @param content - Current reactive content from useBlockNode; undefined means missing/deleted.
 * @returns Stable DOM attributes to spread on exactly one editable div.
 * @throws If called outside an EditorView subtree.
 */
export function useBlockTextEditing(blockId: string, content: string | undefined): BlockTextEditingAttributes {
  const editorView = useEditorView();
  const setContent = useCallback((value: string) => {
    editorView.runtime.blocks.updateBlock(blockId, { content: value });
  }, [editorView, blockId]);
  const controller = useMemo(() => new BlockEditingController(setContent), [setContent]);
  // Reconcile command-driven or remote content without treating the detached
  // block snapshot as mutable React state. Run after each commit so replacing
  // the editable DOM node also synchronizes unchanged document text.
  useLayoutEffect(() => controller.synchronize(content ?? ""));
  useRestoreBlockFocus(blockId, controller.elementRef);
  return useMemo(() => ({
    ref: controller.elementRef,
    contentEditable: "plaintext-only" as const,
    suppressContentEditableWarning: true as const,
    [BLOCK_SELECTION_ANCHOR_ATTRIBUTE]: "" as const,
    [BLOCK_CONTENT_ATTRIBUTE]: "" as const,
    onInput: controller.onInput,
    onCompositionStart: controller.onCompositionStart,
    onCompositionEnd: controller.onCompositionEnd,
  }), [controller]);
}
