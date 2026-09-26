/**
 * dnd-kit integration for atomic movement of one block subtree or an eligible
 * sibling-root selection. Surface rendering enters through wrapper slots, so
 * this module owns gesture mechanics without owning recursive traversal.
 *
 * The provider is the only adapter between `@dnd-kit/react` events and Rivto's
 * library-independent placement input. Pointer gestures are hit-tested by
 * Rivto against live viewport rectangles; keyboard gestures use dnd-kit's
 * nearest-center target and translated source rectangle. Both feed
 * `resolveDropPlacement`, and Rivto's view policy plus the guarded
 * `moveBlocks` transaction remain the final authority over every drop.
 *
 * Feedback stays on dnd-kit's default mode on purpose: with a `DragOverlay`
 * mounted the feedback plugin never clones or promotes the real block DOM, and
 * the `none` mode would stop tracking the translated shape the keyboard path
 * depends on.
 *
 * @module
 */
import {
  DragDropProvider,
  DragOverlay,
  type DragDropManager,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/react";
import { KeyboardSensor, PointerActivationConstraints, PointerSensor } from "@dnd-kit/dom";
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
  type DropBlock,
} from "./placement/utils";
import { selectedMoveRoots, type SelectedMoveRoots } from "../built-ins/page/navigation";
import {
  crossDocumentBlockTransfer,
  type CrossDocumentBlockTransferPlacement,
} from "../built-ins/clipboard/cross-document-block-transfer";
import { PageDragPreview } from "./preview/component";
import {
  resolveDropPlacement,
} from "./placement/resolver";
import type {
  DropPlacementInput,
  DropPlacementSource,
  PageDragData,
  PageDropTargetData,
} from "./placement/types";
import { resolveCrossDocumentPageRootPlacement } from "./cross-document/placement";
import { withPointerDropTarget } from "./pointer/target";
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
import { collectSubtreeIds } from "./utils/subtree";
import { PageDragAutoScrollPolicy } from "./surface/auto-scroll";

const PAGE_DRAG_OVERLAY_CLASS = "page-drag-overlay";

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
 * Keeps the outdent indicator on a parent's bottom edge when every direct
 * child is being moved. The canonical destination remains before the next
 * sibling, but letting that sibling own the indicator makes the gesture look
 * like a drop on the next block instead of an outdent from the parent.
 *
 * @param placement - Canonical placement resolved for the current pointer.
 * @param input - Target row approached by the gesture.
 * @param targetChildren - Current direct children of that target row.
 * @param draggedIds - IDs contained by the dragged subtrees.
 * @returns The same placement with parent-owned feedback when required.
 */
function withParentBottomEdgeIndicator(
  placement: DropPlacement,
  input: DropPlacementInput,
  targetChildren: readonly DropBlock[],
  draggedIds: ReadonlySet<string>,
): DropPlacement {
  const useParentBottomEdge =
    // This affordance is a line between siblings, never an inside highlight.
    placement.kind === "between"
    // The pointer approached the bottom of the target, not the top of the next block.
    && placement.gapEdge === "after"
    // The resolved gap starts immediately after the parent row being approached.
    && placement.previousId === input.target.id
    // A following sibling exists, so this is the parent/next-block gap from the report.
    && Boolean(placement.nextId)
    // The target must actually be a parent; an empty ordinary block keeps default feedback.
    && targetChildren.length > 0
    // Every direct child leaves, exposing this parent-level gap for the dragged selection.
    && targetChildren.every(({ id }) => draggedIds.has(id));
  return useParentBottomEdge
    ? { ...placement, indicatorId: input.target.id }
    : placement;
}

/**
 * Adapts the current dnd-kit operation into Rivto's placement input.
 *
 * A live pointer wins: the target is hit-tested natively from the cursor and
 * the source carries no stand-in rectangle. Without a pointer the translated
 * source shape stands in for the cursor and dnd-kit's collision target is the
 * candidate row.
 *
 * @param operation - Source, target, and shape of the running gesture.
 * @param pointer - Live cursor, or null for keyboard movement.
 * @param root - Surface root used for native hit testing.
 * @param reactEditor - Editor whose views describe drop capabilities.
 * @param excludedIds - Blocks inside the dragged subtrees.
 * @param outerEdgeDropZone - Width of each outer-edge sibling-drop zone in viewport pixels.
 * @returns Placement input, or null when no candidate target exists.
 */
