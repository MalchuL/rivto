import {
  useCallback,
  useLayoutEffect,
  useRef,
  type HTMLAttributes,
  type RefObject,
} from "react";
import { BLOCK_CONTENT_ATTRIBUTE } from "../../constants";
import { restoreDOMSelection, saveDOMSelection } from "../utils/dom-text-selection";
import { useBlock } from "./use-block";

/** Props returned for a plain-text contentEditable block element. */
export interface BlockTextEditingProps {
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
 * Connects one block's collaborative plain text to a contentEditable element.
 *
 * The returned object is intended to be spread directly onto an otherwise
 * empty div. Native input is persisted through `useBlock` operations. Local
 * commands, direct document edits, undo/redo, and remote CRDT updates flow back
 * through EditorView's revision and are reconciled into the DOM before paint.
 * The DOM is only rewritten when its text differs, avoiding caret disruption
 * for the common local-input path.
 *
 * When an external change does require replacement, selection endpoints inside
 * the element are saved as text offsets and restored afterward. This also keeps
 * a cross-block selection whose other endpoint lives outside the edited block.
 * IME composition temporarily owns the DOM and commits on composition end.
 *
 * This hook owns plain-text synchronization only. Enter/Tab behavior, block
 * selection, clipboard commands, slash menus, and other event policy belong to
 * plugins or surfaces.
 *
 * @example
 * ```tsx
 * function ParagraphContent({ blockId }: { blockId: string }) {
 *   const editing = useBlockTextEditing(blockId);
 *   return <div {...editing} />;
 * }
 * ```
 *
 * @param blockId - Stable ID of the block whose content should be edited.
 * @returns Native editable props, event handlers, marker, and synchronization ref.
 * @throws If called outside an EditorView subtree.
 */
export function useBlockTextEditing(blockId: string): BlockTextEditingProps {
  const { block, operations } = useBlock(blockId);
  const elementRef = useRef<HTMLDivElement>(null);
  const composingRef = useRef(false);

  // Reconcile command-driven or remote content without treating the detached
  // block snapshot as mutable React state.
  useLayoutEffect(() => {
    const element = elementRef.current;
    if (!element || composingRef.current) return;

    const content = block?.content ?? "";
    if (element.textContent === content) return;

    const selection = saveDOMSelection(element);
    element.textContent = content;
    restoreDOMSelection(element, selection);
  }, [block?.content]);

  const commit = useCallback((element: HTMLDivElement) => {
    // ponytail: composition commits whole plain text; use beforeinput deltas if
    // concurrent character-level IME merging becomes a demonstrated need.
    operations.setContent(element.textContent ?? "");
  }, [operations]);

  const onInput = useCallback<BlockTextEditingProps["onInput"]>((event) => {
    if (!composingRef.current) commit(event.currentTarget);
  }, [commit]);

  const onCompositionStart = useCallback<BlockTextEditingProps["onCompositionStart"]>(() => {
    composingRef.current = true;
  }, []);

  const onCompositionEnd = useCallback<BlockTextEditingProps["onCompositionEnd"]>((event) => {
    composingRef.current = false;
    commit(event.currentTarget);
  }, [commit]);

  return {
    ref: elementRef,
    contentEditable: "plaintext-only",
    suppressContentEditableWarning: true,
    [BLOCK_CONTENT_ATTRIBUTE]: "",
    onInput,
    onCompositionStart,
    onCompositionEnd,
  };
}
