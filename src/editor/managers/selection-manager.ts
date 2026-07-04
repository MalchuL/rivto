import type { Unsubscribe } from "../../store/crdt-doc";
import type { EditorSelection } from "../editor/types";

/**
 * Owns detached local text, block, or edgeless selection state.
 *
 * Selection is editor-session state, never collaborative document content.
 * This manager deliberately has no document dependency: EditorRuntime validates
 * IDs, UTF-16 offsets, endpoints, and mode compatibility before calling `set`.
 */
export class SelectionManager {
  private value: EditorSelection | null = null;
  private readonly listeners = new Set<() => void>();

  /**
   * Returns a detached selection value.
   *
   * Nested positions and block ID arrays are copied so consumers cannot mutate
   * manager state without producing a subscription notification.
   */
  get(): EditorSelection | null {
    if (!this.value) return null;
    if (this.value.type === "text") return {
      type: "text", anchor: { ...this.value.anchor }, head: { ...this.value.head },
    };
    if (this.value.type === "block") return { ...this.value, blockIds: [...this.value.blockIds] };
    return { type: "edgeless", blockIds: [...this.value.blockIds] };
  }

  /**
   * Replaces selection with a detached copy and notifies subscribers.
   *
   * Text anchor/head direction is preserved. Clipboard normalization may sort
   * it later for range operations, but gesture direction belongs here.
   *
   * @param selection - Runtime-validated local selection.
   */
  set(selection: EditorSelection): void {
    this.value = selection.type === "text"
      ? { type: "text", anchor: { ...selection.anchor }, head: { ...selection.head } }
      : { ...selection, blockIds: [...selection.blockIds] };
    this.notify();
  }

  /** Clears an effective selection without notifying for an existing null. */
  clear(): void {
    if (!this.value) return;
    this.value = null;
    this.notify();
  }

  /**
   * Subscribes to selection changes.
   *
   * @param listener - Callback invoked after set or effective clear.
   * @returns Function that removes this listener.
   */
  subscribe(listener: () => void): Unsubscribe {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Notifies a stable snapshot so listeners may unsubscribe during dispatch. */
  private notify(): void { [...this.listeners].forEach((listener) => listener()); }
}
