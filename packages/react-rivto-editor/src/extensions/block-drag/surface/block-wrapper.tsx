/**
 * Per-block wrappers, drag registrations, indicators, and handle controls for page dragging.
 *
 * @module
 */
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { BlockElementRefProvider, type BlockWrapperProps } from "../../../blocks";
import { useReactEditor } from "../../../hooks";
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
import type { DropPlacementStore, PageDragData } from "../types";
import { PageDragItemContext, PageDragStateContext } from "../state";
import { blockContainment } from "../utils/containment";

const PAGE_BLOCK_ROW_CLASS = "page-block-row";
const PAGE_BLOCK_SELECTOR = "[data-block-id]";

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
 * @param props - Block snapshot and the next ordered decorator or shared shell.
 * @returns A DOM-free ref provider plus row-portalled drag controls.
 */
export function PageDragBlockWrapper({ block, children }: BlockWrapperProps) {
  const reactEditor = useReactEditor();
  const [blockElement, setBlockElement] = useState<HTMLDivElement | null>(null);
  const row = blockElement?.querySelector<HTMLElement>(`:scope > .${PAGE_BLOCK_ROW_CLASS}`) ?? null;
  const parentId = blockElement?.parentElement?.closest<HTMLElement>(PAGE_BLOCK_SELECTOR)?.dataset.blockId;
  const targetView = reactEditor.views.resolve(block.id);
  const parentView = parentId ? reactEditor.views.resolve(parentId) : undefined;
  const parentOutline = parentId ? blockContainment(reactEditor, parentId)?.childOutline : undefined;
  const axis = parentOutline === "fixed" ? parentView?.dropAxis : undefined;
  const sortable = axis === "vertical" || axis === "horizontal" || axis === "grid";
  const data: PageDragData = {
    sortChildren: axis,
    targetDropPlacement: targetView.dropPlacement,
    parentDropPlacement: parentView?.dropPlacement,
  };
  const dropNode = sortable || targetView.acceptsDropContainer ? blockElement : row;

  return (
    <BlockElementRefProvider elementRef={setBlockElement}>
      <PageDragBlockMechanics
        blockId={block.id}
        blockElement={blockElement}
        row={row}
        dropNode={dropNode}
        sortable={sortable}
        axis={axis}
        data={data}
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
  data,
  children,
}: {
  readonly blockId: string;
  readonly blockElement: HTMLDivElement | null;
  readonly row: HTMLElement | null;
  readonly dropNode: HTMLElement | null;
  readonly sortable: boolean;
  readonly axis: DropAxis | undefined;
  readonly data: PageDragData;
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
    <PageDropIndicator placement={indicator} host={indicatorHost} row={row} />,
    indicatorHost,
  ) : null;

  return (
    <PageDragItemContext.Provider value={itemState}>
      {children}
      {indicatorPortal}
      {armed && <PageDragRegistration blockId={blockId} data={data} placements={dragState.placements} />}
      {keyboardDragging && <PageDragKeyboardDropTarget blockId={blockId} data={data} dropNode={dropNode} />}
    </PageDragItemContext.Provider>
  );
}

/** Mounts dnd-kit's broad-context hook for only the armed block handle. */
function PageDragRegistration({
  blockId,
  data,
  placements,
}: {
  readonly blockId: string;
  readonly data: PageDragData;
  readonly placements: DropPlacementStore;
}) {
  const draggable = useDraggable({ id: blockId, data });
  useLayoutEffect(() => {
    placements.setDraggable(blockId, draggable);
    return () => placements.setDraggable(blockId, null);
  }, [blockId, draggable, placements]);
  return null;
}

/** Registers complete row geometry only for the less frequent keyboard gesture. */
function PageDragKeyboardDropTarget({
  blockId,
  data,
  dropNode,
}: {
  readonly blockId: string;
  readonly data: PageDragData;
  readonly dropNode: HTMLElement | null;
}) {
  const droppable = useDroppable({ id: blockId, data });
  useLayoutEffect(() => {
    droppable.setNodeRef(dropNode);
    return () => droppable.setNodeRef(null);
  }, [droppable.setNodeRef, dropNode]);
  return null;
}
