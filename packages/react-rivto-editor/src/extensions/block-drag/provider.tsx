import { useContext } from "react";
import { SurfaceContext } from "../../surfaces/surface";
/**
 * dnd-kit integration for atomic movement of one block subtree or an eligible
 * sibling-root selection. Surface rendering enters through wrapper slots, so
 * this module owns gesture mechanics without owning recursive traversal.
 *
 * Pointer and keyboard gestures share one measured layout resolver. Each
 * result identifies the actual destination parent and sibling gap; the same
 * result drives feedback and the eventual guarded move transaction.
 *
 * Pointer gestures use a fixed preview moved directly from the pointer.
 * Keyboard gestures publish a translated source rectangle for dnd-kit's
 * collision detector without loading its DOM feedback plugin.
 *
 * @module
 */
import {
  DragDropProvider,
  type DragDropManager,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/react";
import { Accessibility, AutoScroller, KeyboardSensor, PointerActivationConstraints, PointerSensor } from "@dnd-kit/dom";
import { DOMRectangle } from "@dnd-kit/dom/utilities";
import { createStructuralSelection } from "@chulane/rivto";
import { useEditorRoot, useReactEditor } from "../../hooks";
import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  dropMoveTarget,
  excludeDropSubtrees,
  isCurrentDropDestination,
} from "./placement/utils";
import { selectedMoveRoots, type SelectedMoveRoots } from "../built-ins/page/navigation";
import {
  crossDocumentBlockTransfer,
  type CrossDocumentBlockTransferPlacement,
} from "../built-ins/clipboard/cross-document-block-transfer";
import { PageDragPreview } from "./preview/component";
import { resolveCrossDocumentPageRootPlacement } from "./cross-document/placement";
import { getDropBlocks, resolveSurfaceDrop } from "./pointer/target";
import type { CanonicalDropPlacement } from "./placement/types";
import {
  type DropPlacement,
  type CrossDocumentPageRootController,
  type PageDragExtensionOptions,
  type PointerCoordinates,
  type PointerTracker,
} from "./types";
import {
  createDropPlacementStore,
  PageDragStateContext,
} from "./state";
import {
  CROSS_DOCUMENT_PAGE_ROOT_ATTRIBUTE,
  crossDocumentPageRootControllers,
  findCrossDocumentPageController,
} from "./cross-document/target";
import { trackGesturePointer } from "./pointer/tracker";
import { PageDragAutoScrollPolicy } from "./surface/auto-scroll";

const PAGE_DRAG_OVERLAY_CLASS = "page-drag-overlay";
const DRAG_PLUGINS = [Accessibility, AutoScroller];

/**
 * Stops native text selection while a block handle owns a drag gesture.
 *
 * @param event - Browser selection start event.
 * @returns No value.
 */
function preventDragSelection(event: Event): void {
  event.preventDefault();
}

/**
 * Viewport pixels one arrow press moves the keyboard stand-in rectangle.
 * Mirrors the legacy keyboard coordinate getter so existing row-stepping
 * expectations keep resolving to the same siblings.
 */
const KEYBOARD_STEP = 25;

/** Live or snapshotted dnd-kit operation state consumed by placement. */
type PageDragOperation = DragStartEvent["operation"];

export type { PageDragExtensionOptions } from "./types";

/**
 * Provides structural block drag-and-drop for an outline surface.
 *
 * A selected sibling group moves together when the dragged block belongs to
 * it. Mixed-level selections safely fall back to the handle's single block.
 * Children remain owned by their roots and travel automatically. A block-body drop appends and uses
 * a highlight. A gap drop uses a horizontal line that follows the pointer
 * across every available depth. The resolved move is expressed relative to
 * the preceding block, one of its final ancestors, or its children. Dropping
 * onto the dragged subtree is ignored to prevent an ownership cycle.
 *
 * Grouped movement retains its whole-block selection; single movement replaces
 * any text or mixed selection with the moved block.
 *
 * @param props - Surface subtree and pointer/drop-zone configuration.
 * @returns A dnd-kit provider, shared drag state, source surface, and overlay.
 */
