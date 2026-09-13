/**
 * Renders the sortable status sequence used by TODO storage ordering. The
 * component owns dnd-kit sensors and live transforms while its parent owns
 * persistence, keeping drag mechanics separate from the storage toolbar.
 *
 * @module
 */
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { CSSProperties } from "react";
import type { TodoItemStatus } from "./todo-item";
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
 * Returns an immutable sequence with one status moved over another.
 *
 * @param order - Current controlled status sequence.
 * @param active - Status being moved.
 * @param over - Status reported as the drop target.
 * @param keyboardDelta - Signed vertical keyboard movement used when an
 * absolutely positioned menu leaves `over` pointing at the active row.
 * @returns The original sequence for a no-op, otherwise a reordered copy.
 */
export function reorderTodoStatuses(
  order: readonly TodoItemStatus[],
  active: TodoItemStatus,
  over: TodoItemStatus,
  keyboardDelta = 0,
): readonly TodoItemStatus[] {
  const from = order.indexOf(active);
  let to = order.indexOf(over);
  // An absolutely positioned menu can animate a keyboard move while dnd-kit
  // still reports the active row as `over`; its signed delta is unambiguous.
  if (from === to && keyboardDelta) {
    to = Math.max(0, Math.min(order.length - 1, from + Math.sign(keyboardDelta)));
  }
  return from < 0 || to < 0 || from === to ? order : arrayMove([...order], from, to);
}

/**
 * Renders one row and applies dnd-kit's animated sortable transform.
 *
 * @param props - Status identity and its accessible position metadata.
 * @returns One keyboard- and pointer-sortable button row.
 */
function SortableStatusRow({ status, position, total }: SortableStatusRowProps) {
  const { attributes, isDragging, listeners, setNodeRef, transform, transition } = useSortable({ id: status });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  return (
    <button
      {...attributes}
      {...listeners}
      ref={setNodeRef}
      className={TODO_STATUS_ORDER_ROW_CLASS}
      data-dragging={isDragging ? "true" : undefined}
      type="button"
      role="listitem"
      style={style}
      aria-label={`${TODO_STATUS_LABELS[status]} status order. Position ${position} of ${total}. Press Space to pick up, arrow keys to move, and Space to drop.`}
    >↕ {TODO_STATUS_LABELS[status]}</button>
  );
}

/**
 * Renders a controlled vertical sortable list with pointer and keyboard input.
 *
 * @param props - Controlled sequence and persistence callback.
 * @returns A dnd-kit sortable context containing each status row.
 */
export function TodoStatusOrder({ order, onChange }: TodoStatusOrderProps) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  /**
   * Commits the final dnd-kit position through the parent's persistence callback.
   *
   * @param event - Completed dnd-kit gesture and resolved collision data.
   * @returns Nothing.
   */
  const handleDragEnd = ({ active, activatorEvent, delta, over }: DragEndEvent): void => {
    if (!over) return;
    const keyboardDelta = activatorEvent.type === "keydown" ? delta.y : 0;
    const next = reorderTodoStatuses(
      order,
      active.id as TodoItemStatus,
      over.id as TodoItemStatus,
      keyboardDelta,
    );
    if (next !== order) onChange(next);
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={[...order]} strategy={verticalListSortingStrategy}>
        <div className={TODO_STATUS_ORDER_CLASS} role="list" aria-label="Status order">
          {order.map((status, index) => (
            <SortableStatusRow key={status} status={status} position={index + 1} total={order.length} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
