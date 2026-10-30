import type { BlockEditorResourceOwner } from "../../editor/extensions/block-editor-resource-owner";
import { SLOT_POSITIONS, type BlockSlotEntry, type BlockSlotRegistration } from "./types";

/** Owns presentation registrations for one editor across its DOM attachments. */
export class BlockSlotRegistry {
  private entries: readonly BlockSlotEntry[] = Object.freeze([]);
  private nextId = 0;
  private readonly listeners = new Set<() => void>();

  /**
   * Binds registrations and subscriptions to their editor's resource owner.
   *
   * @param owner - Owner capturing synchronous extension registrations.
   */
  constructor(private readonly owner: BlockEditorResourceOwner) {}

  /**
   * Installs one independently keyed contribution and notifies registry consumers.
   *
   * Captures registration fields in a frozen entry; later caller assignments do
   * not alter the captured fields. Repeated components receive distinct IDs. Unmounting a
   * view does not remove registrations; destroying its editor releases them.
   * If a publication listener fails, the new entry is removed before rethrowing.
   *
   * @param registration - Position, stable component, priority, and optional filters.
   * @returns Idempotent disposer removing only this exact registration.
   * @throws If destroyed, position/priority is invalid, or publication/rollback listeners fail.
   */
  register(registration: BlockSlotRegistration): () => void {
    this.owner.assertActive();
    this.validate(registration);
    const entry: BlockSlotEntry = Object.freeze({
      ...registration,
      id: this.nextId++,
    });
    const dispose = this.owner.registerCleanup(() => {
      this.entries = Object.freeze(this.entries.filter((candidate) => candidate !== entry));
      this.notify();
    });
    this.entries = Object.freeze(
      [...this.entries, entry].sort((left, right) => (right.priority ?? 0) - (left.priority ?? 0)),
    );
    try {
      this.notify();
    } catch (error) {
      try {
        dispose();
      } catch (cleanupError) {
        throw new AggregateError(
          [error, cleanupError],
          "Block editor registration rollback failed",
        );
      }
      throw error;
    }
    return dispose;
  }

  /**
   * Reads the cached immutable priority order without allocating or evaluating filters.
   *
   * @returns Current registrations, or the stable empty array when none are installed.
   */
  getSnapshot(): readonly BlockSlotEntry[] {
    return this.entries;
  }

  /**
   * Observes registry changes independently of node and selection stores.
   *
   * @param listener - Callback notified after an entry is installed or removed.
   * @returns Idempotent disposer releasing this individual subscription.
   * @throws If the editor is destroyed.
   */
  subscribe(listener: () => void): () => void {
    this.owner.assertActive();
    const callback = () => listener();
    this.listeners.add(callback);
    return this.owner.registerCleanup(() => {
      this.listeners.delete(callback);
    });
  }

  /**
   * Rejects unsupported positions and nonfinite priorities before registration changes.
   *
   * @param registration - Proposed contribution to validate.
   * @returns The supported position and finite priority have been checked.
   * @throws If the position is unsupported or priority is not finite.
   */
  private validate(registration: BlockSlotRegistration): void {
    const positions: readonly string[] = [...SLOT_POSITIONS, "start", "end", "body"];
    if (!positions.includes(registration.position)) {
      throw new Error(`Unsupported slot position ${registration.position}`);
    }
    if (!Number.isFinite(registration.priority ?? 0)) {
      throw new Error("Slot priority must be finite");
    }
  }

  /**
   * Delivers changes to a captured subscriber list after snapshot publication.
   *
   * @returns Every captured listener has been attempted in subscription order.
   * @throws AggregateError containing listener failures after all notifications.
   */
  private notify(): void {
    const errors: unknown[] = [];
    for (const listener of [...this.listeners]) {
      try {
        listener();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length > 0) {
      throw new AggregateError(errors, "Block slot notification failed");
    }
  }
}
