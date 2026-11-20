import type { BlockEditorResourceOwner } from "../extensions/block-editor-resource-owner";
import type { BlockEditorEventType } from "./types";
import type { FocusInput } from "@chulane/rivto-root";
import type { BlockFocusAttachment } from "./types";
import { EDITOR_BOUNDARY_SELECTOR } from "./markers";

/** Observes occurrence focus boundaries and reconciles focus acquired before attachment. */
export class BlockFocusObserver {
  private readonly listeners = new Map<BlockEditorEventType, Set<() => void>>();
  private attachment: BlockFocusAttachment | undefined;

  /**
   * Retains focus subscriptions under the controller's resource lifetime.
   *
   * @param owner - Borrowed subscription guard and cleanup registration.
   */
  constructor(private readonly owner: BlockEditorResourceOwner) {}

  /**
   * Observes focus entering or leaving the attached editor's owned DOM subtree.
   *
   * Nested editor roots are separate focus boundaries. Notifications are synchronous
   * and do not consume input or control propagation.
   * Detachment stops DOM delivery while preserving subscriptions for the next mount.
   *
   * @param type - Whole-editor focus transition to observe.
   * @param listener - Callback invoked for a boundary transition or when attachment
   * finds focus already inside the root. Initial notification is delivered directly,
   * without dispatching a DOM event.
   * @returns Idempotent disposer removing only this callback registration.
   * @throws If the editor is destroyed or cleanup ownership fails.
   */
  on(type: BlockEditorEventType, listener: () => void): () => void {
    this.owner.assertActive();
    let listeners = this.listeners.get(type);
    if (!listeners) {
      listeners = new Set();
      this.listeners.set(type, listeners);
    }
    const callback = () => listener();
    listeners.add(callback);
    /**
     * Removes this callback without deleting a replacement listener set.
     *
     * @returns The callback and any empty original set are released.
     */
    const remove = () => {
      listeners.delete(callback);
      if (listeners.size === 0 && this.listeners.get(type) === listeners) {
        this.listeners.delete(type);
      }
    };
    try {
      return this.owner.registerCleanup(remove);
    } catch (error) {
      remove();
      throw error;
    }
  }

  /**
   * Attaches both focus listeners with rollback if either installation fails.
   *
   * @param occurrence - Borrowed Root capability bounding focus delivery.
   * @returns Idempotent disposer retaining subscriptions for remount.
   * @throws If already attached, the Root becomes inactive, or subscription setup or rollback fails.
   */
  attach(occurrence: BlockFocusAttachment["occurrence"]): () => void {
    if (this.attachment) {
      throw new Error("Focus observer already attached");
    }
    const attachment = { occurrence };
    this.attachment = attachment;
    const releases: (() => void)[] = [];
    try {
      for (const type of ["focusin", "focusout"] as const) {
        const release = occurrence.observeInput(type, (input) => {
          if (this.attachment === attachment) {
            this.notify(type === "focusin" ? "focus" : "blur", input);
          }
        });
        if (release) {
          releases.push(release);
        }
        if (!release || this.attachment !== attachment || !occurrence.isAttached()) {
          throw new Error("Focus observer requires an active Root");
        }
      }
    } catch (error) {
      if (this.attachment === attachment) {
        this.attachment = undefined;
      }
      try {
        releaseFocusInputs(releases);
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], "Focus observer attachment failed");
      }
      throw error;
    }
    return () => {
      if (this.attachment === attachment) {
        this.attachment = undefined;
        releaseFocusInputs(releases);
      }
    };
  }

  /**
   * Reports focus acquired before this attachment installed its native listeners.
   *
   * Called once after the controller publishes the attachment, so observers can
   * read its root. The original focus event is unavailable; the notification is
   * delivered only to editor observers, without DOM dispatch.
   *
   * @param occurrence - Exact newly attached Root whose focus boundary is checked.
   * @returns Focus observers have been notified if the root or a descendant is active.
   * @throws AggregateError when a focus observer fails, or an occurrence ownership or browser focus lookup failure.
   * @internal The controller invokes this after attachment and rolls back on failure.
   */
  notifyInitialFocus(occurrence: BlockFocusAttachment["occurrence"]): void {
    if (this.attachment?.occurrence !== occurrence || !occurrence.isAttached()) {
      return;
    }
    if (occurrence.hasFocusWithin(EDITOR_BOUNDARY_SELECTOR)) {
      this.notify("focus");
    }
  }

  /**
   * Delivers transitions crossing the root boundary to a captured subscriber list.
   *
   * @param type - Editor event associated with this native focus transition or initial reconciliation.
   * @param input - Normalized focus input whose related target may still be inside the editor,
   * or undefined for initial focus reconciliation.
   * @returns Captured listeners have been attempted unless focus stayed within the subtree or the occurrence detached.
   * @throws AggregateError containing callback failures, reported through native event dispatch
   * for native transitions or propagated to the attachment caller for initial reconciliation.
   * Occurrence owner-check failures propagate directly.
   */
  private notify(type: BlockEditorEventType, input?: FocusInput): void {
    const attachment = this.attachment;
    if (
      !attachment ||
      !attachment.occurrence.isAttached() ||
      (input &&
        ((input.target && !input.target.belongsToRoot(EDITOR_BOUNDARY_SELECTOR)) ||
          input.relatedTarget?.belongsToRoot(EDITOR_BOUNDARY_SELECTOR)))
    ) {
      return;
    }
    const errors: unknown[] = [];
    for (const listener of [...(this.listeners.get(type) ?? [])]) {
      if (this.attachment !== attachment || !attachment.occurrence.isAttached()) {
        break;
      }
      try {
        listener();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length > 0) {
      throw new AggregateError(errors, "Block editor event notification failed");
    }
  }
}

/**
 * Releases each focus subscription, retaining all cleanup failures.
 *
 * @param releases - Subscriptions acquired for one attachment.
 * @returns Every acquired subscription has been offered cleanup.
 * @throws The cleanup failure or an AggregateError when several cleanups fail.
 */
function releaseFocusInputs(releases: readonly (() => void)[]): void {
  const errors: unknown[] = [];
  for (const release of releases) {
    try {
      release();
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length === 1) {
    throw errors[0];
  }
  if (errors.length > 1) {
    throw new AggregateError(errors, "Focus observer cleanup failed");
  }
}
