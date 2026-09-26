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
  PREVENT_TEXT_EDITING_SELECTOR,
} from "../../../constants";
import type { ReactEditor } from "../../../types";
import { isElementNode } from "../../../managers/events/dom-nodes";
import { findEdgelessRuntime } from "./edgeless-runtime";
import { pageWindowFor } from "../../../surfaces/page/page-window";
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
} from "../../../managers";

/**
 * Matches targets that must be excluded from whole-block structural selection.
 *
 * This is an exclusion list, not a list of places where selection may start.
 * Plain structural-anchor space starts block selection; native controls keep
 * their browser behavior instead. Accessible custom controls such as an empty
 * container's `div[role="button"]` use the explicit marker supplied by
 * `preventTextEditingAttributes`, avoiding component-specific selectors here.
 * Editable block content is also excluded from the plain-click structural path,
 * while the pointer-start path handles its native text selection separately.
 */
const STRUCTURAL_SELECTION_EXCLUDED_TARGET_SELECTOR =
  `${BLOCK_CONTENT_SELECTOR}, ${PREVENT_TEXT_EDITING_SELECTOR}, input, textarea, select, button, a`;

/**
 * Reports whether a target must retain native interaction instead of starting
 * whole-block structural selection.
 *
 * @param target - Deepest DOM element reached by the pointer or click event.
 * @returns Whether the target or one of its ancestors is explicitly excluded.
 */
