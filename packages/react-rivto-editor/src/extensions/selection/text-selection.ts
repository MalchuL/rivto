/**
 * Synchronizes native text gestures with Rivto's portable text and whole-block
 * selections. Editable anchors retain browser caret behavior, while explicit
 * structural anchors support plain-click, range, modifier, and drag selection
 * without taking activation away from their interactive descendants.
 *
 * @module
 */
import type {
  EditorPosition,
  Selection,
} from "@chulane/rivto";
import { isStructuralSelection } from "@chulane/rivto";
import {
  BLOCK_CONTENT_SELECTOR,
  BLOCK_SELECTION_ANCHOR_SELECTOR,
} from "../../constants";
import type { ReactEditor } from "../../types";
import { isElementNode } from "../../managers/events/dom-nodes";
import { findEdgelessRuntime } from "../edgeless/edgeless-runtime";
import {
  createVisibleStructuralSelection,
  createDOMSelection,
  orderedBlockIds,
  readBlockIdAtPoint,
  readDOMPointPosition,
  readDOMSelectionPoint,
  resolveSelectionEndpoints,
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

/**
 * Chooses complete blocks versus exact text endpoints for a modifier gesture.
 *
 * Crossing an editable host is structural by default, matching Shift-click and
 * Alt-drag. Shift+Alt is the only cross-block path that keeps partial first and
 * last character offsets.
 *
 * @param event - Pointer modifiers from the current gesture.
 * @param crossBlock - Whether the moving endpoint left the anchor host.
 * @returns Whether the gesture should publish an inclusive block selection.
 */
function wantsWholeBlocks(
  event: Pick<PointerEvent, "altKey" | "shiftKey">,
  crossBlock: boolean,
): boolean {
  if (!crossBlock) return false;
  return !(event.shiftKey && event.altKey);
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
  selection?: Selection;
  /** True while the latest synthetic result selects complete blocks. */
  wholeBlocks: boolean;
}

/**
 * Publishes exact text endpoints and structural block gestures to core.
 *
 * Every block owns a separate contenteditable element. Browsers handle a drag
 * inside one element natively, but Chromium may collapse or reverse a range as
 * the pointer crosses into another editing host. This extension keeps the original
 * pointer-down endpoint, resolves subsequent pointer coordinates itself, and
 * uses `Selection.setBaseAndExtent` to display the correct directed range.
 *
 * A drag between editable hosts selects complete blocks. Shift+Alt is the
 * exception: it keeps exact text endpoints and fully covers blocks between
 * them. Structural block renderers produce whole blocks because they have no
 * caret.
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
      active.wholeBlocks = forceWholeBlocks;
      active.selection = active.wholeBlocks
        ? createVisibleStructuralSelection(orderedBlockIds(root), active.anchorPosition.blockId, headPosition.blockId)
        : createDOMSelection(root, active.anchorPosition, headPosition);
      if (!active.selection) return;

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

          // A second click can arrive before the browser dispatches the first
          // click's selectionchange. Read its live caret before extending it.
          const nativeSelection = event.shiftKey ? reactEditor.selection.readDOM() : undefined;
          if (nativeSelection) reactEditor.selection.set(nativeSelection);
          const current = nativeSelection ?? reactEditor.selection.get();
          // Shift extends the existing selection instead of replacing its anchor.
          if (event.shiftKey && clickedPosition) {
            const item = current;
            const lengthOf = (id: string) => editor.blocks.getBlock(id)?.content.length ?? 0;
            const ends = item ? resolveSelectionEndpoints(item, lengthOf) : undefined;
            const originId = ends?.anchor.blockId ?? item?.anchorBlockId;
            const wholeBlocks = originId
              ? wantsWholeBlocks(event, originId !== clickedPosition.blockId)
              : false;
            if (originId && wholeBlocks) {
              ownsCrossBlockSelection = true;
              pointer = null;
              const next = createVisibleStructuralSelection(orderedBlockIds(root), originId, clickedPosition.blockId);
              if (next) reactEditor.selection.set(next);
              root.ownerDocument.getSelection()?.removeAllRanges();
              root.focus({ preventScroll: true });
              releaseTimer = view?.setTimeout(() => { ownsCrossBlockSelection = false; });
              handled = true;
            } else if (clicked) {
              const ids = orderedBlockIds(root);
              const originFromBlock = item?.anchorBlockId;
              const originIndex = originFromBlock ? ids.indexOf(originFromBlock) : -1;
              const clickIndex = originFromBlock ? ids.indexOf(clickedPosition.blockId) : -1;
              const originContentLength = originFromBlock
                ? (editor.blocks.getBlock(originFromBlock)?.content.length ?? 0)
                : 0;
              const anchorPosition = ends?.anchor ?? (originFromBlock
                ? {
                    blockId: originFromBlock,
                    offset: originIndex > clickIndex ? originContentLength : 0,
                  }
                : undefined);
              const anchor = anchorPosition && resolveDOMSelectionPoint(root, anchorPosition);
              if (anchor && anchorPosition) {
                ownsCrossBlockSelection = true;
                const active: PointerSelection = {
                  startX: event.clientX,
                  startY: event.clientY,
                  anchor,
                  anchorPosition,
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
      const head = active.anchor ? readDOMSelectionPoint(root, event.clientX, event.clientY) : undefined;
      const headPosition = head && readDOMPointPosition(root, head);
      // Caret hit-testing falls back to a nearby editable host over contentless
      // blocks. Shift+Alt keeps that DOM point only for native painting and
      // uses the actual BlockView hit as the portable selection endpoint.
      //
      // Nested parents wrap descendant rows, so a bottom-to-top drag can sit
      // in the margin between children while `elementFromPoint` still reports
      // the parent. `readBlockIdAtPoint` maps that wrapping hit to the nearest
      // nested row. Promoting the parent here would select the whole subtree
      // even though the pointer never entered the parent's own row.
      const partialContentlessBlockId = event.shiftKey && event.altKey
        && pointedBlockId !== headPosition?.blockId ? pointedBlockId : undefined;
      const effectiveHeadPosition = partialContentlessBlockId
        ? { blockId: partialContentlessBlockId, offset: 0 }
        : headPosition;
      const crossBlock = (effectiveHeadPosition?.blockId ?? pointedBlockId) !== active.anchorPosition.blockId;
      const wholeBlocks = wantsWholeBlocks(event, Boolean(crossBlock));
      let handled = false;
      if (wholeBlocks && pointedBlockId && pointedBlockId !== headPosition?.blockId && (
        pointedBlockId !== active.anchorPosition.blockId || !active.anchor
      )) {
        ownsCrossBlockSelection = true;
        if (!active.anchor) suppressClickBlockId = active.anchorPosition.blockId;
        publish(active, undefined, { blockId: pointedBlockId, offset: 0 }, true);
        handled = true;
      } else if (head && effectiveHeadPosition) {
        const sameBlock = effectiveHeadPosition.blockId === active.anchorPosition.blockId;
        if (!(sameBlock && !ownsCrossBlockSelection)) {
          ownsCrossBlockSelection = true;
          publish(active, head, effectiveHeadPosition, wholeBlocks);
          handled = true;
        }
      } else if (pointedBlockId && (
        pointedBlockId !== active.anchorPosition.blockId || !active.anchor
      )) {
        // Contentless structural blocks have no caret geometry, so their stable
        // BlockView marker advances a whole-block range instead.
        ownsCrossBlockSelection = true;
        if (!active.anchor) suppressClickBlockId = active.anchorPosition.blockId;
        publish(active, undefined, { blockId: pointedBlockId, offset: 0 }, true);
        handled = true;
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

      const selection = createVisibleStructuralSelection(orderedBlockIds(root), blockId, blockId);
      if (selection) reactEditor.selection.set(selection);
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
        // Losing the browser range keeps a structural selection and clears carets.
        const current = reactEditor.selection.get();
        if (current && !isStructuralSelection(current)) reactEditor.selection.clear();
      }
      return false;
  });

  return () => {
    const root = reactEditor.events.getRoot();
    if (releaseTimer !== undefined) {
      root?.ownerDocument.defaultView?.clearTimeout(releaseTimer);
    }
    ownsCrossBlockSelection = false;
    suppressClickBlockId = undefined;
    pointer = null;
  };
}
