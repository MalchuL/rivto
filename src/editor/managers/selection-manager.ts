import type { Unsubscribe } from "../../store/crdt-doc";
import type { EditorSelection } from "../editor/types";

/**
 * Owns the editor's local text selection and publishes explicit changes.
 *
 * A selection keeps its direction: `anchor` is where the gesture began and
 * `head` is where it ended. Equal positions are collapsed. Different block
 * IDs describe a cross-block selection. Offsets are UTF-16 string offsets,
 * matching browser DOM selection APIs. The editor validates positions before
 * calling this manager; the manager deliberately has no document dependency.
 */
export class SelectionManager {
  private value: EditorSelection | null = null;
  private readonly listeners = new Set<() => void>();

  /** Creates a manager with no active selection. */
  constructor() {}

  /**
   * Returns a detached copy of the current local selection.
   *
   * @returns Directed selection, or `null` when nothing is selected.
   */
  get(): EditorSelection | null {
    return this.value ? {
      anchor: { ...this.value.anchor },
      head: { ...this.value.head },
    } : null;
  }

  /**
   * Replaces local selection state and notifies every subscriber once.
   *
   * The value is copied so callers cannot mutate manager state without a
   * notification. Document existence and offset validation belong to EditorCore.
   *
   * @param selection - Valid directed selection supplied by the editor boundary.
   */
  set(selection: EditorSelection): void {
    this.value = { anchor: { ...selection.anchor }, head: { ...selection.head } };
    this.notify();
  }

  /** Clears the local selection and notifies subscribers when it changed. */
  clear(): void {
    if (!this.value) return;
    this.value = null;
    this.notify();
  }

  /**
   * Subscribes to local selection changes.
   *
   * @param listener - Callback invoked after set or an effective clear.
   * @returns Function that removes this listener.
   */
  subscribe(listener: () => void): Unsubscribe {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Invokes a stable snapshot of subscribers after state has changed. */
  private notify(): void {
    [...this.listeners].forEach((listener) => listener());
  }
}
