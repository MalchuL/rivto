/**
 * Accessible drag-handle slot for one page block row.
 *
 * The button is the only sensor activator. dnd-kit binds pointer and keyboard
 * listeners through the handle ref supplied by the armed registration, and its
 * accessibility plugin decorates the same element with role description,
 * description, and pressed state, so no legacy attribute spreading remains.
 * Reveal-on-hover geometry lives in `block-drag.css` because it depends on
 * ancestor row and container state.
 *
 * @module
 */
import { useCallback, useContext, useSyncExternalStore } from "react";
import { GripVerticalIcon } from "lucide-react";
import type { BlockSlotProps } from "../../../managers";
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
      ref={draggable?.handleRef}
      type="button"
      className={`${PAGE_DRAG_HANDLE_CLASS} inline-flex items-center justify-center`}
      aria-label={`Move block: ${block.content || block.type}`}
      contentEditable={false}
      onPointerEnter={arm}
      onFocus={arm}
    >
      {/* The button must stay the hit target so hit testing and dnd-kit see one activator. */}
      <GripVerticalIcon aria-hidden="true" className="pointer-events-none size-4" />
    </button>
  );
}
