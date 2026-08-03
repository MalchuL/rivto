import type { EditorMode } from "../../editor/types";
import { Listeners } from "../../utils";

/**
 * Owns the local editor presentation mode.
 *
 * Mode is runtime-only state: it is not persisted in collaborative data and it
 * changes independently from registered block definitions.
 */
export class ModeManager {
  private readonly listeners = new Listeners<{ modeChanged: void }>();

  /**
   * Creates a mode owner with the provided initial mode.
   *
   * @param value - Initial editor presentation mode.
   */
  constructor(private value: EditorMode = "block") {}

  /**
   * Reads the current editor mode.
   *
   * @returns Active local presentation mode.
   */
  get(): EditorMode {
    return this.value;
  }

  /**
   * Updates the current editor mode and notifies subscribers after changes.
   *
   * Setting the already-active mode is a no-op so callers can write simple
   * intent code without causing duplicate revisions.
   *
   * @param mode - Next local presentation mode.
   */
  set(mode: EditorMode): void {
    if (mode === this.value) return;
    this.value = mode;
    this.notify();
  }

  /**
   * Subscribes to mode changes.
   *
   * @param listener - Callback called after the active mode changes.
   * @returns Function that removes this listener.
   */
  subscribe(listener: () => void): () => void {
    return this.listeners.subscribe("modeChanged", listener);
  }

  /** Notifies a stable listener snapshot so callbacks can unsubscribe safely. */
  private notify(): void {
    this.listeners.emit("modeChanged");
  }
}
