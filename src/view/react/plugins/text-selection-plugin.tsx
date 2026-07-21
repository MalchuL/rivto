import {
  useEffect,
  useLayoutEffect,
  useRef,
} from "react";
import type {
  EditorPosition,
  EditorSelection,
} from "../../../editor";
import { BLOCK_CONTENT_SELECTOR } from "../constants";
import { useEditor } from "../hooks/editor/use-editor";
import { useEditorRoot } from "../hooks/editor/use-editor-root";
import {
  clearTextSelectionHighlight,
  createBlockSelection,
  createDOMSelectionItems,
  orderedBlockIds,
  readDOMPointPosition,
  readDOMSelectionPoint,
  readEditorDOMSelection,
  resolveDOMSelectionPoint,
  setNativeSelection,
  updateTextSelectionHighlight,
  type DOMSelectionPoint,
} from "../hooks/utils/editor-dom-selection";

/** Live state retained only for the duration of one pointer selection gesture. */
interface PointerSelection {
  /** Pointer-down viewport position used to ignore accidental tiny movement. */
  readonly startX: number;
  readonly startY: number;
  /** Native and portable forms of the fixed pointer-down endpoint. */
  readonly anchor: DOMSelectionPoint;
  readonly anchorPosition: EditorPosition;
  /** Alt at gesture start keeps partial text across separate block hosts. */
  readonly textAcrossBlocks: boolean;
  /** True after movement crosses into another editable block host. */
  crossBlock: boolean;
  /** Latest moving endpoint, used to restore direction after pointer-up. */
  head?: DOMSelectionPoint;
  /** Latest portable list published to SelectionManager. */
  selection?: EditorSelection;
  /** True while the latest synthetic result selects complete blocks. */
  wholeBlocks: boolean;
}

/** Returns true when a pointer event began inside editable block content. */
function isEditableTarget(root: HTMLElement, target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  const content = target.closest<HTMLElement>(BLOCK_CONTENT_SELECTOR);
  return Boolean(content && root.contains(content));
}

/**
 * Synchronizes directed browser text selection with the editor selection list.
 *
 * Every block owns a separate contenteditable element. Browsers handle a drag
 * inside one element natively, but Chromium may collapse or reverse a range as
 * the pointer crosses into another editing host. This plugin keeps the original
 * pointer-down endpoint, resolves subsequent pointer coordinates itself, and
 * uses `Selection.setBaseAndExtent` to display the correct directed range.
 *
 * A normal drag that crosses block hosts becomes an inclusive BlockSelection,
 * matching Logseq. Alt at pointer-down retains the previous partial-text mode:
 * one directed TextSelection records exact endpoints and a BlockSelection item
 * records fully covered middle blocks. Returning to the original block restores
 * its exact text range from gesture-local endpoints.
 *
 * The plugin renders no UI and assumes no surface classes. It relies only on
 * the stable data attributes provided by BlockView and useBlockTextEditing.
 * Mount it once inside EditorView, alongside the active surface.
 *
 * @example
 * ```tsx
 * <EditorView editor={editor}>
 *   <TextSelectionPlugin />
 *   <PageSurface />
 * </EditorView>
 * ```
 */
