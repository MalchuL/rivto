/**
 * Ordered store of paste algorithms owned by one clipboard manager.
 *
 * Strategies are constructed once with their editor runtime. Registration owns
 * identity, so strategy implementations contain only paste behavior. Paste
 * calls only supply {@link PasteContext} and {@link PastePlacement}.
 */
import type { PasteContext, PastePlacement, PasteStrategy } from "./paste-strategies";

/** Ordered store of paste algorithms consulted during clipboard paste. */
export class PasteStrategyRegistry {
  private readonly items = new Map<string, PasteStrategy>();

  /**
   * Adds or replaces a strategy under an explicit registry ID.
   * @param id - Stable identity owned by the registering layer.
   * @param strategy - Algorithm bound to an editor runtime.
   * @returns Disposer that removes this exact registration.
   */
  register(id: string, strategy: PasteStrategy): () => void {
    this.items.delete(id);
    this.items.set(id, strategy);
    return () => {
      if (this.items.get(id) === strategy) this.items.delete(id);
    };
  }

  /**
   * Removes the strategy registered under `id`.
   * @param id - Registered strategy ID to drop.
   * @returns No value.
   */
  unregister(id: string): void {
    this.items.delete(id);
  }

  /**
   * Returns all registered strategies in execution order.
   * @returns Strategies whose matching should use the latest paste context.
   */
  getPasteStrategies(): PasteStrategy[] {
    return [...this.items.values()];
  }

  /**
   * Strategies that accept this clipboard and destination, in registration order.
   * @param context - Shared clipboard payload and paste intent.
   * @param placement - Host or derived insertion destination.
   * @returns Matching algorithms to run sequentially.
   */
  findMatchingPasteStrategies(context: PasteContext, placement: PastePlacement): PasteStrategy[] {
    return [...this.items.values()].filter((strategy) => strategy.matches(context, placement));
  }
}
