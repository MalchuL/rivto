/**
 * Shared edit flag for one HTML block or element.
 *
 * The preview and the slot button render in different React trees, so the flag
 * lives outside either component. Each id is independent.
 *
 * @module
 */
import { useCallback, useSyncExternalStore } from "react";

const listeners = new Set<() => void>();
const editing = new Set<string>();

/**
 * Subscribes to edit-flag changes for every HTML widget.
 *
 * @param listener - Called after an id starts or stops editing.
 * @returns Removes the listener.
 */
function subscribeHtmlEditing(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Reports whether one widget's source editor is open.
 *
 * @param id - Block or element id.
 * @returns True while that widget is being edited.
 */
function isHtmlEditing(id: string): boolean {
  return editing.has(id);
}

/**
 * Opens or closes the source editor for one widget.
 *
 * A repeated value does not notify subscribers.
 *
 * @param id - Block or element id.
 * @param next - True to show the source editor.
 * @returns Nothing. Subscribers see the new flag.
 */
export function setHtmlEditing(id: string, next: boolean): void {
  if (editing.has(id) === next) {
    return;
  }
  if (next) {
    editing.add(id);
  } else {
    editing.delete(id);
  }
  for (const listener of listeners) {
    listener();
  }
}

/**
 * Reads and updates the edit flag for one widget.
 *
 * @param id - Block or element id. A changed id follows the new widget.
 * @returns Whether the editor is open, and a setter for that id.
 */
export function useHtmlEditing(id: string): readonly [boolean, (next: boolean) => void] {
  const active = useSyncExternalStore(
    subscribeHtmlEditing,
    () => isHtmlEditing(id),
    () => false,
  );
  const setActive = useCallback((next: boolean) => setHtmlEditing(id, next), [id]);
  return [active, setActive];
}