export function TextSelectionPlugin() {
  const editor = useEditor();
  const { element: root } = useEditorRoot();
  const pointer = useRef<PointerSelection | null>(null);
  const currentSelection = editor.selection.get();

  // Repaint after document commands, remote changes, or clipboard operations.
  // It does not restore focus or the native range, so toolbar clicks remain safe.
  useLayoutEffect(() => {
    if (root) updateTextSelectionHighlight(root, currentSelection);
  }, [currentSelection, root]);

  useEffect(() => {
    if (!root) return;
    const document = root.ownerDocument;
    const window = document.defaultView;
    if (!window) return;
    let releaseTimer: number | undefined;
    let ownsCrossBlockSelection = false;

    /** Publishes the synthetic endpoint chosen for a cross-host gesture. */
    const publish = (active: PointerSelection, head: DOMSelectionPoint, headPosition: EditorPosition): void => {
      active.crossBlock = headPosition.blockId !== active.anchorPosition.blockId;
      active.head = head;
      active.wholeBlocks = active.crossBlock && !active.textAcrossBlocks;
      active.selection = active.wholeBlocks
        ? createBlockSelection(orderedBlockIds(root), active.anchorPosition.blockId, headPosition.blockId)
        : createDOMSelectionItems(root, active.anchorPosition, headPosition);
      if (!active.selection.length) return;

      editor.execute("selection.set", { selection: active.selection });
      if (active.wholeBlocks) {
        document.getSelection()?.removeAllRanges();
        root.focus({ preventScroll: true });
        clearTextSelectionHighlight(root);
      } else {
        setNativeSelection(active.anchor, head);
        updateTextSelectionHighlight(root, active.selection);
      }
    };

    /** Saves a stable pointer-down endpoint before native selection starts. */
    const start = (event: PointerEvent): void => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey) {
        if (releaseTimer !== undefined) window.clearTimeout(releaseTimer);
        pointer.current = null;
        ownsCrossBlockSelection = false;
        return;
      }
      if (event.button !== 0 || !isEditableTarget(root, event.target)) return;
      if (releaseTimer !== undefined) window.clearTimeout(releaseTimer);
      ownsCrossBlockSelection = false;
      const current = editor.selection.get();
      const clicked = readDOMSelectionPoint(root, event.clientX, event.clientY);
      const clickedPosition = clicked && readDOMPointPosition(root, clicked);

      // Shift extends the existing selection instead of replacing its anchor.
      // A block selection has no character endpoint, so it extends as blocks.
      if (event.shiftKey && clickedPosition) {
        const block = current.find((item) => item.type === "block");
        if (block?.type === "block") {
          event.preventDefault();
          ownsCrossBlockSelection = true;
          pointer.current = null;
          editor.execute("selection.set", {
            selection: createBlockSelection(orderedBlockIds(root), block.anchorBlockId, clickedPosition.blockId),
          });
          document.getSelection()?.removeAllRanges();
          root.focus({ preventScroll: true });
          clearTextSelectionHighlight(root);
          releaseTimer = window.setTimeout(() => { ownsCrossBlockSelection = false; });
          return;
        }

        const text = current.find((item) => item.type === "text");
        const anchor = text && resolveDOMSelectionPoint(root, text.anchor);
        if (text && anchor) {
          event.preventDefault();
          ownsCrossBlockSelection = true;
          const active: PointerSelection = {
            startX: event.clientX,
            startY: event.clientY,
            anchor,
            anchorPosition: text.anchor,
            textAcrossBlocks: event.altKey,
            crossBlock: false,
            wholeBlocks: false,
          };
          pointer.current = active;
          publish(active, clicked, clickedPosition);
          return;
        }
      }

      const anchor = clicked;
      const anchorPosition = anchor && readDOMPointPosition(root, anchor);
      pointer.current = anchor && anchorPosition ? {
        startX: event.clientX,
        startY: event.clientY,
        anchor,
        anchorPosition,
        textAcrossBlocks: event.altKey,
        crossBlock: false,
        wholeBlocks: false,
      } : null;
    };

    /** Bridges selection only after the pointer enters a different block host. */
    const move = (event: PointerEvent): void => {
      const active = pointer.current;
      if (!active || Math.hypot(event.clientX - active.startX, event.clientY - active.startY) < 3) return;

      const head = readDOMSelectionPoint(root, event.clientX, event.clientY);
      const headPosition = head && readDOMPointPosition(root, head);
      if (!head || !headPosition) return;

      const sameBlock = headPosition.blockId === active.anchorPosition.blockId;
      if (sameBlock && !active.crossBlock) return;

      // Native contenteditable selection owns same-block dragging. Once the
      // gesture crosses hosts, preventing its default movement avoids Chromium
      // replacing our original endpoint with a collapsed range in the new host.
      event.preventDefault();
      ownsCrossBlockSelection = true;
      publish(active, head, headPosition);
    };

    /** Restores the final directed native range, then releases pointer ownership. */
    const stop = (): void => {
      const completed = pointer.current;
      pointer.current = null;
      if (!completed?.head || !completed.selection || (!completed.crossBlock && !ownsCrossBlockSelection)) return;

      if (completed.wholeBlocks) {
        document.getSelection()?.removeAllRanges();
        clearTextSelectionHighlight(root);
      } else {
        setNativeSelection(completed.anchor, completed.head);
        updateTextSelectionHighlight(root, completed.selection);
      }

      // Firefox and Chromium can emit one delayed selectionchange after
      // pointer-up. Keep the synthetic result authoritative through that task.
      releaseTimer = window.setTimeout(() => {
        if (completed.wholeBlocks) {
          document.getSelection()?.removeAllRanges();
          clearTextSelectionHighlight(root);
        } else {
          setNativeSelection(completed.anchor, completed.head!);
          updateTextSelectionHighlight(root, completed.selection!);
        }
        ownsCrossBlockSelection = false;
      });
    };

    /** Mirrors ordinary native caret and same-host selection changes. */
    const synchronize = (): void => {
      if (ownsCrossBlockSelection) return;
      const selection = readEditorDOMSelection(root);
      if (selection) {
        editor.execute("selection.set", { selection });
        updateTextSelectionHighlight(root, selection);
        return;
      }

      // Losing the browser range clears only text items. A separate block or
      // edgeless selection remains valid local state.
      const current = editor.selection.get();
      const remaining = current.filter((item) => item.type !== "text");
      if (remaining.length !== current.length) editor.execute("selection.set", { selection: remaining });
      clearTextSelectionHighlight(root);
    };

    root.addEventListener("pointerdown", start);
    window.addEventListener("pointermove", move, { capture: true, passive: false });
    window.addEventListener("pointerup", stop, true);
    window.addEventListener("pointercancel", stop, true);
    document.addEventListener("selectionchange", synchronize);

    return () => {
      if (releaseTimer !== undefined) window.clearTimeout(releaseTimer);
      ownsCrossBlockSelection = false;
      pointer.current = null;
      root.removeEventListener("pointerdown", start);
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", stop, true);
      window.removeEventListener("pointercancel", stop, true);
      document.removeEventListener("selectionchange", synchronize);
      clearTextSelectionHighlight(root);
    };
  }, [editor, root]);

  return null;
}
