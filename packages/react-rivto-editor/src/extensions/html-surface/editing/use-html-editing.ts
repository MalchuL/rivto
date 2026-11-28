/**
 * The "is the source editor open?" flag shared by a widget renderer and its edit slot.
 *
 * The renderer and the slot are separate React trees registered by the
 * extension, so they cannot share React state directly. They read and write
 * this small store instead.
 *
 * @module
 */
import { useCallback, useSyncExternalStore } from "react";
import { useReactPanel } from "../../../hooks/editor/use-react-panel";

/** Editing flags of one extension installation, keyed by panel, widget kind and ID. */
export interface HtmlEditingStore {
  /**
   * Observes one widget's flag. The flag is deleted when its last observer leaves.
   *
   * @param key - Key built by {@link useHtmlEditing}.
   * @param listener - Called when the flag changes.
   * @returns A function that stops observing.
   */
  subscribe(key: string, listener: () => void): () => void;
  /**
   * Reads one widget's flag.
   *
   * @param key - Key built by {@link useHtmlEditing}.
   * @returns True while the widget's source editor is open; false for unknown keys.
   */
  get(key: string): boolean;
  /**
   * Sets one widget's flag and notifies its observers.
   *
   * A key nobody observes is ignored, so a flag cannot outlive its widget.
   *
   * @param key - Key built by {@link useHtmlEditing}.
   * @param active - Whether the source editor is open.
   * @returns Nothing. Observers are notified if the value changed.
   */
  set(key: string, active: boolean): void;
}

/** Props through which the extension hands its editing store to a renderer and its slot. */
export interface HtmlEditingStoreProps {
  /** Editing flags of the extension installation. */
  readonly editingStore: HtmlEditingStore;
}

/**
 * Creates the editing store of one extension installation.
 *
 * A flag exists only while something observes it: it is created by the first
 * subscriber and deleted when the last one leaves. The store itself is garbage
 * once the extension is uninstalled and its components unmount.
 *
 * @returns An empty store.
 */
export function createHtmlEditingStore(): HtmlEditingStore {
  const entries = new Map<string, { active: boolean; listeners: Set<() => void> }>();
  return {
    /**
     * Adds an observer, creating the flag (false) if this is the first one.
     *
     * @param key - Key of the widget.
     * @param listener - Called when the flag changes.
     * @returns A function that removes the observer and, if it was the last, the flag.
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
     * Reads the flag.
     *
     * @param key - Key of the widget.
     * @returns The flag, or false when nobody observes the key.
     */
    get(key) {
      return entries.get(key)?.active ?? false;
    },
    /**
     * Changes the flag of an observed widget.
     *
     * @param key - Key of the widget.
     * @param active - New value.
     * @returns Nothing. Observers are notified if the value changed.
     */
    set(key, active) {
      const entry = entries.get(key);
      if (!entry || entry.active === active) {
        return;
      }
      entry.active = active;
      entry.listeners.forEach((listener) => listener());
    },
  };
}

/**
 * Returns whether a widget's source editor is open, and a setter for it.
 *
 * The flag is keyed by panel ID, widget kind and widget ID:
 * - the panel ID keeps two panels showing the same block independent, so
 *   opening the editor in one panel does not open it in the other;
 * - the kind keeps a block and a canvas element with the same ID apart.
 *
 * @param store - The extension's editing store.
 * @param kind - Whether the widget is a block or a canvas element.
 * @param id - ID of the widget.
 * @returns The current flag and a function that sets it.
 */
export function useHtmlEditing(
  store: HtmlEditingStore,
  kind: "block" | "element",
  id: string,
): readonly [boolean, (next: boolean) => void] {
  const panelId = useReactPanel().id;
  const key = `${panelId}:${kind}:${id}`;
  const subscribe = useCallback(
    (listener: () => void) => store.subscribe(key, listener),
    [store, key],
  );
  const read = useCallback(() => store.get(key), [store, key]);
  const active = useSyncExternalStore(subscribe, read, () => false);
  const setActive = useCallback((next: boolean) => store.set(key, next), [store, key]);
  return [active, setActive];
}
