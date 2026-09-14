/**
 * dnd-kit integration for atomic movement of one block subtree or an eligible
 * sibling-root selection. Surface rendering enters through wrapper slots, so
 * this module owns gesture mechanics without owning recursive traversal.
 *
 * @module
 */
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { createStructuralSelection } from "@chulane/rivto";
import { useEditor, useEditorRoot, useReactEditor } from "../../hooks";
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
import { resolveCrossDocumentPageRootPlacement } from "./cross-document/placement";
import { withPointerDropTarget } from "./pointer/target";
import {
  type DropPlacement,
  type CrossDocumentPageRootController,
  type PageDragExtensionOptions,
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
import {
  canPageDragAutoScroll,
  trackGesturePointer,
} from "./pointer/tracker";
import { PAGE_DRAG_SURFACE_ID, pageDragCollisionDetection } from "./surface/collision";
import { collectSubtreeIds } from "./utils/subtree";
import { PageDragSurfaceDropTarget } from "./surface/drop-target";

const PAGE_DRAG_OVERLAY_CLASS = "page-drag-overlay";

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
  allowChildPlacement = true,
}: PageDragExtensionOptions) {
  const editor = useEditor();
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
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: activationDistance } }),
    useSensor(KeyboardSensor),
  );
  const activeBlocks = activeIds.flatMap((id) => {
    const block = editor.blocks.getBlock(id);
    return block ? [block] : [];
  });

  useLayoutEffect(() => {
    if (!root || editor.mode.get() !== "block") return;
    const controller: CrossDocumentPageRootController = {
      editor,
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
  }, [allowChildPlacement, childDropIndent, editor, gapDropZone, placements, reactEditor, root]);

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

  const updateCrossDocumentTarget = (): boolean => {
    if (editor.mode.get() !== "block") return false;
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

  /** Removes feedback for targets owned by any currently moved subtree. */
  const validPlacement = (event: DragMoveEvent): DropPlacement | null => {
    const zoom = editor.mode.get() === "edgeless"
      ? Number(root?.dataset.edgelessZoom) || 1
      : 1;
    const blocks = dragBlocks.current ?? editor.blocks.getBlocks();
    const pointer = pointerTracker.current?.get() ?? null;
    const targetedEvent = pointer
      ? withPointerDropTarget(event, pointer, root, reactEditor, draggedSubtreeIds.current)
      : event.over?.id !== PAGE_DRAG_SURFACE_ID ? event : null;
    const placement = targetedEvent
      ? resolveDropPlacement(
        targetedEvent,
        blocks,
        childDropIndent * zoom,
        gapDropZone,
        allowChildPlacement,
        pointer,
      )
      : null;
    if (!placement) return null;
    const target = dropMoveTarget(placement);
    if (target.targetId && draggedSubtreeIds.current.has(target.targetId)) return null;
    const sourceIds = activeMove.current?.ids ?? [String(event.active.id)];
    return !target.targetId || reactEditor.views.acceptsDrop(target.targetId, sourceIds) ? placement : null;
  };
  /**
   * Freezes the eligible move roots when activation begins.
   *
   * Selection can otherwise change while the pointer is moving. Capturing the
   * roots once keeps the preview and final atomic move consistent.
   *
   * @param event - dnd-kit start event containing the handle's block ID.
   */
  const handleDragStart = ({ active, activatorEvent }: DragStartEvent) => {
    clearCrossDocumentTarget();
    stopPointerTracking();
    pointerTracker.current = trackGesturePointer(activatorEvent);
    const blocks = editor.blocks.getBlocks();
    const move = selectedMoveRoots(
      blocks,
      editor.selection.get(),
      String(active.id),
      (block) => reactEditor.blocks.hasListProps("collapse") && block.listProps.collapsed === true,
    );
    const subtreeIds = new Set<string>();
    move.ids.forEach((id) => {
      const block = editor.blocks.getBlock(id);
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
   * Commits the last valid structural destination and reconciles selection.
   *
   * @param event - Final pointer geometry and target supplied by dnd-kit.
   */
  const handleDragEnd = (event: DragEndEvent) => {
    const move = activeMove.current;
    const crossDocument = crossDocumentTarget.current;
    const placement = crossDocument ? null : validPlacement(event);
    stopPointerTracking();
    activeMove.current = undefined;
    dragBlocks.current = null;
    draggedSubtreeIds.current.clear();
    placements.setKeyboardDragging(false);
    placements.setDragged([]);
    setActiveIds([]);
    placements.set(null);
    clearCrossDocumentTarget();
    if (crossDocument && move) {
      let transferred = false;
      try {
        crossDocumentBlockTransfer(
          editor,
          crossDocument.controller.editor,
          move.ids,
          crossDocument.placement,
        );
        transferred = true;
      } catch {
        transferred = false;
      }
      if (transferred) {
        editor.selection.clear();
        const firstId = move.ids[0]!;
        const lastId = move.ids.at(-1)!;
        crossDocument.controller.editor.selection.set(
          createStructuralSelection([...move.ids], firstId, lastId),
        );
        requestAnimationFrame(() => crossDocument.controller.root.focus({ preventScroll: true }));
      }
    } else if (placement && move) {
      const { targetId, position } = dropMoveTarget(placement);
      // Persisted parent constraints can reject a structural destination.
      // Refuse the drop instead of leaving an uncaught gesture error.
      try {
        editor.blocks.moveBlocks(move.ids, targetId, position);
        const selection = move.grouped && move.selection
          ? move.selection
          : createStructuralSelection([move.ids[0]!]);
        editor.selection.set(selection);
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
        <div className={PAGE_DRAG_OVERLAY_CLASS} aria-hidden="true">
          <PageDragPreview blocks={activeBlocks} collapseActive={reactEditor.blocks.hasListProps("collapse")} />
        </div>
      )}
    </DragOverlay>
  );
  const dragContext = useMemo(() => ({ placements }), [placements]);

  return (
    <PageDragStateContext.Provider value={dragContext}>
      <DndContext
        sensors={sensors}
        collisionDetection={pageDragCollisionDetection}
        autoScroll={{ canScroll: canPageDragAutoScroll }}
        onDragStart={handleDragStart}
        onDragMove={(event) => {
          if (updateCrossDocumentTarget()) placements.set(null);
          else placements.set(validPlacement(event));
        }}
        onDragCancel={() => {
          stopPointerTracking();
          activeMove.current = undefined;
          dragBlocks.current = null;
          draggedSubtreeIds.current.clear();
          placements.setKeyboardDragging(false);
          placements.setDragged([]);
          setActiveIds([]);
          placements.set(null);
          clearCrossDocumentTarget();
        }}
        onDragEnd={handleDragEnd}
      >
        <PageDragSurfaceDropTarget root={root} />
        {children}
        {modalRoot ? createPortal(overlay, modalRoot) : overlay}
      </DndContext>
    </PageDragStateContext.Provider>
  );
}
