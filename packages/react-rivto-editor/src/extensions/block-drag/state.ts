/**
 * Focused external state stores and React contexts for page block dragging.
 *
 * The store is library-neutral: it holds Rivto placements, armed and dragged
 * IDs, and the handle registration a slot needs to activate a draggable, so
 * per-row subscribers never observe dnd-kit's broad manager state.
 *
 * @module
 */
import { createContext } from "react";
import type {
  DropPlacement,
  DropPlacementStore,
  PageDragHandle,
  PageDragItemState,
  PageDragState,
} from "./types";

/** Tests semantic placement equality so pointer jitter inside one zone is free. */
function sameDropPlacement(left: DropPlacement | null, right: DropPlacement | null): boolean {
  return left === right || Boolean(left && right
    && left.kind === right.kind
    && left.indicatorId === right.indicatorId
    && left.parentId === right.parentId
    && (left.kind === "inside" || (right.kind === "between"
      && left.previousId === right.previousId
      && left.nextId === right.nextId
      && left.depth === right.depth))
    && left.layoutAxis === right.layoutAxis
    && left.childDropIndent === right.childDropIndent
    && left.gapEdge === right.gapEdge
    && left.gapPointer?.x === right.gapPointer?.x
    && left.gapPointer?.y === right.gapPointer?.y);
}

/**
 * Creates a placement store whose updates notify only affected rows.
 *
 * @returns Fresh gesture placement store.
 */
export function createDropPlacementStore(): DropPlacementStore {
  let current: DropPlacement | null = null;
  let dragged = new Set<string>();
  let armedId: string | undefined;
  let keyboardDragging = false;
  const draggables = new Map<string, PageDragHandle>();
  const listeners = new Map<string, Set<() => void>>();
  const emit = (ids: ReadonlySet<string | undefined>): void => ids.forEach((id) => {
    if (id) [...(listeners.get(id) ?? [])].forEach((listener) => listener());
  });
  return {
    get: (id) => current?.indicatorId === id ? current : null,
    subscribe: (id, listener) => {
      let rowListeners = listeners.get(id);
      if (!rowListeners) {
        rowListeners = new Set();
        listeners.set(id, rowListeners);
      }
      rowListeners.add(listener);
      return () => {
        rowListeners!.delete(listener);
        if (!rowListeners!.size) listeners.delete(id);
      };
    },
    isDragged: (id) => dragged.has(id),
    isArmed: (id) => armedId === id,
    arm: (id) => {
      if (dragged.size || armedId === id) return;
      const previous = armedId;
      armedId = id;
      emit(new Set([previous, id]));
    },
    getDraggable: (id) => draggables.get(id) ?? null,
    setDraggable: (id, value) => {
      const previous = draggables.get(id) ?? null;
      if (previous === value) return;
      if (value) draggables.set(id, value);
      else draggables.delete(id);
      emit(new Set([id]));
    },
    isKeyboardDragging: () => keyboardDragging,
    setKeyboardDragging: (active) => {
      if (keyboardDragging === active) return;
      keyboardDragging = active;
      emit(new Set(listeners.keys()));
    },
    setDragged: (ids) => {
      const next = new Set(ids);
      const changed = new Set<string>([...dragged, ...next].filter((id) => dragged.has(id) !== next.has(id)));
      dragged = next;
      emit(changed);
    },
    set: (placement) => {
      if (sameDropPlacement(current, placement)) return;
      const changedIds = new Set([current?.indicatorId, placement?.indicatorId]);
      current = placement;
      emit(changedIds);
    },
  };
}

/** Provider-level drag state consumed by every block wrapper. */
export const PageDragStateContext = createContext<PageDragState>({
  placements: createDropPlacementStore(),
});

/** Per-block drag registration consumed by its handle slot. */
export const PageDragItemContext = createContext<PageDragItemState | null>(null);
