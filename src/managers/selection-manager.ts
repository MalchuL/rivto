import type { EditorSelection, EditorSelectionItem } from "../editor/types";

/** Creates a detached copy of one selection item. */
function cloneSelection(selection: EditorSelectionItem): EditorSelectionItem {
  return selection.type === "text"
    ? { type: "text", anchor: { ...selection.anchor }, head: { ...selection.head } }
    : { ...selection, blockIds: [...selection.blockIds] };
}

/**
 * Owns an ordered list of detached local selection items.
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
  private value: EditorSelection = [];
  private readonly listeners = new Set<() => void>();

  /**
   * Returns the current detached selection list.
   *
   * Nested text positions and selected block arrays are copied so callers cannot
   * mutate manager state without going through `set` and notifying subscribers.
   */
  get(): EditorSelection {
    return this.value.map(cloneSelection);
  }

  /**
   * Replaces every selection item with detached copies and notifies subscribers.
   *
   * Text selection direction is preserved. Operations that need document-order
   * ranges can normalize later, while UI can still know whether the user dragged
   * top-to-bottom or bottom-to-top.
   *
   * @param selection - Runtime-validated local selection list.
   */
  set(selection: EditorSelection): void {
    this.value = selection.map(cloneSelection);
    this.notify();
  }

  /** Clears an active selection without notifying when selection is already empty. */
  clear(): void {
    if (!this.value.length) return;
    this.value = [];
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
