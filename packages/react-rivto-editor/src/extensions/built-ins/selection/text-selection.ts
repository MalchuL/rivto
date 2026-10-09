import type { EditorEvent } from "../../../managers/events/editor-event";
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
  EDITOR_CONTROL_SELECTOR,
  BLOCK_SELECTION_ANCHOR_SELECTOR,
  PREVENT_TEXT_EDITING_SELECTOR,
} from "../../../constants";
import type { ReactEditor } from "../../../types";
import { isElementNode } from "../../../managers/events/dom-nodes";
import { findEdgelessRuntime } from "./edgeless-runtime";
import { getPageVirtualizationControllerForElement } from "../../../surfaces/page/page-virtualization-controller";
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
  `${BLOCK_CONTENT_SELECTOR}, ${PREVENT_TEXT_EDITING_SELECTOR}, ${EDITOR_CONTROL_SELECTOR}`;

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
  /** API and DOM root that own this gesture, independent of later focus changes. */
  readonly editor: ReactEditor;
  readonly root: HTMLElement;
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
 * <EditorView reactEditor={reactEditor} documentId={documentId}>
 *   <TextSelectionPlugin />
 *   <PageSurface />
 * </EditorView>
 * ```
 */
export function registerTextSelection(reactEditor: ReactEditor): () => void {
  return new TextSelectionController(reactEditor).setup();
}

/** Owns pointer selection, delayed range restoration, and auto-scroll for one editor. */
class TextSelectionController {
  private pointer: PointerSelection | null = null;
  private timerView: Window | null = null;
  private scrollView: Window | null = null;
  private releaseTimer: number | undefined;
  private suppressClickBlockId: string | undefined;
  private ownsCrossBlockSelection = false;
  private autoScrollFrame: number | undefined;
  private latestPointer: PointerSelectionCoordinates | undefined;

  /** @param reactEditor - Editor whose delegated events and selection this controller uses. */
  constructor(private readonly reactEditor: ReactEditor) {}


  /**
   * Reads visible page order from the model when roots are virtualized.
   * @param root - Active editor surface.
   * @returns Block IDs in the order selection commands must cover.
   */
  private selectionBlockIds = (root: HTMLElement): string[] => (
    getPageVirtualizationControllerForElement(root)?.getSelectionBlocks().map((block) => block.id) ?? orderedBlockIds(root)
  );

  /** Publishes the synthetic endpoint chosen for a cross-host gesture. */
  private publish = (
    active: PointerSelection,
    head: DOMSelectionPoint | undefined,
    headPosition: EditorPosition,
    forceWholeBlocks = false,
  ): void => {
      const root = active.root;
      active.crossBlock = headPosition.blockId !== active.anchorPosition.blockId;
      active.head = head;
      active.wholeBlocks = forceWholeBlocks;
      active.selection = active.wholeBlocks
        ? createVisibleStructuralSelection(this.selectionBlockIds(root), active.anchorPosition.blockId, headPosition.blockId)
        : createDOMSelection(root, active.anchorPosition, headPosition);
      if (!active.selection) return;

      active.editor.selection.set(active.selection);
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
  private updatePointerSelection = (
    active: PointerSelection,
    current: PointerSelectionCoordinates,
  ): boolean => {
    const root = active.root;
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
    // Structural selection follows the owning block under the pointer. A
    // contentless body can make caret lookup fall back to the anchor or a
    // neighboring editable block, which must not decide the range boundary.
    const crossBlock = (pointedBlockId ?? effectiveHeadPosition?.blockId) !== active.anchorPosition.blockId;
    const wholeBlocks = wantsWholeBlocks(current, Boolean(crossBlock));
    let handled = false;
    if (wholeBlocks && pointedBlockId && pointedBlockId !== headPosition?.blockId && (
      pointedBlockId !== active.anchorPosition.blockId || !active.anchor
    )) {
      this.ownsCrossBlockSelection = true;
      if (!active.anchor) this.suppressClickBlockId = active.anchorPosition.blockId;
      this.publish(active, undefined, { blockId: pointedBlockId, offset: 0 }, true);
      handled = true;
    } else if (head && effectiveHeadPosition) {
      const sameBlock = effectiveHeadPosition.blockId === active.anchorPosition.blockId;
      if (!(sameBlock && !this.ownsCrossBlockSelection)) {
        this.ownsCrossBlockSelection = true;
        this.publish(active, head, effectiveHeadPosition, wholeBlocks);
        handled = true;
      }
    } else if (pointedBlockId && (
      pointedBlockId !== active.anchorPosition.blockId || !active.anchor
    )) {
      // Contentless structural blocks have no caret geometry, so their stable
      // BlockView marker advances a whole-block range instead.
      this.ownsCrossBlockSelection = true;
      if (!active.anchor) this.suppressClickBlockId = active.anchorPosition.blockId;
      this.publish(active, undefined, { blockId: pointedBlockId, offset: 0 }, true);
      handled = true;
    }
    return handled;
  };

  /** Stops the frame loop that advances a selection beside a viewport edge. */
  private stopAutoScroll = (): void => {
    const view = this.scrollView;
    if (this.autoScrollFrame !== undefined) view?.cancelAnimationFrame(this.autoScrollFrame);
    this.autoScrollFrame = undefined;
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
  private scheduleAutoScroll = (root: HTMLElement): void => {
    if (this.autoScrollFrame !== undefined) return;
    const view = root.ownerDocument.defaultView;
    const scrollElement = root.ownerDocument.scrollingElement;
    if (!view || !scrollElement) return;
    this.scrollView = view;
    this.autoScrollFrame = view.requestAnimationFrame(() => {
      this.autoScrollFrame = undefined;
      const active = this.pointer;
      const current = this.latestPointer;
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
      this.updatePointerSelection(active, current);
      if (scrollElement.scrollTop !== before) this.scheduleAutoScroll(root);
    });
  };

  private stop = (): false => {
      this.stopAutoScroll();
      this.latestPointer = undefined;
      const completed = this.pointer;
      const root = completed?.root;
      this.pointer = null;
      if (!root || !completed?.selection || (!completed.wholeBlocks && !completed.head) ||
        (!completed.crossBlock && !this.ownsCrossBlockSelection)) return false;

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
      this.timerView = root.ownerDocument.defaultView;
      this.releaseTimer = this.timerView?.setTimeout(() => {
        if (completed.wholeBlocks) {
          root.ownerDocument.getSelection()?.removeAllRanges();
        } else {
          setNativeSelection(completed.anchor!, completed.head!);
        }
        this.suppressClickBlockId = undefined;
        this.ownsCrossBlockSelection = false;
      });
      return false;
  };

  private onPointerDown = ({ reactEditor, raw: event, blockId, root }: EditorEvent<"surface", "pointerdown">) => {
    const view = root.ownerDocument.defaultView;
    let handled = false;
    if (event.ctrlKey || event.metaKey) {
      this.stopAutoScroll();
      this.latestPointer = undefined;
      if (this.releaseTimer !== undefined) view?.clearTimeout(this.releaseTimer);
      this.pointer = null;
      this.ownsCrossBlockSelection = false;
    } else if (event.button === 0) {
      this.stopAutoScroll();
      this.latestPointer = undefined;
      // Keep the original event target, not only its owning anchor. Nested
      // controls and structural selection receive the same pointerdown;
      // checking only the ancestor would start both gestures at once.
      const target = isElementNode(event.target) ? event.target : null;
      const selectionAnchor = target?.closest<HTMLElement>(BLOCK_SELECTION_ANCHOR_SELECTOR);
      // Three entry paths, because click-to-activate and drag-to-select share
      // this pointerdown and must not steal each other:
      // - Editable anchors always enter so caret drags keep working.
      // - Controls explicitly marked as selection anchors seed a drag only.
      //   Nothing is published until the movement threshold, so a click still
      //   activates the control; a drag becomes structural selection and the
      //   later click is suppressed. Marking a containing region does not opt
      //   its controls in, and `data-prevent-text-editing` always opts them out.
      // - Remaining structural surface starts selection only when the target
      //   is not an excluded control (inputs, links, drop fields, sortable
      //   rows, `data-prevent-text-editing`). Those keep their own gesture.
      if (target && selectionAnchor && root.contains(selectionAnchor) && (
        selectionAnchor.isContentEditable
        || (target.closest(STRUCTURAL_SELECTION_EXCLUDED_TARGET_SELECTOR) === selectionAnchor
          && !target.closest(PREVENT_TEXT_EDITING_SELECTOR))
        || !isExcludedFromStructuralSelection(target)
      )) {
        if (this.releaseTimer !== undefined) view?.clearTimeout(this.releaseTimer);
        this.ownsCrossBlockSelection = false;

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
            this.ownsCrossBlockSelection = true;
            this.pointer = null;
            const next = createVisibleStructuralSelection(this.selectionBlockIds(root), originId, clickedPosition.blockId);
            if (next) reactEditor.selection.set(next);
            root.ownerDocument.getSelection()?.removeAllRanges();
            root.focus({ preventScroll: true });
            this.releaseTimer = view?.setTimeout(() => { this.ownsCrossBlockSelection = false; });
            handled = true;
          } else if (clicked) {
            const ids = this.selectionBlockIds(root);
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
              this.ownsCrossBlockSelection = true;
              const active: PointerSelection = {
                editor: reactEditor, root,
                startX: event.clientX,
                startY: event.clientY,
                anchor,
                anchorPosition,
                crossBlock: false,
                wholeBlocks: false,
              };
              this.pointer = active;
              this.publish(active, clicked, clickedPosition);
              handled = true;
            }
          }
        }

        if (!handled) {
          if (!textTarget && blockId) {
            // `readDOMSelectionPoint` intentionally falls back to the nearest
            // editable host. Explicit structural anchors bypass that fallback so
            // they retain their own block ID before movement begins.
            this.pointer = {
              editor: reactEditor, root,
              startX: event.clientX,
              startY: event.clientY,
              anchorPosition: { blockId, offset: 0 },
              crossBlock: false,
              wholeBlocks: false,
            };
          } else {
            const anchor = clicked;
            const anchorPosition = anchor && readDOMPointPosition(root, anchor);
            this.pointer = anchor && anchorPosition ? {
              editor: reactEditor, root,
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
  };

  private onPointerMove = ({ raw: event, root }: EditorEvent<"window", "pointermove">) => {
    const active = this.pointer;
    if (!active || Math.hypot(event.clientX - active.startX, event.clientY - active.startY) < 3) return false;
    this.latestPointer = { x: event.clientX, y: event.clientY, altKey: event.altKey, shiftKey: event.shiftKey };
    const handled = this.updatePointerSelection(active, this.latestPointer);
    this.scheduleAutoScroll(root);
    return handled;
  };

  private onClick = ({ reactEditor, raw: event, blockId, root, mode }: EditorEvent<"surface", "click">) => {
    if (!blockId) return false;
    if (blockId === this.suppressClickBlockId) {
      // A control may still receive `click` after its pointer gesture became a
      // structural drag. Claim that click so controls respecting
      // `defaultPrevented` do not perform their normal action.
      this.suppressClickBlockId = undefined;
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

    const selection = createVisibleStructuralSelection(this.selectionBlockIds(root), blockId, blockId);
    if (selection) reactEditor.selection.set(selection);
    if (mode === "edgeless") findEdgelessRuntime(reactEditor)?.deactivate();
    root.ownerDocument.getSelection()?.removeAllRanges();
    root.focus({ preventScroll: true });
    return true;
  };

  private onBeforeInput = ({ reactEditor }: EditorEvent<"surface", "beforeinput">) => {
    // Native selectionchange may arrive after typing and an immediate undo.
    // Capture the live caret before input mutates the document so history can
    // restore editable focus even when that asynchronous event has not arrived.
    const selection = reactEditor.selection.readDOM();
    if (selection) reactEditor.selection.set(selection);
    return false;
  };

  private onSelectionChange = ({ reactEditor, mode }: EditorEvent<"document", "selectionchange">) => {
    if (this.ownsCrossBlockSelection) return false;
    // Canvas gestures own element selection. A retained native text range
    // must not replace it while a transform preview is waiting to commit.
    if (mode === "edgeless" && findEdgelessRuntime(reactEditor)?.get().active) return false;
    // Cut, paste, and reparenting can report the old native range before the
    // next frame restores the command's caret. New input cancels that frame.
    if (reactEditor.selection.hasPendingSelectionCallback) return false;
    const selection = reactEditor.selection.readDOM();
    if (selection) {
      reactEditor.selection.set(selection);
    } else if (!(mode === "edgeless" && findEdgelessRuntime(reactEditor)?.get().active)) {
      // Losing the browser range keeps a structural selection and clears carets.
      const current = reactEditor.selection.get();
      // Reparenting may detach native endpoints before the scheduled restore.
      // Keep that model selection; explicit core clears still invalidate it.
      if (current && !isStructuralSelection(current) && !reactEditor.selection.hasPendingSelectionCallback) {
        reactEditor.selection.clear();
      }
    }
    return false;
  };

  /** Registers selection behavior and returns cleanup for the active gesture and timers. */
  setup(): () => void {
    this.reactEditor.events.register({
      id: "text-selection.pointer-start",
      type: "pointerdown",
      scope: "block",
    }, this.onPointerDown);

    this.reactEditor.events.register({
      id: "text-selection.pointer-move",
      type: "pointermove",
      target: "window",
      capture: true,
      passive: false,
    }, this.onPointerMove);
    this.reactEditor.events.register({
      id: "text-selection.pointer-end",
      type: "pointerup",
      target: "window",
      capture: true,
    }, this.stop);
    this.reactEditor.events.register({
      id: "text-selection.pointer-cancel",
      type: "pointercancel",
      target: "window",
      capture: true,
    }, this.stop);

    this.reactEditor.events.register({
      id: "text-selection.suppress-anchor-click",
      type: "click",
      capture: true,
      scope: "block",
    }, this.onClick);

    this.reactEditor.events.register({
      id: "text-selection.before-input",
      type: "beforeinput",
      scope: "content",
    }, this.onBeforeInput);

    this.reactEditor.events.register({
      id: "text-selection.selection-change",
      type: "selectionchange",
      target: "document",
    }, this.onSelectionChange);

    return () => {
      this.stopAutoScroll();
      this.latestPointer = undefined;
      if (this.releaseTimer !== undefined) {
        this.timerView?.clearTimeout(this.releaseTimer);
      }
      this.ownsCrossBlockSelection = false;
      this.suppressClickBlockId = undefined;
      this.pointer = null;
    };
  }
}
