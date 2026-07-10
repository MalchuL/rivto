import type { EditorSelection } from "../editor/types";

/**
 * Owns detached local text, block, or edgeless selection state.
 *
 * Selection is local editor-session state. It is intentionally not stored in
 * the collaborative document, because each user/view can have different active
 * text ranges, block selections, or canvas selections over the same document.
 *
 * The manager only stores and publishes already-validated values. Runtime code
 * validates block IDs, text offsets, endpoint membership, and mode compatibility
 * before calling `set`.
 */
export class SelectionManager {
  private value: EditorSelection | null = null;
  private readonly listeners = new Set<() => void>();

  /**
   * Returns the current detached selection.
   *
   * Nested text positions and selected block arrays are copied so callers cannot
   * mutate manager state without going through `set` and notifying subscribers.
   */
  get(): EditorSelection | null {
    if (!this.value) return null;
    if (this.value.type === "text") {
      return {
        type: "text",
        anchor: { ...this.value.anchor },
        head: { ...this.value.head },
      };
    }
    if (this.value.type === "block") return { ...this.value, blockIds: [...this.value.blockIds] };
    return { type: "edgeless", blockIds: [...this.value.blockIds] };
  }

  /**
   * Replaces selection with a detached copy and notifies subscribers.
   *
   * Text selection direction is preserved. Operations that need document-order
   * ranges can normalize later, while UI can still know whether the user dragged
   * top-to-bottom or bottom-to-top.
   *
   * @param selection - Runtime-validated local selection.
   */
  set(selection: EditorSelection): void {
    this.value = selection.type === "text"
      ? { type: "text", anchor: { ...selection.anchor }, head: { ...selection.head } }
      : { ...selection, blockIds: [...selection.blockIds] };
    this.notify();
  }

  /** Clears an active selection without notifying when selection is already empty. */
  clear(): void {
    if (!this.value) return;
    this.value = null;
    this.notify();
  }

  /**
   * Subscribes to selection changes.
   *
   * @param listener - Callback called after `set` or effective `clear`.
   * @returns Function that removes this listener.
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Notifies a stable listener snapshot so callbacks can unsubscribe safely. */
  private notify(): void {
    [...this.listeners].forEach((listener) => listener());
  }
}