function gesturePlacementInput(
  operation: PageDragOperation,
  pointer: PointerCoordinates | null,
  root: HTMLElement | null,
  reactEditor: ReturnType<typeof useReactEditor>,
  excludedIds: ReadonlySet<string>,
  outerEdgeDropZone?: number,
): DropPlacementInput | null {
  const { source, target } = operation;
  if (!source) return null;
  const sourceRect = pointer ? null : operation.shape?.current.boundingRectangle ?? null;
  const placementSource: DropPlacementSource = {
    id: String(source.id),
    data: source.data as PageDragData | undefined,
    rect: sourceRect,
  };
  let input: DropPlacementInput | null = null;
  if (pointer) {
    input = withPointerDropTarget(placementSource, pointer, root, reactEditor, excludedIds, outerEdgeDropZone);
  } else if (sourceRect && target?.shape) {
    input = {
      source: placementSource,
      target: {
        id: String(target.id),
        rect: target.shape.boundingRectangle,
        data: target.data as PageDropTargetData | undefined,
      },
    };
  }
  return input;
}

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
  const { element: root } = useEditorRoot();
  const activeMove = useRef<SelectedMoveRoots | undefined>(undefined);
  const crossDocumentTarget = useRef<{
    controller: CrossDocumentPageRootController;
    placement: CrossDocumentBlockTransferPlacement;
  } | null>(null);
  // ponytail: freeze hierarchy for one short gesture; add incremental remote
  // reconciliation only if concurrent drag-time structure edits become common.
  const dragBlocks = useRef<readonly DropBlock[] | null>(null);
  const draggedSubtreeIds = useRef(new Set<string>());
  const pointerTracker = useRef<PointerTracker | null>(null);
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
    if (!root || reactEditor.mode.get() !== "block") return;
    const controller: CrossDocumentPageRootController = {
      reactEditor,
      root,
      setPlacement: (placement, empty = false) => {
        placements.set(placement);
        if (empty) root.setAttribute("data-drop-empty", "true");
        else root.removeAttribute("data-drop-empty");
      },
      resolvePlacement: (x, y) => resolveCrossDocumentPageRootPlacement(
        reactEditor,
        root,
        x,
        y,
        childDropIndent,
        gapDropZone,
        allowChildPlacement,
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
  }, [allowChildPlacement, childDropIndent, reactEditor, gapDropZone, placements, reactEditor, root]);

  // A gesture abandoned by unmounting still owns a document listener.
  useLayoutEffect(() => () => {
    pointerTracker.current?.dispose();
    pointerTracker.current = null;
  }, []);

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
    activeMove.current = undefined;
    dragBlocks.current = null;
    draggedSubtreeIds.current.clear();
    placements.setKeyboardDragging(false);
    placements.setDragged([]);
    setActiveIds([]);
    placements.set(null);
    clearCrossDocumentTarget();
  };

  const updateCrossDocumentTarget = (): boolean => {
    if (reactEditor.mode.get() !== "block") return false;
    const pointer = pointerTracker.current?.get() ?? null;
    const controller = pointer ? findCrossDocumentPageController(root, pointer) : null;
    let handled = false;
    if (!pointer || !controller) {
      clearCrossDocumentTarget();
    } else {
      if (crossDocumentTarget.current?.controller !== controller) clearCrossDocumentTarget();
      const candidate = controller.resolvePlacement(pointer.x, pointer.y);
      const sourceIds = activeMove.current?.ids ?? [];
      const placement = candidate && (!candidate.targetId
        || controller.reactEditor.views.acceptsDrop(candidate.targetId, sourceIds))
        ? candidate
        : null;
      controller.setPlacement(placement?.indicator ?? null, placement?.targetId === null);
      crossDocumentTarget.current = placement ? {
        controller,
        placement: { targetId: placement.targetId, position: placement.position },
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
    const zoom = reactEditor.mode.get() === "edgeless"
      ? Number(root?.dataset.edgelessZoom) || 1
      : 1;
    const blocks = dragBlocks.current ?? reactEditor.blocks.getBlocks();
    const pointer = pointerTracker.current?.get() ?? null;
    const input = gesturePlacementInput(
      operation, pointer, root, reactEditor, draggedSubtreeIds.current, outerEdgeDropZone,
    );
    let placement = input
      ? resolveDropPlacement(
        input,
        blocks,
        childDropIndent * zoom,
        gapDropZone,
        allowChildPlacement,
        pointer,
      )
      : null;
    if (!placement || !input) return null;
    const targetChildren = reactEditor.blocks.getBlock(input.target.id)?.children ?? [];
    placement = withParentBottomEdgeIndicator(
      placement,
      input,
      targetChildren,
      draggedSubtreeIds.current,
    );
    const target = dropMoveTarget(placement);
    if (target.targetId && draggedSubtreeIds.current.has(target.targetId)) return null;
    const sourceIds = activeMove.current?.ids
      ?? (operation.source ? [String(operation.source.id)] : []);
    return !target.targetId || reactEditor.views.acceptsDrop(target.targetId, sourceIds) ? placement : null;
  };

  /**
   * Publishes feedback for the current operation, preferring a foreign
   * document under the pointer over any local placement.
   *
   * @param operation - Live or snapshotted dnd-kit operation state.
   */
  const updatePlacement = (operation: PageDragOperation): void => {
    if (updateCrossDocumentTarget()) placements.set(null);
    else placements.set(validPlacement(operation));
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
      })
      : null;
    const blocks = reactEditor.blocks.getBlocks();
    const move = selectedMoveRoots(
      blocks,
      reactEditor.selection.get(),
      String(source.id),
      (block) => reactEditor.blockListProps.has("collapse") && block.listProps.collapsed === true,
    );
    const subtreeIds = new Set<string>();
    move.ids.forEach((id) => {
      const block = reactEditor.blocks.getBlock(id);
      if (block) collectSubtreeIds(block, subtreeIds);
    });
    dragBlocks.current = excludeDropSubtrees(blocks, new Set(move.ids));
    draggedSubtreeIds.current = subtreeIds;
    activeMove.current = move;
    const KeyboardEventType = root?.ownerDocument.defaultView?.KeyboardEvent;
    placements.setKeyboardDragging(Boolean(KeyboardEventType && activatorEvent instanceof KeyboardEventType));
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
      void manager.renderer.rendering.then(() => {
        if (manager.dragOperation.status.dragging) updatePlacement(manager.dragOperation);
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
    const placement = event.canceled || crossDocument ? null : validPlacement(event.operation);
    resetGesture();
    if (event.canceled || !move) {
      // Nothing to commit; teardown above already removed every indicator.
    } else if (crossDocument) {
      let transferred = false;
      try {
        crossDocumentBlockTransfer(
          reactEditor,
          crossDocument.controller.reactEditor,
          move.ids,
          crossDocument.placement,
        );
        transferred = true;
      } catch {
        transferred = false;
      }
      if (transferred) {
        reactEditor.selection.clear();
        const firstId = move.ids[0]!;
        const lastId = move.ids.at(-1)!;
        crossDocument.controller.reactEditor.selection.set(
          createStructuralSelection([...move.ids], firstId, lastId),
        );
        requestAnimationFrame(() => crossDocument.controller.root.focus({ preventScroll: true }));
      }
    } else if (placement) {
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
  const overlay = (
    <DragOverlay dropAnimation={null}>
      {activeBlocks.length > 0 && (
        <div
          className={`${PAGE_DRAG_OVERLAY_CLASS} pointer-events-none box-border max-h-[220px] w-[min(520px,70vw)] max-w-[520px] overflow-hidden rounded-md border border-accent-foreground/30 bg-background px-3.5 py-2.5 text-foreground opacity-70 shadow-lg`}
          aria-hidden="true"
        >
          <PageDragPreview blocks={activeBlocks} collapseActive={reactEditor.blockListProps.has("collapse")} />
        </div>
      )}
    </DragOverlay>
  );
  const dragContext = useMemo(() => ({ placements }), [placements]);

  return (
    <PageDragStateContext.Provider value={dragContext}>
      <DragDropProvider
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragMove={handleDragMove}
        onDragEnd={handleDragEnd}
      >
        <PageDragAutoScrollPolicy />
        {children}
        {modalRoot ? createPortal(overlay, modalRoot) : overlay}
      </DragDropProvider>
    </PageDragStateContext.Provider>
  );
}
