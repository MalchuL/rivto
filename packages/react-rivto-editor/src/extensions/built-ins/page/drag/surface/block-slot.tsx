/** Accessible drag-handle slot for one page block row. */
import { useCallback, useContext, useSyncExternalStore } from "react";
import type { BlockSlotProps } from "../../../../../managers";
import { PageDragItemContext } from "../state";

const PAGE_DRAG_HANDLE_CLASS = "page-drag-handle";

/**
 * Renders the visible drag activator supplied by the owning drag wrapper.
 *
 * @param props - Current block slot context used for the accessible label.
 * @returns Drag button, or nothing when the mechanical wrapper is absent.
 */
export function PageDragBlockSlot({ block }: BlockSlotProps) {
  const item = useContext(PageDragItemContext);
  const subscribe = useCallback(
    (listener: () => void) => item?.placements.subscribe(block.id, listener) ?? (() => undefined),
    [block.id, item],
  );
  const getDraggable = useCallback(
    () => item?.placements.getDraggable(block.id) ?? null,
    [block.id, item],
  );
  const draggable = useSyncExternalStore(subscribe, getDraggable, getDraggable);
  const arm = useCallback(() => item?.placements.arm(block.id), [block.id, item]);
  if (!item) return null;
  return (
    <button
      {...(draggable?.attributes ?? {})}
      {...(draggable?.listeners ?? {})}
      ref={draggable?.setNodeRef}
      type="button"
      className={PAGE_DRAG_HANDLE_CLASS}
      aria-label={`Move block: ${block.content || block.type}`}
      contentEditable={false}
      onPointerEnter={arm}
      onFocus={arm}
    >
      ⋮⋮
    </button>
  );
}
