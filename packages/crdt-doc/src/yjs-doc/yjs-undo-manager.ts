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
 * Destroying this adapter or its document releases the owned native manager.
 */
export class YjsUndoManager implements CRDTUndoManager {
  private cancelScheduled: (() => void) | undefined;
  private manager: UndoManager | undefined;

  /**
   * Takes ownership of one Yjs history manager and its optional entry limit.
   *
   * A zero limit must already have capture disabled on the supplied manager.
   *
   * @param manager - Yjs manager owned and destroyed by this instance.
   * @param maxEntries - Maximum number of entries per stack, or undefined for no limit.
   */
  constructor(
    manager: UndoManager,
    private readonly maxEntries?: number,
  ) {
    this.manager = manager;
    this.destroy = this.destroy.bind(this);
    manager.doc.on("destroy", this.destroy);
    if (maxEntries !== undefined && maxEntries > 0) {
      // Yjs needs the same bound callbacks for registration and removal.
      this.schedule = this.schedule.bind(this);
      manager.on("stack-item-added", this.schedule);
    }
  }

  /**
   * Reverts the newest tracked change after applying any pending limit.
   *
   * @returns The latest undo entry is applied when available.
   * @throws If this history or its document has been destroyed.
   */
  undo(): void {
    this.flush();
    this.getManager().undo();
  }

  /**
   * Reapplies the newest undone change after applying any pending limit.
   *
   * @returns The latest redo entry is applied when available.
   * @throws If this history or its document has been destroyed.
   */
  redo(): void {
    this.flush();
    this.getManager().redo();
  }

  /**
   * Clears both history stacks and cancels pending trimming.
   *
   * @returns Undo and redo entries and the scheduled task are cleared.
   * @throws If this history or its document has been destroyed.
   */
  clear(): void {
    this.cancel();
    this.getManager().clear();
  }

  /**
   * Ends the current capture group without applying pending trimming.
   *
   * @returns Later tracked changes begin a new history entry.
   * @throws If this history or its document has been destroyed.
   */
  stopCapturing(): void {
    this.getManager().stopCapturing();
  }

  /**
   * Releases the scheduled task, document listener, and owned Yjs manager.
   *
   * @returns History listeners are removed and pending work is cancelled.
   */
  destroy(): void {
    this.cancel();
    const manager = this.manager;
    if (!manager) {
      return;
    }
    this.manager = undefined;
    manager.doc.off("destroy", this.destroy);
    if (this.maxEntries !== undefined && this.maxEntries > 0) {
      manager.off("stack-item-added", this.schedule);
    }
    manager.destroy();
  }

  /**
   * Reads the native manager while this history remains active.
   *
   * @returns The manager owned by this history adapter.
   * @throws If this history or its document has been destroyed.
   */
  private getManager(): UndoManager {
    if (!this.manager) {
      throw new Error("History manager is destroyed");
    }
    return this.manager;
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
    const manager = this.getManager();
    // shortcut: Evicted entries retain Yjs keep flags until reload; replace when safe partial cleanup exists.
    for (const stack of [manager.undoStack, manager.redoStack]) {
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
    const manager = this.getManager();
    if (
      this.maxEntries === undefined ||
      this.cancelScheduled ||
      (manager.undoStack.length <= this.maxEntries && manager.redoStack.length <= this.maxEntries)
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
