import type { DropLayoutOptions } from "./placement/resolver";
import type { DragDropManager, DragEndEvent, DragStartEvent } from "@dnd-kit/react";
import { DOMRectangle } from "@dnd-kit/dom/utilities";
import { createStructuralSelection, type EditorMode } from "@chulane/rivto";
import type { ReactEditor } from "../../types";
import { dropMoveTarget, excludeDropSubtrees, isCurrentDropDestination } from "./placement/utils";
import { selectedMoveRoots, type SelectedMoveRoots } from "../built-ins/page/navigation";
import { crossDocumentBlockTransfer, type CrossDocumentBlockTransferPlacement } from "../built-ins/clipboard/cross-document-block-transfer";
import { resolveCrossDocumentPageRootPlacement } from "./cross-document/placement";
import { getDropBlocks, resolveSurfaceDrop } from "./pointer/target";
import type { CanonicalDropPlacement } from "./placement/types";
import type { DropPlacement, DropPlacementStore, CrossDocumentPageRootController, PointerCoordinates, PointerTracker } from "./types";
import { CROSS_DOCUMENT_PAGE_ROOT_ATTRIBUTE, crossDocumentPageRootControllers, findCrossDocumentPageController } from "./cross-document/target";
import { trackGesturePointer } from "./pointer/tracker";

/**
 * Stops native text selection while a block handle owns a drag gesture.
 *
 * @param event - Browser selection start event.
 * @returns No value.
 */
function preventDragSelection(event: Event): void {
  event.preventDefault();
}

/** Live or snapshotted dnd-kit operation state consumed by placement. */
type PageDragOperation = DragStartEvent["operation"];

/** Owns one view's block drag state, placement, preview, and commit. */
export class PageDragController {
  private displayedPlacement: DropPlacement | null = null;
  private activeMove: SelectedMoveRoots | undefined;
  private crossDocumentTarget: {
    controller: CrossDocumentPageRootController;
    placement: CrossDocumentBlockTransferPlacement;
    destination: CanonicalDropPlacement;
  } | null = null;
  private pointerTracker: PointerTracker | null = null;
  private keyboardSourceRect: DOMRectangle | null = null;
  private stopSelectionGuard: (() => void) | null = null;
  private disposed = false;
  /** Preview node supplied by React; pointer updates change its transform directly. */
  previewElement: HTMLDivElement | null = null;
  /** Latest preview origin in viewport pixels, retained before the portal mounts. */
  previewPosition: PointerCoordinates | null = null;

  /**
   * @param reactEditor - Source view's document-bound API.
   * @param root - Source surface, or null before mounting.
   * @param mode - Rendered surface used to interpret zoom.
   * @param placements - Existing per-row store for feedback and sensor state.
   * @param setActiveIds - Updates the React preview's source blocks.
   * @param options - Existing placement rules shared by pointer and keyboard drags.
   * @param options.childDropIndent - Horizontal viewport pixels per requested outline depth before zoom.
   * @param options.gapDropZone - Viewport pixels reserved for sibling gaps.
   * @param options.outerEdgeDropZone - Optional outer edge width for nested containers.
   * @param options.allowChildPlacement - Whether ordinary rows accept child drops.
   */
  constructor(
    private readonly reactEditor: ReactEditor,
    private readonly root: HTMLElement | null,
    private readonly mode: EditorMode,
    private readonly placements: DropPlacementStore,
    private readonly setActiveIds: (ids: string[]) => void,
    private readonly options: DropLayoutOptions,
  ) {}

  /** @returns The live viewport pointer, or null for keyboard gestures. */
  getDragPointer = (): PointerCoordinates | null => this.pointerTracker?.get() ?? null;

