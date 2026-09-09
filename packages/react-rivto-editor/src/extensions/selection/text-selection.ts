/**
 * Synchronizes native text gestures with Rivto's portable text and whole-block
 * selections. Editable anchors retain browser caret behavior, while explicit
 * structural anchors support plain-click, range, modifier, and drag selection
 * without taking activation away from their interactive descendants.
 *
 * @module
 */
import type { ReactSelection } from "../../managers/selection/selection-manager";
import type {
  EditorPosition,
} from "@chulane/rivto";
import {
  BLOCK_CONTENT_SELECTOR,
  BLOCK_SELECTION_ANCHOR_SELECTOR,
} from "../../constants";
import type { ReactEditor } from "../../types";
import { isElementNode } from "../../managers/events/dom-nodes";
import { findEdgelessRuntime } from "../edgeless/edgeless-runtime";
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
} from "../../managers";

const INTERACTIVE_STRUCTURAL_TARGET_SELECTOR =
  `${BLOCK_CONTENT_SELECTOR}, input, textarea, select, button, a`;

/** Returns whether a control inside a structural anchor keeps its native click. */
function isInteractiveStructuralTarget(target: Element): boolean {
  return Boolean(target.closest(INTERACTIVE_STRUCTURAL_TARGET_SELECTOR));
}

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
  /** True after movement crosses into another editable block host. */
  crossBlock: boolean;
  /** Latest moving endpoint, used to restore direction after pointer-up. */
  head?: DOMSelectionPoint;
  /** Latest portable list published to SelectionManager. */
  selection?: ReactSelection;
  /** True while the latest synthetic result selects complete blocks. */
  wholeBlocks: boolean;
}

