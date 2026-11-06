import type { UndoManager } from "yjs";
import type { CRDTUndoManager } from "../types";

/** Maximum time before idle history trimming becomes eligible, in milliseconds. */
const HISTORY_TRIM_IDLE_TIMEOUT_MS = 1_000;

/**
 * Owns a Yjs undo manager and its deferred history limit.
 *
 * Idle callbacks have a one-second timeout; environments without idle callbacks
 * use a timer. Undo and redo flush pending trimming before reading the stacks.
 * Eviction leaves Yjs keep flags intact because another history may need them.
 */
export class YjsUndoManager implements CRDTUndoManager {
  private cancelScheduled: (() => void) | undefined;

  /**
   * Takes ownership of one Yjs history manager and its optional entry limit.
   *
   * A zero limit must already have capture disabled on the supplied manager.
   *
   * @param manager - Yjs manager owned and destroyed by this instance.
   * @param maxEntries - Maximum number of entries per stack, or undefined for no limit.
   */
  constructor(
    private readonly manager: UndoManager,
    private readonly maxEntries?: number,
  ) {
    if (maxEntries !== undefined && maxEntries > 0) {
      // Yjs needs the same bound callbacks for registration and removal.
      this.schedule = this.schedule.bind(this);
      this.cancel = this.cancel.bind(this);
      manager.on("stack-item-added", this.schedule);
      manager.doc.on("destroy", this.cancel);
    }
  }

  /**
   * Reverts the newest tracked change after applying any pending limit.
   *
   * @returns The latest undo entry is applied when available.
   */
  undo(): void {
    this.flush();
    this.manager.undo();
  }

  /**
   * Reapplies the newest undone change after applying any pending limit.
   *
   * @returns The latest redo entry is applied when available.
   */
  redo(): void {
    this.flush();
    this.manager.redo();
  }

  /**
   * Clears both history stacks and cancels pending trimming.
   *
   * @returns Undo and redo entries and the scheduled task are cleared.
   */
  clear(): void {
    this.cancel();
    this.manager.clear();
  }

  /**
   * Ends the current capture group without applying pending trimming.
   *
   * @returns Later tracked changes begin a new history entry.
   */
  stopCapturing(): void {
    this.manager.stopCapturing();
  }

  /**
   * Releases the scheduled task, document listener, and owned Yjs manager.
   *
   * @returns History listeners are removed and pending work is cancelled.
   */
  destroy(): void {
    this.cancel();
    if (this.maxEntries !== undefined && this.maxEntries > 0) {
      this.manager.off("stack-item-added", this.schedule);
      this.manager.doc.off("destroy", this.cancel);
    }
    this.manager.destroy();
  }

  /**
   * Cancels the current idle callback or fallback timer, if any.
   *
   * @returns No scheduled trimming remains owned by this instance.
   */
  private cancel(): void {
    this.cancelScheduled?.();
    this.cancelScheduled = undefined;
  }

  /**
   * Applies the configured limit before history is read or during idle time.
   *
   * @returns Pending work is cancelled and both stacks are trimmed when the limit is positive.
   */
  private flush(): void {
    this.cancel();
    if (this.maxEntries === undefined || this.maxEntries === 0) {
      return;
    }
    // shortcut: Evicted entries retain Yjs keep flags until reload; replace when safe partial cleanup exists.
    for (const stack of [this.manager.undoStack, this.manager.redoStack]) {
      if (stack.length > this.maxEntries) {
        stack.splice(0, stack.length - this.maxEntries);
      }
    }
  }

  /**
   * Coalesces excess stack entries into one deferred trimming task.
   *
   * @returns An idle callback or fallback timer is scheduled when needed.
   */
  private schedule(): void {
    if (
      this.maxEntries === undefined ||
      this.cancelScheduled ||
      (this.manager.undoStack.length <= this.maxEntries &&
        this.manager.redoStack.length <= this.maxEntries)
    ) {
      return;
    }
    // Yjs emits stack-item-added during a transaction; defer trimming and prefer idle time.
    if (
      typeof globalThis.requestIdleCallback === "function" &&
      typeof globalThis.cancelIdleCallback === "function"
    ) {
      const id = globalThis.requestIdleCallback(() => this.flush(), {
        timeout: HISTORY_TRIM_IDLE_TIMEOUT_MS,
      });
      this.cancelScheduled = () => globalThis.cancelIdleCallback(id);
    } else {
      const id = setTimeout(() => this.flush(), 0);
      this.cancelScheduled = () => clearTimeout(id);
    }
  }
}