  /** Registers this surface for cross-document drops; cleanup also cancels its active gesture. */
  mount(): () => void {
    const { reactEditor, root, placements } = this;
    const { childDropIndent, gapDropZone, allowChildPlacement, outerEdgeDropZone } = this.options;
    this.disposed = false;
    if (!root) return () => this.destroy();
    const controller: CrossDocumentPageRootController = {
      reactEditor,
      root,
      setPlacement: (placement, empty = false) => {
        placements.set(placement);
        if (empty) root.setAttribute("data-drop-empty", "true");
        else root.removeAttribute("data-drop-empty");
      },
      resolvePlacement: (x, y, sources, sourceDocumentId) => resolveCrossDocumentPageRootPlacement(
        reactEditor,
        root,
        x,
        y,
        childDropIndent * (Number(root.dataset.edgelessZoom) || 1),
        gapDropZone,
        allowChildPlacement,
        sources,
        outerEdgeDropZone,
        sourceDocumentId,
      ),
    };
    crossDocumentPageRootControllers.set(root, controller);
    root.setAttribute(CROSS_DOCUMENT_PAGE_ROOT_ATTRIBUTE, "true");
    return () => {
      this.destroy();
      if (crossDocumentPageRootControllers.get(root) === controller) {
        crossDocumentPageRootControllers.delete(root);
      }
      root.removeAttribute(CROSS_DOCUMENT_PAGE_ROOT_ATTRIBUTE);
      root.removeAttribute("data-drop-empty");
    };
  }

  /** Releases gesture listeners and feedback when its view or configuration is removed. */
  private destroy(): void {
    this.disposed = true;
    this.resetGesture();
    this.previewElement = null;
  }

  /**
   * Moves the detached preview without rerendering the block tree.
   *
   * @param point - Preview origin in viewport pixels.
   * @returns No value.
   */
  private positionPreview = (point: PointerCoordinates): void => {
    this.previewPosition = point;
    if (this.previewElement) this.previewElement.style.transform = `translate3d(${point.x}px, ${point.y}px, 0)`;
  };

  private clearCrossDocumentTarget = () => {
    this.crossDocumentTarget?.controller.setPlacement(null);
    this.crossDocumentTarget = null;
  };

  /** Ends pointer tracking once the gesture no longer needs cursor coordinates. */
  private stopPointerTracking = () => {
    this.pointerTracker?.dispose();
    this.pointerTracker = null;
  };

  /**
   * Shared teardown for every way a gesture can finish.
   *
   * Runs before the end handler branches into cancel, local move, or
   * cross-document transfer so no branch can leave feedback behind.
   */
  private resetGesture = () => {
    const { placements, setActiveIds } = this;
    this.stopPointerTracking();
    this.stopSelectionGuard?.();
    this.stopSelectionGuard = null;
    this.previewPosition = null;
    this.keyboardSourceRect = null;
    this.activeMove = undefined;
    placements.setKeyboardDragging(false);
    placements.setDragged([]);
    setActiveIds([]);
    placements.set(null);
    this.displayedPlacement = null;
    this.clearCrossDocumentTarget();
  };

  private updateCrossDocumentTarget = (): boolean => {
    const { reactEditor, root } = this;
    const { outerEdgeDropZone } = this.options;
    const pointer = this.pointerTracker?.get() ?? null;
    const controller = pointer ? findCrossDocumentPageController(root, pointer, outerEdgeDropZone) : null;
    let handled = false;
    if (!pointer || !controller) {
      this.clearCrossDocumentTarget();
    } else {
      if (this.crossDocumentTarget?.controller !== controller) this.clearCrossDocumentTarget();
      const sources = (this.activeMove?.ids ?? []).flatMap((id) => {
        const block = reactEditor.blocks.getBlock(id);
        return block ? [block] : [];
      });
      const placement = controller.resolvePlacement(pointer.x, pointer.y, sources, reactEditor.getDocument().id);
      controller.setPlacement(placement?.indicator ?? null, placement?.targetId === null);
      this.crossDocumentTarget = placement ? {
        controller,
        placement: { targetId: placement.targetId, position: placement.position },
        destination: placement.indicator ?? { kind: "between", parentId: null, previousId: null, nextId: null, depth: 0 },
      } : null;
      handled = true;
    }
    return handled;
  };

