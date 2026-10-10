/**
 * Falls a specialized behavior through {@link DefaultBlockBehavior} when it defers.
 *
 * Dispatchers stay generic: they resolve one behavior and call a semantic method.
 * `"default"` is the only outcome that consults the shared fallback.
 *
 * @module
 */
import type { BlockBehavior, BlockBehaviorAction, BlockBehaviorOutcome } from "./types";

/**
 * Invokes one behavior action and claims the event when the behavior handled or refused it.
 *
 * @param behavior - Resolved behavior for the target block.
 * @param fallback - Shared generic behavior used when the specialized behavior defers.
 * @param action - Semantic method to invoke.
 * @param args - Arguments accepted by that method.
 * @returns `true` when the keyboard or drag dispatcher should claim the event.
 */
export function dispatchBlockAction<Action extends BlockBehaviorAction>(
  behavior: BlockBehavior,
  fallback: BlockBehavior,
  action: Action,
  ...args: Parameters<BlockBehavior[Action]>
): boolean {
  const outcome = (behavior[action] as (...values: Parameters<BlockBehavior[Action]>) => BlockBehaviorOutcome)(
    ...args,
  );
  if (outcome === "default" && behavior !== fallback) {
    const fallbackOutcome = (fallback[action] as (
      ...values: Parameters<BlockBehavior[Action]>
    ) => BlockBehaviorOutcome)(...args);
    return fallbackOutcome === "handled" || fallbackOutcome === "rejected";
  }
  return outcome === "handled" || outcome === "rejected";
}
