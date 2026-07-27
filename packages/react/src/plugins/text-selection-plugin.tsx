import {
  useEffect,
  useLayoutEffect,
  useRef,
} from "react";
import type {
  EditorPosition,
  EditorSelection,
} from "@chulane/rivto";
import { BLOCK_SELECTION_ANCHOR_SELECTOR } from "../constants";
import { useEditor, useReactEditor } from "../hooks/editor/use-editor";
import { useDOMEvent } from "../hooks/editor/use-dom-event";
import { useEditorRoot } from "../hooks/editor/use-editor-root";
import {
  createBlockSelection,
  createDOMSelectionItems,
  orderedBlockIds,
  readBlockIdAtPoint,
  readDOMPointPosition,
  readDOMSelectionPoint,
  resolveDOMSelectionPoint,
  setNativeSelection,
  type DOMSelectionPoint,
} from "../managers";

/** Live state retained only for the duration of one pointer selection gesture. */
interface PointerSelection {
  /** Pointer-down viewport position used to ignore accidental tiny movement. */
  readonly startX: number;
  readonly startY: number;
  /**
   * Native form of the fixed endpoint.
   *
   * Structural selection anchors have no DOM caret endpoint, so gestures that
   * start from them intentionally leave this undefined.
   */
  readonly anchor?: DOMSelectionPoint;
  /** Portable form of the fixed pointer-down endpoint. */
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
 * the stable data attributes provided by BlockView and useBlockEditing.
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
  const reactEditor = useReactEditor();
  const { element: root } = useEditorRoot();
  const pointer = useRef<PointerSelection | null>(null);
  const releaseTimer = useRef<number | undefined>(undefined);
  const suppressClickBlockId = useRef<string | undefined>(undefined);
  const ownsCrossBlockSelection = useRef(false);
  const currentSelection = editor.selection.get();

  // Repaint after document commands, remote changes, or clipboard operations.
  // It does not restore focus or the native range, so toolbar clicks remain safe.
  useLayoutEffect(() => {
    reactEditor.selection.updateDOMHighlight(currentSelection);
  }, [currentSelection, reactEditor]);

  /** Publishes the synthetic endpoint chosen for a cross-host gesture. */
  const publish = (
    active: PointerSelection,
    head: DOMSelectionPoint | undefined,
    headPosition: EditorPosition,
    forceWholeBlocks = false,
  ): void => {
      if (!root) return;
      active.crossBlock = headPosition.blockId !== active.anchorPosition.blockId;
      active.head = head;
      active.wholeBlocks = forceWholeBlocks || (active.crossBlock && !active.textAcrossBlocks);
      active.selection = active.wholeBlocks
        ? createBlockSelection(orderedBlockIds(root), active.anchorPosition.blockId, headPosition.blockId)
        : createDOMSelectionItems(root, active.anchorPosition, headPosition);
      if (!active.selection.length) return;

      editor.selection.set(active.selection);
      if (active.wholeBlocks) {
        root.ownerDocument.getSelection()?.removeAllRanges();
        // Keep the originating contenteditable focused for the duration of the
        // gesture. Focusing the root here would blur MarkdownContent, replace
        // its raw editor with formatted preview geometry, and make a return to
        // the original block resolve a different character offset.
        reactEditor.selection.clearDOMHighlight();
      } else if (active.anchor && head) {
        setNativeSelection(active.anchor, head);
        reactEditor.selection.updateDOMHighlight(active.selection);
      }
  };

