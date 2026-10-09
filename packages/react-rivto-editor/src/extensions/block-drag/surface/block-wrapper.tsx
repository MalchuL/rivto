/**
 * Per-block wrappers, drag registrations, indicators, and handle controls for page dragging.
 *
 * The wrapper contributes Rivto's structural feedback around the stable block
 * shell. dnd-kit hooks are mounted lazily and narrowly: a draggable only for
 * the armed block and droppables only while a keyboard gesture is live, so a
 * document with hundreds of blocks never carries broad manager subscriptions.
 *
 * @module
 */
import { closestCenter } from "@dnd-kit/collision";
import { useDraggable, useDroppable } from "@dnd-kit/react";
import { BlockElementRefProvider, type BlockWrapperProps } from "../../../blocks";
import { findParentBlock } from "../../../managers/events/block-dom";
import { useEditorView } from "../../../hooks";
import type { DropAxis } from "../../../views/types";
import {
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { PageDropIndicator } from "../placement/indicator";
import type { DropPlacementStore, PageDragHandle } from "../types";
import { PageDragItemContext, PageDragStateContext } from "../state";
import { blockContainment } from "../utils/containment";

const PAGE_BLOCK_ROW_CLASS = "page-block-row";
const DRAG_CONTAINER_ATTRIBUTE = "data-drag-container";

/**
 * Decorates one BlockTree-owned BlockView with structural drag behavior.
 *
 * The decorator contributes a BlockView ref through context. Its handle and
 * indicator are portalled into that row, preserving the surface DOM contract
 * without rendering a second BlockView.
 *
 * This component is registered through `registerBlockWrapper`; page and
 * edgeless surfaces never import it. The button alone activates the draggable
 * sensor, so editable content retains ordinary caret and selection behavior.
 *
 * Views with a dropAxis and no dropParentTypes mark their shell with
 * `data-drag-container`, enabling full-container handle hover without naming
 * block types in CSS. Structural rows and lanes retain row-only hover. The
 * marker is removed when the view stops qualifying or this wrapper unmounts.
 *
 * @param props - Block snapshot and the next ordered decorator or shared shell.
 * @returns A DOM-free ref provider plus row-portalled drag controls.
 */
export function PageDragBlockWrapper({ block, children }: BlockWrapperProps) {
  const editorView = useEditorView();
  const [blockElement, setBlockElement] = useState<HTMLDivElement | null>(null);
  const row = blockElement?.querySelector<HTMLElement>(`:scope > .${PAGE_BLOCK_ROW_CLASS}`) ?? null;
  const parentId = blockElement ? findParentBlock(blockElement)?.dataset.blockId : undefined;
  const targetView = editorView.views.resolve(block.id);
  const isLayoutRoot = targetView.dropAxis !== undefined && targetView.dropParentTypes === undefined;
  const parentView = parentId ? editorView.views.resolve(parentId) : undefined;
  const parentOutline = parentId ? blockContainment(editorView, parentId)?.childOutline : undefined;
  const axis = parentOutline === "fixed" ? parentView?.dropAxis : undefined;
  const sortable = axis === "vertical" || axis === "horizontal" || axis === "grid";
  const dropNode = sortable || targetView.acceptsDropContainer ? blockElement : row;

  // Layout roots reveal their handle across the whole container. Structural
  // rows and lanes declare dropParentTypes and retain ordinary row hover.
  // Body-drop acceptance is independent: Columns rejects body drops but still
  // needs container hover. Keep this marker owned and cleaned up by dragging.
  useLayoutEffect(() => {
    if (!blockElement || !isLayoutRoot) return;
    blockElement.setAttribute(DRAG_CONTAINER_ATTRIBUTE, "");
    return () => blockElement.removeAttribute(DRAG_CONTAINER_ATTRIBUTE);
  }, [blockElement, isLayoutRoot]);

  return (
    <BlockElementRefProvider elementRef={setBlockElement}>
      <PageDragBlockMechanics
        blockId={block.id}
        blockElement={blockElement}
        row={row}
        dropNode={dropNode}
        sortable={sortable}
        axis={axis}
      >
        {children}
      </PageDragBlockMechanics>
    </BlockElementRefProvider>
  );
}

/**
 * Isolates dnd-kit's broad context updates from the expensive block wrapper.
 *
 * @param props - Stable DOM geometry, block ID, and unchanged rendered subtree.
 * @returns Focused drag registration and visual feedback around the block shell.
 */
function PageDragBlockMechanics({
  blockId,
  blockElement,
  row,
  dropNode,
  sortable,
  axis,
  children,
}: {
  readonly blockId: string;
  readonly blockElement: HTMLDivElement | null;
  readonly row: HTMLElement | null;
  readonly dropNode: HTMLElement | null;
  readonly sortable: boolean;
  readonly axis: DropAxis | undefined;
  readonly children?: ReactNode;
}) {
  const dragState = useContext(PageDragStateContext);
  const subscribePlacement = useCallback(
    (listener: () => void) => dragState.placements.subscribe(blockId, listener),
    [blockId, dragState.placements],
  );
  const getPlacement = useCallback(
    () => dragState.placements.get(blockId),
    [blockId, dragState.placements],
  );
  const indicator = useSyncExternalStore(subscribePlacement, getPlacement, getPlacement) ?? undefined;
  const getDragged = useCallback(
    () => dragState.placements.isDragged(blockId),
    [blockId, dragState.placements],
  );
  const groupedDragging = useSyncExternalStore(subscribePlacement, getDragged, getDragged);
  const getArmed = useCallback(
    () => dragState.placements.isArmed(blockId),
    [blockId, dragState.placements],
  );
  const armed = useSyncExternalStore(subscribePlacement, getArmed, getArmed);
  const getKeyboardDragging = useCallback(
    () => dragState.placements.isKeyboardDragging(),
    [dragState.placements],
  );
  const keyboardDragging = useSyncExternalStore(subscribePlacement, getKeyboardDragging, getKeyboardDragging);
  const itemState = useMemo(() => ({ blockId, placements: dragState.placements }), [blockId, dragState.placements]);
  const previousPosition = useRef<number | undefined>(undefined);

  // Animate committed sibling moves, not pointer motion or scrolling. Offsets
  // stay in the column's layout coordinates and reduced-motion stays instant.
  useLayoutEffect(() => {
    if (!sortable || !blockElement) return;
    const position = axis === "horizontal" ? blockElement.offsetLeft : blockElement.offsetTop;
    const previous = previousPosition.current;
    previousPosition.current = position;
    if (previous !== undefined && previous !== position && !groupedDragging
      && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const animation = blockElement.animate([
        { transform: `translate${axis === "horizontal" ? "X" : "Y"}(${previous - position}px)` },
        { transform: "translate(0)" },
      ], { duration: 180, easing: "cubic-bezier(0.2, 0, 0, 1)" });
      return () => animation.cancel();
    }
  }, [axis, blockElement, groupedDragging, sortable]);

  // Dragging and inside-drop state decorate stable surface elements without
  // moving ownership of their data-block markers into this extension.
  useLayoutEffect(() => {
    if (!blockElement) return;
    if (groupedDragging) blockElement.setAttribute("data-dragging", "true");
    else blockElement.removeAttribute("data-dragging");
    return () => blockElement.removeAttribute("data-dragging");
  }, [blockElement, groupedDragging]);
  useLayoutEffect(() => {
    if (!dropNode) return;
    if (indicator?.kind === "inside") {
      dropNode.setAttribute("data-drop-inside", "true");
    } else {
      dropNode.removeAttribute("data-drop-inside");
    }
    return () => dropNode.removeAttribute("data-drop-inside");
  }, [indicator, dropNode]);

  const indicatorHost = indicator?.kind === "inside" ? dropNode : blockElement;
  const indicatorPortal = indicatorHost && indicator ? createPortal(
    <PageDropIndicator placement={indicator} host={indicatorHost} />,
    indicatorHost,
  ) : null;

  return (
    <PageDragItemContext.Provider value={itemState}>
      {children}
      {indicatorPortal}
      {armed && <PageDragRegistration blockId={blockId} row={row} placements={dragState.placements} />}
      {keyboardDragging && <PageDragKeyboardDropTarget blockId={blockId} dropNode={dropNode} />}
    </PageDragItemContext.Provider>
  );
}

/**
 * Mounts dnd-kit's draggable for only the armed block handle.
 *
 * The row is the source element: the overlay is sized from it and keyboard
 * movement starts at its center, matching the legacy handle-row geometry while
 * keeping a tall parent's children out of the stand-in rectangle. The handle
 * button is attached separately by the slot through {@link PageDragHandle}.
 *
 * @param props - Block ID, layout data, row element, and the shared store.
 * @returns Nothing; the registration lives in the shared store.
 */
function PageDragRegistration({
  blockId,
  row,
  placements,
}: {
  readonly blockId: string;
  readonly row: HTMLElement | null;
  readonly placements: DropPlacementStore;
}) {
  const { handleRef } = useDraggable({ id: blockId, element: row ?? undefined });
  const handle = useMemo<PageDragHandle>(() => ({ handleRef }), [handleRef]);
  useLayoutEffect(() => {
    placements.setDraggable(blockId, handle);
    return () => placements.setDraggable(blockId, null);
  }, [blockId, handle, placements]);
  return null;
}

/**
 * Registers complete row geometry only for the less frequent keyboard gesture.
 *
 * Supplies collision geometry for dnd-kit's keyboard gesture mechanics.
 * The provider resolves the translated source center against the shared layout;
 * the library's nearest-center target does not determine the destination.
 *
 * @param props - Block ID, layout data, and the element whose rectangle is measured.
 * @returns Nothing; the droppable registers with the provider's manager.
 */
function PageDragKeyboardDropTarget({
  blockId,
  dropNode,
}: {
  readonly blockId: string;
  readonly dropNode: HTMLElement | null;
}) {
  useDroppable({
    id: blockId,
    element: dropNode ?? undefined,
    collisionDetector: closestCenter,
  });
  return null;
}