function isExcludedFromStructuralSelection(target: Element): boolean {
  return Boolean(target.closest(STRUCTURAL_SELECTION_EXCLUDED_TARGET_SELECTOR));
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

/** Latest viewport pointer state used while selection auto-scrolls without new pointer events. */
interface PointerSelectionCoordinates {
  /** Horizontal viewport coordinate. */
  readonly x: number;
  /** Vertical viewport coordinate. */
  readonly y: number;
  /** Whether Alt still requests partial cross-block text selection. */
  readonly altKey: boolean;
  /** Whether Shift still requests partial cross-block text selection. */
  readonly shiftKey: boolean;
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
 * <EditorView reactEditor={reactEditor}>
 *   <TextSelectionPlugin />
 *   <PageSurface />
 * </EditorView>
 * ```
 */
export function registerTextSelection(reactEditor: ReactEditor): () => void {
  let pointer: PointerSelection | null = null;
  let releaseTimer: number | undefined;
  let suppressClickBlockId: string | undefined;
  let ownsCrossBlockSelection = false;
  let autoScrollFrame: number | undefined;
  let latestPointer: PointerSelectionCoordinates | undefined;

  /**
   * Reads visible page order from the model when roots are virtualized.
   * @param root - Active editor surface.
   * @returns Block IDs in the order selection commands must cover.
   */
  const selectionBlockIds = (root: HTMLElement): string[] => (
    pageWindowFor(root)?.getSelectionBlocks().map((block) => block.id) ?? orderedBlockIds(root)
  );

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
        ? createVisibleStructuralSelection(selectionBlockIds(root), active.anchorPosition.blockId, headPosition.blockId)
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

  /**
   * Resolves and publishes the moving endpoint at current pointer coordinates.
   * @param active - Gesture retaining the fixed endpoint.
   * @param current - Latest viewport coordinates and selection modifiers.
   * @returns Whether the pointer currently identifies a selectable endpoint.
   */
  const updatePointerSelection = (
    active: PointerSelection,
    current: PointerSelectionCoordinates,
  ): boolean => {
    const root = reactEditor.events.getRoot();
    if (!root) return false;
    const pointedBlockId = readBlockIdAtPoint(root, current.x, current.y);
    const head = active.anchor ? readDOMSelectionPoint(root, current.x, current.y) : undefined;
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
    const partialContentlessBlockId = current.shiftKey && current.altKey
      && pointedBlockId !== headPosition?.blockId ? pointedBlockId : undefined;
    const effectiveHeadPosition = partialContentlessBlockId
      ? { blockId: partialContentlessBlockId, offset: 0 }
      : headPosition;
    const crossBlock = (effectiveHeadPosition?.blockId ?? pointedBlockId) !== active.anchorPosition.blockId;
    const wholeBlocks = wantsWholeBlocks(current, Boolean(crossBlock));
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
  };

  /** Stops the frame loop that advances a selection beside a viewport edge. */
  const stopAutoScroll = (): void => {
    const view = reactEditor.events.getRoot()?.ownerDocument.defaultView;
    if (autoScrollFrame !== undefined) view?.cancelAnimationFrame(autoScrollFrame);
    autoScrollFrame = undefined;
  };

  /**
   * Scrolls the page and resolves the selection endpoint under the held pointer.
   *
   * Browsers do not reliably emit another pointermove while native drag
   * scrolling advances the document. Run the same frame loop with and without
   * virtualization so the portable editor selection cannot stop at its first
   * edge hit while the viewport continues moving.
   *
   * @param root - Active page surface containing the pointer selection.
   */
  const scheduleAutoScroll = (root: HTMLElement): void => {
    if (autoScrollFrame !== undefined) return;
    const view = root.ownerDocument.defaultView;
    const scrollElement = root.ownerDocument.scrollingElement;
    if (!view || !scrollElement) return;
    autoScrollFrame = view.requestAnimationFrame(() => {
      autoScrollFrame = undefined;
      const active = pointer;
      const current = latestPointer;
      if (!active || !current) return;
      const threshold = Math.min(96, view.innerHeight * 0.2);
      const distance = current.y < threshold
        ? current.y - threshold
        : current.y > view.innerHeight - threshold
          ? current.y - (view.innerHeight - threshold)
          : 0;
      if (!distance) return;
      const delta = Math.sign(distance) * Math.max(2, Math.ceil(Math.abs(distance) / threshold * 20));
      const before = scrollElement.scrollTop;
      scrollElement.scrollTop += delta;
      updatePointerSelection(active, current);
      if (scrollElement.scrollTop !== before) scheduleAutoScroll(root);
    });
  };

  reactEditor.events.register({
    id: "text-selection.pointer-start",
    type: "pointerdown",
    scope: "block",
  }, ({ raw: event, blockId, root }) => {
      const view = root.ownerDocument.defaultView;
      let handled = false;
      if (event.ctrlKey || event.metaKey) {
        stopAutoScroll();
        latestPointer = undefined;
        if (releaseTimer !== undefined) view?.clearTimeout(releaseTimer);
        pointer = null;
        ownsCrossBlockSelection = false;
      } else if (event.button === 0) {
        stopAutoScroll();
        latestPointer = undefined;
        // Keep the original event target, not only its owning anchor. Nested
        // controls and structural selection receive the same pointerdown;
        // checking only the ancestor would start both gestures at once.
        const target = isElementNode(event.target) ? event.target : null;
        const selectionAnchor = target?.closest<HTMLElement>(BLOCK_SELECTION_ANCHOR_SELECTOR);
        // Three entry paths, because click-to-activate and drag-to-select share
        // this pointerdown and must not steal each other:
        // - Editable anchors always enter so caret drags keep working.
        // - Native buttons seed a drag only. Nothing is published until the
        //   movement threshold, so a click still activates the control; a drag
        //   becomes structural selection and the later click is suppressed.
        // - Remaining structural surface starts selection only when the target
        //   is not an excluded control (inputs, links, drop fields, sortable
        //   rows, `data-prevent-text-editing`). Those keep their own gesture.
        if (target && selectionAnchor && root.contains(selectionAnchor) && (
          selectionAnchor.isContentEditable
          || !isExcludedFromStructuralSelection(target)
        )) {
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
            const lengthOf = (id: string) => reactEditor.blocks.getBlockNode(id)?.content.length ?? 0;
            const ends = item ? resolveSelectionEndpoints(item, lengthOf) : undefined;
            const originId = ends?.anchor.blockId ?? item?.anchorBlockId;
            const wholeBlocks = originId
              ? wantsWholeBlocks(event, originId !== clickedPosition.blockId)
              : false;
            if (originId && wholeBlocks) {
              ownsCrossBlockSelection = true;
              pointer = null;
              const next = createVisibleStructuralSelection(selectionBlockIds(root), originId, clickedPosition.blockId);
              if (next) reactEditor.selection.set(next);
              root.ownerDocument.getSelection()?.removeAllRanges();
              root.focus({ preventScroll: true });
              releaseTimer = view?.setTimeout(() => { ownsCrossBlockSelection = false; });
              handled = true;
            } else if (clicked) {
              const ids = selectionBlockIds(root);
              const originFromBlock = item?.anchorBlockId;
              const originIndex = originFromBlock ? ids.indexOf(originFromBlock) : -1;
              const clickIndex = originFromBlock ? ids.indexOf(clickedPosition.blockId) : -1;
              const originContentLength = originFromBlock
                ? (reactEditor.blocks.getBlockNode(originFromBlock)?.content.length ?? 0)
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
      latestPointer = { x: event.clientX, y: event.clientY, altKey: event.altKey, shiftKey: event.shiftKey };
      const handled = updatePointerSelection(active, latestPointer);
      scheduleAutoScroll(root);
      return handled;
  });

  const stop = (): false => {
      stopAutoScroll();
      latestPointer = undefined;
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
        isExcludedFromStructuralSelection(event.target)
      ) return false;
      const anchor = event.target.closest<HTMLElement>(BLOCK_SELECTION_ANCHOR_SELECTOR);
      if (!anchor || anchor.isContentEditable || !root.contains(anchor)) return false;

      const selection = createVisibleStructuralSelection(selectionBlockIds(root), blockId, blockId);
      if (selection) reactEditor.selection.set(selection);
      if (reactEditor.mode.get() === "edgeless") findEdgelessRuntime(reactEditor)?.deactivate();
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
      } else if (!(reactEditor.mode.get() === "edgeless" && findEdgelessRuntime(reactEditor)?.get().active)) {
        // Losing the browser range keeps a structural selection and clears carets.
        const current = reactEditor.selection.get();
        if (current && !isStructuralSelection(current)) reactEditor.selection.clear();
      }
      return false;
  });

  return () => {
    stopAutoScroll();
    latestPointer = undefined;
    const root = reactEditor.events.getRoot();
    if (releaseTimer !== undefined) {
      root?.ownerDocument.defaultView?.clearTimeout(releaseTimer);
    }
    ownsCrossBlockSelection = false;
    suppressClickBlockId = undefined;
    pointer = null;
  };
}
