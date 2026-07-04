import type { Unsubscribe } from "../../store/crdt-doc";
import type { EditorMode } from "../editor/types";

/**
 * Owns local editor mode independently from collaborative document state.
 *
 * Mode is a property of one editing session: two collaborators may view the
 * same CRDT document in different modes. Compatibility cleanup is therefore
 * performed by EditorRuntime rather than persisted by this small manager.
 */
export class ModeManager {
  private readonly listeners = new Set<() => void>();
  /** Creates local mode state with block mode as the default. */
  constructor(private value: EditorMode = "block") {}
  /** Returns the active local presentation mode. */
  get(): EditorMode { return this.value; }
  /**
   * Changes mode and notifies observers only for an effective transition.
   *
   * @param mode - Next local presentation mode.
   */
  set(mode: EditorMode): void {
    if (mode === this.value) return;
    this.value = mode;
    [...this.listeners].forEach((listener) => listener());
  }
  /**
   * Subscribes to effective mode changes.
   *
   * @param listener - Callback invoked after mode state changes.
   * @returns Function that removes this listener.
   */
  subscribe(listener: () => void): Unsubscribe {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
