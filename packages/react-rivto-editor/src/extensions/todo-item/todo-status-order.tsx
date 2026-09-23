/**
 * Renders the sortable status sequence used by TODO storage ordering. The
 * component owns the dnd-kit provider and per-row sortable registration while
 * its parent owns persistence, keeping drag mechanics separate from the
 * storage toolbar.
 *
 * Sorting is optimistic: `@dnd-kit/react/sortable` moves rows while the
 * gesture is in flight and reports the final source index on drag end. The
 * controlled `order` prop is only updated through {@link reorderTodoStatuses},
 * which stays free of dnd-kit event shapes so persistence can be unit tested.
 *
 * @module
 */
import { DragDropProvider, type DragEndEvent } from "@dnd-kit/react";
import { isSortable, useSortable } from "@dnd-kit/react/sortable";
import { arrayMove } from "@dnd-kit/helpers";
import { GripVerticalIcon } from "lucide-react";
import type { TodoItemStatus } from "./todo-item";
import { Button } from "../../components/ui/button";
import { TODO_STATUS_ORDER_CLASS, TODO_STATUS_ORDER_ROW_CLASS } from "./todo-item-classes";

/** Human-readable labels shared by ordering and status filters. */
export const TODO_STATUS_LABELS: Readonly<Record<TodoItemStatus, string>> = {
  todo: "Todo",
  doing: "Doing",
  done: "Done",
};

/** Properties for the controlled sortable status sequence. */
export interface TodoStatusOrderProps {
  readonly order: readonly TodoItemStatus[];
  readonly onChange: (order: readonly TodoItemStatus[]) => void;
}

interface SortableStatusRowProps {
  readonly status: TodoItemStatus;
  readonly position: number;
  readonly total: number;
}

/**
 * Returns an immutable sequence with one status moved to a new index.
 *
 * @param order - Current controlled status sequence.
 * @param from - Index of the status being moved within `order`.
 * @param to - Index the status should occupy after the move.
 * @returns The original sequence for a no-op or out-of-range request,
 * otherwise a reordered copy.
 */
export function reorderTodoStatuses(
  order: readonly TodoItemStatus[],
  from: number,
  to: number,
): readonly TodoItemStatus[] {
  const inRange = (index: number): boolean => Number.isInteger(index) && index >= 0 && index < order.length;
  return !inRange(from) || !inRange(to) || from === to ? order : arrayMove([...order], from, to);
}

/**
 * Renders one row registered as an optimistic sortable item.
 *
 * @param props - Status identity and its accessible position metadata.
 * @returns One keyboard- and pointer-sortable button row.
 */
function SortableStatusRow({ status, position, total }: SortableStatusRowProps) {
  const { ref, isDragging } = useSortable({ id: status, index: position - 1 });
  return (
    <Button
      ref={ref}
      variant="secondary"
      size="sm"
      className={TODO_STATUS_ORDER_ROW_CLASS}
      data-dragging={isDragging ? "true" : undefined}
      type="button"
      role="listitem"
      aria-label={`${TODO_STATUS_LABELS[status]} status order. Position ${position} of ${total}. Press Space to pick up, arrow keys to move, and Space to drop.`}
    ><GripVerticalIcon aria-hidden="true" />{TODO_STATUS_LABELS[status]}</Button>
  );
}

/**
 * Renders a controlled vertical sortable list with pointer and keyboard input.
 *
 * @param props - Controlled sequence and persistence callback.
 * @returns A dnd-kit provider containing each sortable status row.
 */
export function TodoStatusOrder({ order, onChange }: TodoStatusOrderProps) {
  /**
   * Commits the optimistic sortable index through the parent's persistence callback.
   *
   * @param event - Completed dnd-kit gesture carrying the source sortable.
   * @returns Nothing.
   */
  const handleDragEnd = (event: DragEndEvent): void => {
    const { source } = event.operation;
    // A canceled gesture has already been rolled back by the optimistic
    // sorting plugin, so the controlled order must not be touched.
    if (event.canceled || !isSortable(source)) return;
    const from = order.indexOf(source.id as TodoItemStatus);
    const next = reorderTodoStatuses(order, from, source.index);
    if (next !== order) onChange(next);
  };

  return (
    <DragDropProvider onDragEnd={handleDragEnd}>
      <div className={TODO_STATUS_ORDER_CLASS} role="list" aria-label="Status order">
        {order.map((status, index) => (
          <SortableStatusRow key={status} status={status} position={index + 1} total={order.length} />
        ))}
      </div>
    </DragDropProvider>
  );
}
