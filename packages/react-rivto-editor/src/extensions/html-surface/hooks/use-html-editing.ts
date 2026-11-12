/** Shared source editing state for one installed HTML extension. */
import { useCallback, useSyncExternalStore } from "react";

/** State shared by the renderer and slot of an installed extension. */
export interface HtmlEditingStore {
  /**
   * Observes one widget and removes its state when its last observer leaves.
   *
   * @param key - Widget kind and stable ID.
   * @param listener - Called when this widget changes editing state.
   * @returns Unsubscribes the observer.
   */
  subscribe(key: string, listener: () => void): () => void;
  /**
   * Reads whether a widget is editing.
   *
   * @param key - Widget kind and stable ID.
   * @returns True while the source editor is open.
   */
  get(key: string): boolean;
  /**
   * Changes a widget's editing state and notifies its observers.
   *
   * @param key - Widget kind and stable ID.
   * @param active - Whether the source editor is open.
   * @returns Observers have been notified when the value changed.
   */
  set(key: string, active: boolean): void;
}

/**
 * Creates editing state owned by one extension installation.
 *
 * Entries disappear after their last mounted observer unsubscribes; the store
 * itself becomes unreachable when the extension registration is disposed.
 *
 * @returns Independent editing state for the registered components.
 */
export function createHtmlEditingStore(): HtmlEditingStore {
  const entries = new Map<string, { active: boolean; listeners: Set<() => void> }>();
  return {
    /**
     * Observes the widget and releases its entry after its final observer leaves.
     *
     * @param key - Widget kind and ID.
     * @param listener - Called when its editing state changes.
     * @returns Unsubscribes this observer.
     */
    subscribe(key, listener) {
      let entry = entries.get(key);
      if (!entry) {
        entry = { active: false, listeners: new Set() };
        entries.set(key, entry);
      }
      entry.listeners.add(listener);
      return () => {
        entry.listeners.delete(listener);
        if (entry.listeners.size === 0) {
          entries.delete(key);
        }
      };
    },
    /**
     * Reads the current editing flag.
     *
     * @param key - Widget kind and ID.
     * @returns True when an observed widget is being edited.
     */
    get(key) {
      return entries.get(key)?.active ?? false;
    },
    /**
     * Changes the flag for an observed widget.
     *
     * @param key - Widget kind and ID.
     * @param active - New editing state.
     * @returns Its observers are notified if the state changed.
     */
    set(key, active) {
      const entry = entries.get(key);
      if (!entry || entry.active === active) {
        return;
      }
      entry.active = active;
      for (const listener of entry.listeners) {
        listener();
      }
    },
  };
}

/**
 * Reads and updates the source editor state shared by one widget's components.
 *
 * @param store - State owned by the installed extension.
 * @param kind - Separates block and element IDs.
 * @param id - Stable ID of the widget.
 * @returns Whether editing is active and a setter for the current widget.
 */
export function useHtmlEditing(
  store: HtmlEditingStore,
  kind: "block" | "element",
  id: string,
): readonly [boolean, (next: boolean) => void] {
  const key = `${kind}:${id}`;
  const subscribe = useCallback(
    (listener: () => void) => store.subscribe(key, listener),
    [store, key],
  );
  const read = useCallback(() => store.get(key), [store, key]);
  const active = useSyncExternalStore(subscribe, read, () => false);
  const setActive = useCallback((next: boolean) => store.set(key, next), [store, key]);
  return [active, setActive];
}