export function PageDragProvider({
  children,
  activationDistance = 4,
  childDropIndent = 24,
  gapDropZone = 8,
  outerEdgeDropZone,
  allowChildPlacement = true,
}: PageDragExtensionOptions) {
  const reactEditor = useReactEditor();
  const mode = useContext(SurfaceContext);
  const { element: root } = useEditorRoot();
  const displayedPlacement = useRef<DropPlacement | null>(null);
  const activeMove = useRef<SelectedMoveRoots | undefined>(undefined);
  const crossDocumentTarget = useRef<{
    controller: CrossDocumentPageRootController;
    placement: CrossDocumentBlockTransferPlacement;
    destination: CanonicalDropPlacement;
  } | null>(null);
  const pointerTracker = useRef<PointerTracker | null>(null);
  /** @returns The live viewport pointer, or null for keyboard gestures. */
  const getDragPointer = useMemo(() => () => pointerTracker.current?.get() ?? null, []);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const previewPosition = useRef<PointerCoordinates | null>(null);
  const keyboardSourceRect = useRef<DOMRectangle | null>(null);
  const stopSelectionGuard = useRef<(() => void) | null>(null);
  const [activeIds, setActiveIds] = useState<string[]>([]);
  const placements = useMemo(createDropPlacementStore, []);
  // A plain sensor array replaces dnd-kit's defaults, so the keyboard sensor
  // is listed explicitly. Constraints are instantiated per activation because
  // each instance owns the controller of one pending gesture.
  const sensors = useMemo(() => [
    PointerSensor.configure({
      activationConstraints: () => [new PointerActivationConstraints.Distance({ value: activationDistance })],
    }),
    KeyboardSensor.configure({ offset: KEYBOARD_STEP }),
  ], [activationDistance]);
  const activeBlocks = activeIds.flatMap((id) => {
    const block = reactEditor.blocks.getBlock(id);
    return block ? [block] : [];
  });

  useLayoutEffect(() => {
    if (!root) return;
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
      if (crossDocumentPageRootControllers.get(root) === controller) {
        crossDocumentPageRootControllers.delete(root);
      }
      root.removeAttribute(CROSS_DOCUMENT_PAGE_ROOT_ATTRIBUTE);
      root.removeAttribute("data-drop-empty");
    };
  }, [allowChildPlacement, childDropIndent, reactEditor, gapDropZone, outerEdgeDropZone, placements, root, mode]);

  // A gesture abandoned by unmounting still owns a document listener.
  useLayoutEffect(() => () => {
    pointerTracker.current?.dispose();
    pointerTracker.current = null;
    stopSelectionGuard.current?.();
    stopSelectionGuard.current = null;
  }, []);

  /**
   * Moves the detached preview without rerendering the block tree.
   *
   * @param point - Preview origin in viewport pixels.
   * @returns No value.
   */
  const positionPreview = (point: PointerCoordinates): void => {
    previewPosition.current = point;
    if (previewRef.current) previewRef.current.style.transform = `translate3d(${point.x}px, ${point.y}px, 0)`;
  };

  const clearCrossDocumentTarget = () => {
    crossDocumentTarget.current?.controller.setPlacement(null);
    crossDocumentTarget.current = null;
  };

  /** Ends pointer tracking once the gesture no longer needs cursor coordinates. */
  const stopPointerTracking = () => {
    pointerTracker.current?.dispose();
    pointerTracker.current = null;
  };

  /**
   * Shared teardown for every way a gesture can finish.
   *
   * Runs before the end handler branches into cancel, local move, or
   * cross-document transfer so no branch can leave feedback behind.
   */
  const resetGesture = () => {
    stopPointerTracking();
    stopSelectionGuard.current?.();
    stopSelectionGuard.current = null;
    previewPosition.current = null;
    keyboardSourceRect.current = null;
    activeMove.current = undefined;
    placements.setKeyboardDragging(false);
    placements.setDragged([]);
    setActiveIds([]);
    placements.set(null);
    displayedPlacement.current = null;
    clearCrossDocumentTarget();
  };

  const updateCrossDocumentTarget = (): boolean => {
    const pointer = pointerTracker.current?.get() ?? null;
    const controller = pointer ? findCrossDocumentPageController(root, pointer, outerEdgeDropZone) : null;
    let handled = false;
    if (!pointer || !controller) {
      clearCrossDocumentTarget();
    } else {
      if (crossDocumentTarget.current?.controller !== controller) clearCrossDocumentTarget();
      const sources = (activeMove.current?.ids ?? []).flatMap((id) => {
        const block = reactEditor.blocks.getBlock(id);
        return block ? [block] : [];
      });
      const placement = controller.resolvePlacement(pointer.x, pointer.y, sources, reactEditor.getDocument().id);
      controller.setPlacement(placement?.indicator ?? null, placement?.targetId === null);
      crossDocumentTarget.current = placement ? {
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
  const validPlacement = (operation: PageDragOperation): DropPlacement | null => {
    const zoom = mode === "edgeless"
      ? Number(root?.dataset.edgelessZoom) || 1
      : 1;
    const blocks = excludeDropSubtrees(getDropBlocks(reactEditor), new Set(activeMove.current?.ids ?? []));
    const livePointer = pointerTracker.current?.get() ?? null;
    const rect = operation.shape?.current.boundingRectangle;
    const pointer = livePointer ?? (rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null);
    if (!pointer) return null;
    const sources = (activeMove.current?.ids ?? []).flatMap((id) => {
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
  const updatePlacement = (operation: PageDragOperation): void => {
    displayedPlacement.current = updateCrossDocumentTarget() ? null : validPlacement(operation);
    placements.set(displayedPlacement.current);
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
  const handleDragStart = ({ operation, nativeEvent }: DragStartEvent, manager: DragDropManager) => {
    const source = operation.source;
    if (!source) return;
    clearCrossDocumentTarget();
    stopPointerTracking();
    const activatorEvent = nativeEvent ?? operation.activatorEvent;
    // Scrolling slides rows under a stationary cursor; dnd-kit only recomputes
    // collisions, and pointer drags register no droppables, so retarget here.
    pointerTracker.current = activatorEvent
      ? trackGesturePointer(activatorEvent, () => {
        if (manager.dragOperation.status.dragging) updatePlacement(manager.dragOperation);
      }, (point) => positionPreview({ x: point.x + 12, y: point.y + 12 }))
      : null;
    const pointer = pointerTracker.current?.get();
    const sourceRect = source.element?.getBoundingClientRect();
    if (pointer) positionPreview({ x: pointer.x + 12, y: pointer.y + 12 });
    else if (sourceRect) positionPreview({ x: sourceRect.left, y: sourceRect.top });
    const ownerDocument = root?.ownerDocument;
    if (ownerDocument) {
      const clearSelection = () => {
        const selection = ownerDocument.getSelection();
        if (selection?.rangeCount) selection.removeAllRanges();
      };
      clearSelection();
      ownerDocument.addEventListener("selectstart", preventDragSelection, true);
      ownerDocument.addEventListener("selectionchange", clearSelection, true);
      stopSelectionGuard.current = () => {
        ownerDocument.removeEventListener("selectstart", preventDragSelection, true);
        ownerDocument.removeEventListener("selectionchange", clearSelection, true);
      };
    }
    const blocks = getDropBlocks(reactEditor);
    const move = selectedMoveRoots(
      blocks,
      reactEditor.selection.get(),
      String(source.id),
      (block) => reactEditor.blockListProps.has("collapse") && block.listProps.collapsed === true,
    );
    activeMove.current = move;
    const KeyboardEventType = root?.ownerDocument.defaultView?.KeyboardEvent;
    const keyboardDragging = Boolean(KeyboardEventType && activatorEvent instanceof KeyboardEventType);
    if (keyboardDragging && source.element) {
      keyboardSourceRect.current = new DOMRectangle(source.element);
      manager.dragOperation.shape = keyboardSourceRect.current;
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
  const handleDragMove = (_event: unknown, manager: DragDropManager) => {
    if (pointerTracker.current) {
      updatePlacement(manager.dragOperation);
    } else {
      // dnd-kit queues its position update after dispatching dragmove. Attach
      // the rendering continuation in a microtask so it cannot read the old
      // position when the renderer's promise is already resolved.
      queueMicrotask(() => {
        void manager.renderer.rendering.then(() => {
          if (manager.dragOperation.status.dragging) {
            const sourceRect = keyboardSourceRect.current;
            const { x, y } = manager.dragOperation.position.delta;
            if (sourceRect) manager.dragOperation.shape = sourceRect.translate(x, y);
            const rect = manager.dragOperation.shape?.current.boundingRectangle;
            if (rect) positionPreview({ x: rect.left, y: rect.top });
            void manager.renderer.rendering.then(() => {
              if (manager.dragOperation.status.dragging) updatePlacement(manager.dragOperation);
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
  const handleDragEnd = (event: DragEndEvent) => {
    const move = activeMove.current;
    const crossDocument = crossDocumentTarget.current;
    const placement = event.canceled || crossDocument ? null : displayedPlacement.current;
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
    resetGesture();
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

  // Native modal dialogs occupy the top layer; previews must join that layer.
  const modalRoot = root?.querySelector("dialog:modal");
  const overlayHost = modalRoot ?? root?.ownerDocument.body;
  const overlay = activeBlocks.length > 0 && overlayHost ? createPortal(
    <div
      ref={previewRef}
      className={`${PAGE_DRAG_OVERLAY_CLASS} pointer-events-none box-border max-h-[220px] w-[min(520px,70vw)] max-w-[520px] overflow-hidden rounded-md border border-accent-foreground/30 bg-background px-3.5 py-2.5 text-foreground opacity-70 shadow-lg`}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        zIndex: 2147483647,
        transform: `translate3d(${previewPosition.current?.x ?? 0}px, ${previewPosition.current?.y ?? 0}px, 0)`,
        willChange: "transform",
      }}
      aria-hidden="true"
    >
      <PageDragPreview blocks={activeBlocks} collapseActive={reactEditor.blockListProps.has("collapse")} />
    </div>,
    overlayHost,
  ) : null;
  const dragContext = useMemo(() => ({ placements }), [placements]);

  return (
    <PageDragStateContext.Provider value={dragContext}>
      <DragDropProvider
        sensors={sensors}
        plugins={DRAG_PLUGINS}
        onDragStart={handleDragStart}
        onDragMove={handleDragMove}
        onDragEnd={handleDragEnd}
      >
        <PageDragAutoScrollPolicy getPointer={getDragPointer} />
        {children}
        {overlay}
      </DragDropProvider>
    </PageDragStateContext.Provider>
  );
}