  /**
   * Resolves the placement for the current operation, or null when the drop
   * would land inside a moved subtree or on a target the views reject.
   *
   * @param operation - Live or snapshotted dnd-kit operation state.
   * @returns Accepted placement, or null when the gesture has no valid drop.
   */
  private validPlacement = (operation: PageDragOperation): DropPlacement | null => {
    const { reactEditor, root, mode } = this;
    const { childDropIndent, gapDropZone, outerEdgeDropZone, allowChildPlacement } = this.options;
    const zoom = mode === "edgeless"
      ? Number(root?.dataset.edgelessZoom) || 1
      : 1;
    const blocks = excludeDropSubtrees(getDropBlocks(reactEditor), new Set(this.activeMove?.ids ?? []));
    const livePointer = this.pointerTracker?.get() ?? null;
    const rect = operation.shape?.current.boundingRectangle;
    const pointer = livePointer ?? (rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null);
    if (!pointer) return null;
    const sources = (this.activeMove?.ids ?? []).flatMap((id) => {
      const block = reactEditor.blocks.getBlock(id);
      return block ? [block] : [];
    });
    return resolveSurfaceDrop(root, reactEditor, sources, blocks, pointer, {
      childDropIndent: childDropIndent * zoom, gapDropZone, allowChildPlacement,
      outerEdgeDropZone, keyboard: !livePointer,
    });
  };

  /**
   * Publishes feedback for the current operation, preferring a foreign
   * document under the pointer over any local placement.
   *
   * @param operation - Live or snapshotted dnd-kit operation state.
   */
  private updatePlacement = (operation: PageDragOperation): void => {
    const { placements } = this;
    this.displayedPlacement = this.updateCrossDocumentTarget() ? null : this.validPlacement(operation);
    placements.set(this.displayedPlacement);
  };

  /**
   * Freezes the eligible move roots when activation begins.
   *
   * Selection can otherwise change while the pointer is moving. Capturing the
   * roots once keeps the preview and final atomic move consistent.
   *
   * @param event - dnd-kit start event containing the handle's block ID.
   * @param manager - Manager whose live operation is re-read after scrolling.
   */
  handleDragStart = ({ operation, nativeEvent }: DragStartEvent, manager: DragDropManager) => {
    const { reactEditor, root, placements, setActiveIds } = this;
    const source = operation.source;
    if (!source) return;
    this.clearCrossDocumentTarget();
    this.stopPointerTracking();
    const activatorEvent = nativeEvent ?? operation.activatorEvent;
    // Scrolling slides rows under a stationary cursor; dnd-kit only recomputes
    // collisions, and pointer drags register no droppables, so retarget here.
    this.pointerTracker = activatorEvent
      ? trackGesturePointer(activatorEvent, () => {
        if (!this.disposed && manager.dragOperation.status.dragging) this.updatePlacement(manager.dragOperation);
      }, (point) => this.positionPreview({ x: point.x + 12, y: point.y + 12 }))
      : null;
    const pointer = this.pointerTracker?.get();
    const sourceRect = source.element?.getBoundingClientRect();
    if (pointer) this.positionPreview({ x: pointer.x + 12, y: pointer.y + 12 });
    else if (sourceRect) this.positionPreview({ x: sourceRect.left, y: sourceRect.top });
    const ownerDocument = root?.ownerDocument;
    if (ownerDocument) {
      const clearSelection = () => {
        const selection = ownerDocument.getSelection();
        if (selection?.rangeCount) selection.removeAllRanges();
      };
      clearSelection();
      ownerDocument.addEventListener("selectstart", preventDragSelection, true);
      ownerDocument.addEventListener("selectionchange", clearSelection, true);
      this.stopSelectionGuard = () => {
        ownerDocument.removeEventListener("selectstart", preventDragSelection, true);
        ownerDocument.removeEventListener("selectionchange", clearSelection, true);
      };
    }
    const blocks = getDropBlocks(reactEditor);
    const move = selectedMoveRoots(
      blocks,
      reactEditor.selection.get(),
      String(source.id),
      (block) => !reactEditor.blockListProps.childrenVisible(block),
    );
    this.activeMove = move;
    const KeyboardEventType = root?.ownerDocument.defaultView?.KeyboardEvent;
    const keyboardDragging = Boolean(KeyboardEventType && activatorEvent instanceof KeyboardEventType);
    if (keyboardDragging && source.element) {
      this.keyboardSourceRect = new DOMRectangle(source.element);
      manager.dragOperation.shape = this.keyboardSourceRect;
    }
    placements.setKeyboardDragging(keyboardDragging);
    placements.setDragged(move.ids);
    setActiveIds(move.ids);
  };

