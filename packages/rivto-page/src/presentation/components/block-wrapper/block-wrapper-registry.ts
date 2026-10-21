import type { BlockEditorResourceOwner } from "../../../editor/extensions/block-editor-resource-owner";
import type { BlockWrapperRegistration, BlockWrapperEntry, BlockWrapperRegistryApi } from "./types";

/** Owns ordered block decorators independently of content, layout, and DnD geometry. */
export class BlockWrapperRegistry implements BlockWrapperRegistryApi {
  /** Immutable priority-order snapshot retained between installations/removals. */
  private entries: readonly BlockWrapperEntry[] = Object.freeze([]);
  /** Distinct keys keep repeated component registrations independently removable. */
  private nextId = 0;
  /** Independent subscriber closures, including duplicate caller callbacks. */
  private readonly listeners = new Set<() => void>();

  /**
   * Binds registrations and subscriptions to their editor's resource owner.
   *
   * @param owner - Owner capturing synchronous extension registrations.
   */
  constructor(private readonly owner: BlockEditorResourceOwner) {}

  /**
   * Installs one independently keyed decorator and notifies registry consumers.
   *
   * Captures the component and priority in a frozen entry. Higher priority is
   * outermost; equal priorities retain installation order. Repeated components receive
   * distinct IDs. Unmounting a view does not remove registrations; destroying its editor releases them.
   * If a publication listener fails, the new entry is removed before rethrowing.
   *
   * @param registration - Stable host decorator and a required finite priority.
   * @returns Idempotent disposer removing only this exact registration.
   * @throws If destroyed, priority is nonfinite/missing, or publication/rollback listeners fail.
   */
  register(registration: BlockWrapperRegistration): () => void {
    this.owner.assertActive();
    if (!Number.isFinite(registration.priority)) {
      throw new Error("Wrapper priority must be finite");
    }
    const entry: BlockWrapperEntry = Object.freeze({
      ...registration,
      id: this.nextId++,
    });
    const dispose = this.owner.registerCleanup(() => {
      this.entries = Object.freeze(this.entries.filter((candidate) => candidate !== entry));
      this.notify();
    });
    this.entries = Object.freeze(
      [...this.entries, entry].sort(
        (left, right) => right.priority - left.priority || left.id - right.id,
      ),
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
   * Reads the cached immutable priority order without allocating a new array.
   *
   * @returns Current registrations, or the stable empty array when none are installed.
   */
  getSnapshot(): readonly BlockWrapperEntry[] {
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
      throw new AggregateError(errors, "Block wrapper notification failed");
    }
  }
}