/**
 * Keeps single-block text editing local and publishes whole-block gestures.
 *
 * Every block owns a separate contenteditable element. Browsers handle a drag
 * inside one element natively, but Chromium may collapse or reverse a range as
 * the pointer crosses into another editing host. This extension keeps the original
 * pointer-down endpoint, resolves subsequent pointer coordinates itself, and
 * uses `Selection.setBaseAndExtent` to display the correct directed range.
 *
 * A drag that crosses block hosts becomes an inclusive BlockSelection.
 * Returning to the original block restores its exact local text range from
 * gesture-local endpoints. Modifier keys do not enable cross-block text.
 *
 * The extension renders no UI and assumes no surface classes. It relies only on
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
export function registerTextSelection(reactEditor: ReactEditor): () => void {
  const { editor } = reactEditor;
  let pointer: PointerSelection | null = null;
  let releaseTimer: number | undefined;
  let suppressClickBlockId: string | undefined;
  let ownsCrossBlockSelection = false;
  const unsubscribeSelection = reactEditor.selection.subscribe(() => {
    if (editor.mode.get() === "edgeless" && reactEditor.selection.get().length) {
      findEdgelessRuntime(reactEditor)?.deactivate();
    }
  });

  /** Publishes the synthetic endpoint chosen for a cross-host gesture. */
  const publish = (
    active: PointerSelection,
    head: DOMSelectionPoint | undefined,
    headPosition: EditorPosition,
    forceWholeBlocks = false,
  ): void => {
      const root = reactEditor.events.getRoot();
      if (!root) return;
      active.crossBlock = headPosition.blockId !== active.anchorPosition.blockId;
      active.head = head;
      active.wholeBlocks = forceWholeBlocks || active.crossBlock;
      active.selection = active.wholeBlocks
        ? createBlockSelection(orderedBlockIds(root), active.anchorPosition.blockId, headPosition.blockId)
        : createDOMSelectionItems(root, active.anchorPosition, headPosition);
      if (!active.selection.length) return;

      reactEditor.selection.set(active.selection);
      if (active.wholeBlocks) {
        root.ownerDocument.getSelection()?.removeAllRanges();
        // Keep the originating contenteditable focused for the duration of the
        // gesture. Focusing the root here would blur MarkdownContent, replace
        // its raw editor with formatted preview geometry, and make a return to
        // the original block resolve a different character offset.
      } else if (active.anchor && head) {
        setNativeSelection(active.anchor, head);
      }
  };

  reactEditor.events.register({
    id: "text-selection.pointer-start",
    type: "pointerdown",
    scope: "block",
  }, ({ raw: event, blockId, root }) => {
      const view = root.ownerDocument.defaultView;
      let handled = false;
      if (event.ctrlKey || event.metaKey) {
        if (releaseTimer !== undefined) view?.clearTimeout(releaseTimer);
        pointer = null;
        ownsCrossBlockSelection = false;
      } else if (event.button === 0) {
        const selectionAnchor = isElementNode(event.target)
          ? event.target.closest<HTMLElement>(BLOCK_SELECTION_ANCHOR_SELECTOR)
          : null;
        if (selectionAnchor && root.contains(selectionAnchor)) {
          if (releaseTimer !== undefined) view?.clearTimeout(releaseTimer);
          ownsCrossBlockSelection = false;

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

          const current = reactEditor.selection.get();
          // Shift extends the existing selection instead of replacing its anchor.
          // A block selection has no character endpoint, so it extends as blocks.
          if (event.shiftKey && clickedPosition) {
            const block = current.find((item) => item.type === "block");
            if (block?.type === "block") {
              ownsCrossBlockSelection = true;
              pointer = null;
              reactEditor.selection.set(
                createBlockSelection(orderedBlockIds(root), block.anchorBlockId, clickedPosition.blockId),
              );
              root.ownerDocument.getSelection()?.removeAllRanges();
              root.focus({ preventScroll: true });
              releaseTimer = view?.setTimeout(() => { ownsCrossBlockSelection = false; });
              handled = true;
            } else {
              const text = current.find((item) => item.type === "text");
              const anchor = text && resolveDOMSelectionPoint(root, text.anchor);
              if (text && anchor) {
                ownsCrossBlockSelection = true;
                const active: PointerSelection = {
                  startX: event.clientX,
                  startY: event.clientY,
                  anchor,
                  anchorPosition: text.anchor,
                  crossBlock: false,
                  wholeBlocks: false,
                };
                pointer = active;
                publish(active, clicked, clickedPosition);
                handled = true;
              }
            }
          }

          if (!handled) {
            if (!textTarget && blockId) {
              // `readDOMSelectionPoint` intentionally falls back to the nearest
              // editable host. Explicit structural anchors bypass that fallback so
              // they retain their own block ID before movement begins.
              pointer = {
                startX: event.clientX,
                startY: event.clientY,
                anchorPosition: { blockId, offset: 0 },
                crossBlock: false,
                wholeBlocks: false,
              };
            } else {
              const anchor = clicked;
              const anchorPosition = anchor && readDOMPointPosition(root, anchor);
              pointer = anchor && anchorPosition ? {
                startX: event.clientX,
                startY: event.clientY,
                anchor,
                anchorPosition,
                crossBlock: false,
                wholeBlocks: false,
              } : null;
            }
          }
        }
      }
      return handled;
  });

  reactEditor.events.register({
    id: "text-selection.pointer-move",
    type: "pointermove",
    target: "window",
    capture: true,
    passive: false,
  }, ({ raw: event, root }) => {
      const active = pointer;
      if (!active || Math.hypot(event.clientX - active.startX, event.clientY - active.startY) < 3) return false;

      const pointedBlockId = readBlockIdAtPoint(root, event.clientX, event.clientY);
      let handled = false;
      if (pointedBlockId && (
        pointedBlockId !== active.anchorPosition.blockId || !active.anchor
      )) {
        // Normal cross-block drag selects complete blocks, so it needs only the
        // BlockView marker. Resolving this before text caret geometry lets
        // contentless custom blocks advance the range immediately.
        ownsCrossBlockSelection = true;
        if (!active.anchor) suppressClickBlockId = active.anchorPosition.blockId;
        publish(active, undefined, { blockId: pointedBlockId, offset: 0 }, true);
        handled = true;
      } else {
        const head = readDOMSelectionPoint(root, event.clientX, event.clientY);
        const headPosition = head && readDOMPointPosition(root, head);
        if (head && headPosition) {
          const sameBlock = headPosition.blockId === active.anchorPosition.blockId;
          // Native selection owns a gesture only until it first crosses an editing
          // host. After that transition, continue publishing every move—even after
          // returning to the anchor block—so `active.head` follows the pointer
          // instead of freezing at the first same-block re-entry offset.
          if (!(sameBlock && !ownsCrossBlockSelection)) {
            // Native contenteditable selection owns same-block dragging. Once the
            // gesture crosses hosts, preventing its default movement avoids Chromium
            // replacing our original endpoint with a collapsed range in the new host.
            ownsCrossBlockSelection = true;
            publish(active, head, headPosition);
            handled = true;
          }
        }
      }
      return handled;
  });

  const stop = (): false => {
      const root = reactEditor.events.getRoot();
      const completed = pointer;
      pointer = null;
      if (!root || !completed?.selection || (!completed.wholeBlocks && !completed.head) ||
        (!completed.crossBlock && !ownsCrossBlockSelection)) return false;

      if (completed.wholeBlocks) {
        root.ownerDocument.getSelection()?.removeAllRanges();
        // The gesture really ended as structural selection, so keyboard block
        // commands should now be routed through the surface root.
        root.focus({ preventScroll: true });
      } else {
        setNativeSelection(completed.anchor!, completed.head!);
      }
      // Firefox and Chromium can emit one delayed selectionchange after
      // pointer-up. Keep the synthetic result authoritative through that task.
      releaseTimer = root.ownerDocument.defaultView?.setTimeout(() => {
        if (completed.wholeBlocks) {
          root.ownerDocument.getSelection()?.removeAllRanges();
        } else {
          setNativeSelection(completed.anchor!, completed.head!);
        }
        suppressClickBlockId = undefined;
        ownsCrossBlockSelection = false;
      });
      return false;
  };
  reactEditor.events.register({
    id: "text-selection.pointer-end",
    type: "pointerup",
    target: "window",
    capture: true,
  }, stop);
  reactEditor.events.register({
    id: "text-selection.pointer-cancel",
    type: "pointercancel",
    target: "window",
    capture: true,
  }, stop);

  reactEditor.events.register({
    id: "text-selection.suppress-anchor-click",
    type: "click",
    capture: true,
    scope: "block",
  }, ({ raw: event, blockId, root }) => {
      if (!blockId) return false;
      if (blockId === suppressClickBlockId) {
        // A control may still receive `click` after its pointer gesture became a
        // structural drag. Claim that click so controls respecting
        // `defaultPrevented` do not perform their normal action.
        suppressClickBlockId = undefined;
        return true;
      }
      if (
        event.button !== 0 ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        !isElementNode(event.target) ||
        isInteractiveStructuralTarget(event.target)
      ) return false;
      const anchor = event.target.closest<HTMLElement>(BLOCK_SELECTION_ANCHOR_SELECTOR);
      if (!anchor || anchor.isContentEditable || !root.contains(anchor)) return false;

      reactEditor.selection.set(createBlockSelection(orderedBlockIds(root), blockId, blockId));
      if (editor.mode.get() === "edgeless") findEdgelessRuntime(reactEditor)?.deactivate();
      root.ownerDocument.getSelection()?.removeAllRanges();
      root.focus({ preventScroll: true });
      return true;
  });

  reactEditor.events.register({
    id: "text-selection.selection-change",
    type: "selectionchange",
    target: "document",
  }, () => {
      if (ownsCrossBlockSelection) return false;
      const selection = reactEditor.selection.readDOM();
      if (selection) {
        reactEditor.selection.set(selection);
      } else if (!(editor.mode.get() === "edgeless" && findEdgelessRuntime(reactEditor)?.get().active)) {
        // Losing the browser range clears only text items. A separate whole-block
        // selection remains valid local state.
        const current = reactEditor.selection.get();
        const remaining = current.filter((item) => item.type !== "text");
        if (remaining.length !== current.length) reactEditor.selection.set(remaining);
      }
      return false;
  });

  return () => {
    const root = reactEditor.events.getRoot();
    if (releaseTimer !== undefined) {
      root?.ownerDocument.defaultView?.clearTimeout(releaseTimer);
    }
    unsubscribeSelection();
    ownsCrossBlockSelection = false;
    suppressClickBlockId = undefined;
    pointer = null;
  };
}