  /**
   * Publishes feedback for one movement step.
   *
   * dnd-kit dispatches `dragmove` before committing the new position, and
   * keyboard targets and the stand-in rectangle are derived from that
   * position. The keyboard path therefore waits for the provider's render
   * pass and re-reads the live operation; the pointer path already has the
   * cursor and resolves immediately.
   *
   * @param manager - Manager owning the live operation.
   */
  handleDragMove = (_event: unknown, manager: DragDropManager) => {
    if (this.pointerTracker) {
      this.updatePlacement(manager.dragOperation);
    } else {
      // dnd-kit queues its position update after dispatching dragmove. Attach
      // the rendering continuation in a microtask so it cannot read the old
      // position when the renderer's promise is already resolved.
      queueMicrotask(() => {
        void manager.renderer.rendering.then(() => {
          if (!this.disposed && manager.dragOperation.status.dragging) {
            const sourceRect = this.keyboardSourceRect;
            const { x, y } = manager.dragOperation.position.delta;
            if (sourceRect) manager.dragOperation.shape = sourceRect.translate(x, y);
            const rect = manager.dragOperation.shape?.current.boundingRectangle;
            if (rect) this.positionPreview({ x: rect.left, y: rect.top });
            void manager.renderer.rendering.then(() => {
              if (!this.disposed && manager.dragOperation.status.dragging) this.updatePlacement(manager.dragOperation);
            });
          }
        });
      });
    }
  };

  /**
   * Commits the last valid structural destination and reconciles selection.
   *
   * Cancellation arrives on the same event; a canceled gesture never commits
   * the last valid placement.
   *
   * @param event - Final operation state and cancellation flag supplied by dnd-kit.
   */
  handleDragEnd = (event: DragEndEvent) => {
    const { reactEditor, root } = this;
    const move = this.activeMove;
    const crossDocument = this.crossDocumentTarget;
    const placement = event.canceled || crossDocument ? null : this.displayedPlacement;
    const sources = (move?.ids ?? []).flatMap((id) => {
      const block = reactEditor.blocks.getBlock(id);
      return block ? [block] : [];
    });
    const valid = placement && sources.length === move?.ids.length
      && reactEditor.views.acceptsDrop(placement, sources)
      && isCurrentDropDestination(excludeDropSubtrees(getDropBlocks(reactEditor), new Set(move.ids)), placement);
    const validCrossDocument = crossDocument && sources.length === move?.ids.length
      && crossDocument.controller.reactEditor.views.acceptsDrop(crossDocument.destination, sources)
      && isCurrentDropDestination(excludeDropSubtrees(
        getDropBlocks(crossDocument.controller.reactEditor),
        new Set(crossDocument.controller.reactEditor.getDocument() === reactEditor.getDocument() ? move.ids : []),
      ), crossDocument.destination);
    this.resetGesture();
    if (event.canceled || !move) {
      // Nothing to commit; teardown above already removed every indicator.
    } else if (crossDocument && validCrossDocument) {
      let transferred = false;
      try {
        const destination = crossDocument.controller;
        const destinationDocument = destination.reactEditor.getDocument();
        if (destinationDocument === reactEditor.getDocument()) {
          reactEditor.blocks.moveBlocks(move.ids, crossDocument.placement.targetId, crossDocument.placement.position);
        } else {
          crossDocumentBlockTransfer(reactEditor, destination.reactEditor, move.ids, crossDocument.placement);
        }
        transferred = true;
      } catch {
        transferred = false;
      }
      if (transferred) {
        reactEditor.selection.clear();
        const firstId = move.ids[0]!;
        const lastId = move.ids.at(-1)!;
        crossDocument.controller.reactEditor.selection.set(createStructuralSelection([...move.ids], firstId, lastId));
        requestAnimationFrame(() => crossDocument.controller.root.focus({ preventScroll: true }));
      }
    } else if (placement && valid) {
      const { targetId, position } = dropMoveTarget(placement);
      // Persisted parent constraints can reject a structural destination.
      // Refuse the drop instead of leaving an uncaught gesture error.
      try {
        reactEditor.blocks.moveBlocks(move.ids, targetId, position);
        const selection = move.grouped && move.selection
          ? move.selection
          : createStructuralSelection([move.ids[0]!]);
        reactEditor.selection.set(selection);
        requestAnimationFrame(() => root?.focus({ preventScroll: true }));
      } catch {
        requestAnimationFrame(() => root?.focus({ preventScroll: true }));
      }
    }
  };

}