  useDOMEvent("pointerdown", ({ event, blockId }) => {
      if (!root) return false;
      const view = root.ownerDocument.defaultView;
      if (event.ctrlKey || event.metaKey) {
        if (releaseTimer.current !== undefined) view?.clearTimeout(releaseTimer.current);
        pointer.current = null;
        ownsCrossBlockSelection.current = false;
        return false;
      }
      if (event.button !== 0) return false;
      const selectionAnchor = event.target instanceof Element
        ? event.target.closest<HTMLElement>(BLOCK_SELECTION_ANCHOR_SELECTOR)
        : null;
      if (!selectionAnchor || !root.contains(selectionAnchor)) return false;
      if (releaseTimer.current !== undefined) view?.clearTimeout(releaseTimer.current);
      ownsCrossBlockSelection.current = false;

      // The anchor marker is the only gesture-entry contract. Text mode puts
      // it directly on a contenteditable; structural mode puts it on a normal
      // renderer region. `data-block-content` remains an offset-mapping detail
      // owned by the DOM-selection utilities rather than pointer routing.
      const textTarget = selectionAnchor.isContentEditable;
      const clicked = textTarget
        ? readDOMSelectionPoint(root, event.clientX, event.clientY)
        : undefined;
      const clickedPosition = clicked
        ? readDOMPointPosition(root, clicked)
        : blockId ? { blockId, offset: 0 } : undefined;

      const current = editor.selection.get();
      // Shift extends the existing selection instead of replacing its anchor.
      // A block selection has no character endpoint, so it extends as blocks.
      if (event.shiftKey && clickedPosition) {
        const block = current.find((item) => item.type === "block");
        if (block?.type === "block") {
          ownsCrossBlockSelection.current = true;
          pointer.current = null;
          editor.selection.set(
            createBlockSelection(orderedBlockIds(root), block.anchorBlockId, clickedPosition.blockId),
          );
          root.ownerDocument.getSelection()?.removeAllRanges();
          root.focus({ preventScroll: true });
          reactEditor.selection.clearDOMHighlight();
          releaseTimer.current = view?.setTimeout(() => { ownsCrossBlockSelection.current = false; });
          return true;
        }

        const text = current.find((item) => item.type === "text");
        const anchor = text && resolveDOMSelectionPoint(root, text.anchor);
        if (text && anchor) {
          ownsCrossBlockSelection.current = true;
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
          return true;
        }
      }

      if (!textTarget && blockId) {
        // `readDOMSelectionPoint` intentionally falls back to the nearest
        // editable host. Explicit structural anchors bypass that fallback so
        // they retain their own block ID before movement begins.
        pointer.current = {
          startX: event.clientX,
          startY: event.clientY,
          anchorPosition: { blockId, offset: 0 },
          textAcrossBlocks: false,
          crossBlock: false,
          wholeBlocks: false,
        };
        return false;
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
      return false;
  });

  useDOMEvent("pointermove", ({ event }) => {
      if (!root) return false;
      const active = pointer.current;
      if (!active || Math.hypot(event.clientX - active.startX, event.clientY - active.startY) < 3) return false;

      const pointedBlockId = readBlockIdAtPoint(root, event.clientX, event.clientY);
      if (!active.textAcrossBlocks && pointedBlockId && (
        pointedBlockId !== active.anchorPosition.blockId || !active.anchor
      )) {
        // Normal cross-block drag selects complete blocks, so it needs only the
        // BlockView marker. Resolving this before text caret geometry lets
        // contentless custom blocks advance the range immediately.
        ownsCrossBlockSelection.current = true;
        if (!active.anchor) suppressClickBlockId.current = active.anchorPosition.blockId;
        publish(active, undefined, { blockId: pointedBlockId, offset: 0 }, true);
        return true;
      }

      const head = readDOMSelectionPoint(root, event.clientX, event.clientY);
      const headPosition = head && readDOMPointPosition(root, head);
      if (!head || !headPosition) return false;

      const sameBlock = headPosition.blockId === active.anchorPosition.blockId;
      // Native selection owns a gesture only until it first crosses an editing
      // host. After that transition, continue publishing every move—even after
      // returning to the anchor block—so `active.head` follows the pointer
      // instead of freezing at the first same-block re-entry offset.
      if (sameBlock && !ownsCrossBlockSelection.current) return false;

      // Native contenteditable selection owns same-block dragging. Once the
      // gesture crosses hosts, preventing its default movement avoids Chromium
      // replacing our original endpoint with a collapsed range in the new host.
      ownsCrossBlockSelection.current = true;
      publish(active, head, headPosition);
      return true;
  }, { target: "window", capture: true, passive: false });

  const stop = (): false => {
      const completed = pointer.current;
      pointer.current = null;
      if (!root || !completed?.selection || (!completed.wholeBlocks && !completed.head) ||
        (!completed.crossBlock && !ownsCrossBlockSelection.current)) return false;

      if (completed.wholeBlocks) {
        root.ownerDocument.getSelection()?.removeAllRanges();
        // The gesture really ended as structural selection, so keyboard block
        // commands should now be routed through the surface root.
        root.focus({ preventScroll: true });
        reactEditor.selection.clearDOMHighlight();
      } else {
        setNativeSelection(completed.anchor!, completed.head!);
        reactEditor.selection.updateDOMHighlight(completed.selection);
      }

      // Firefox and Chromium can emit one delayed selectionchange after
      // pointer-up. Keep the synthetic result authoritative through that task.
      releaseTimer.current = root.ownerDocument.defaultView?.setTimeout(() => {
        if (completed.wholeBlocks) {
          root.ownerDocument.getSelection()?.removeAllRanges();
          reactEditor.selection.clearDOMHighlight();
        } else {
          setNativeSelection(completed.anchor!, completed.head!);
          reactEditor.selection.updateDOMHighlight(completed.selection!);
        }
        suppressClickBlockId.current = undefined;
        ownsCrossBlockSelection.current = false;
      });
      return false;
  };
  useDOMEvent("pointerup", stop, { target: "window", capture: true });
  useDOMEvent("pointercancel", stop, { target: "window", capture: true });

  useDOMEvent("click", ({ blockId }) => {
      if (!blockId || blockId !== suppressClickBlockId.current) return false;
      // A control may still receive `click` after its pointer gesture became a
      // structural drag. Claim that click so controls respecting
      // `defaultPrevented` do not perform their normal action.
      suppressClickBlockId.current = undefined;
      return true;
  }, { capture: true });

  useDOMEvent("selectionchange", () => {
      if (!root || ownsCrossBlockSelection.current) return false;
      const selection = reactEditor.selection.readDOM();
      if (selection) {
        editor.selection.set(selection);
        reactEditor.selection.updateDOMHighlight(selection);
        return false;
      }

      // Losing the browser range clears only text items. A separate block or
      // edgeless selection remains valid local state.
      const current = editor.selection.get();
      const remaining = current.filter((item) => item.type !== "text");
      if (remaining.length !== current.length) editor.selection.set(remaining);
      reactEditor.selection.clearDOMHighlight();
      return false;
  }, { target: "document" });

  useEffect(() => {
    return () => {
      if (releaseTimer.current !== undefined) {
        root?.ownerDocument.defaultView?.clearTimeout(releaseTimer.current);
      }
      ownsCrossBlockSelection.current = false;
      suppressClickBlockId.current = undefined;
      pointer.current = null;
      reactEditor.selection.clearDOMHighlight();
    };
  }, [reactEditor, root]);

  return null;
}
