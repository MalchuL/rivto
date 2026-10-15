/**
 * Invokes applicable block behaviors in priority order when earlier handlers defer.
 *
 * Dispatchers stay generic: they resolve an ordered chain and call a semantic method.
 * `"default"` is the only outcome that continues through the chain to later applicable registrations.
 *
 * @module
 */
import type {
  BlockBehavior,
  BlockBehaviorAction,
  BlockBehaviorAvailabilityContext,
  BlockBehaviorOutcome,
} from "../types";

/**
 * Invokes an ordered behavior chain until a behavior handles or explicitly rejects the operation.
 *
 * Applicability is checked for this operation immediately before invoking a
 * handler. Inherited methods are called normally, without fallback exceptions.
 * @param behaviors - Registered behaviors in descending priority order.
 * @param context - Common detached block fields and runtime used by availability predicates, without method names.
 * @param action - Semantic method to invoke.
 * @param args - Arguments accepted by that method.
 * @returns `true` when a behavior handles or explicitly rejects the operation;
 * `false` when every applicable handler defers or is absent.
 */
export function dispatchBlockAction<Action extends BlockBehaviorAction>(
  behaviors: readonly BlockBehavior[],
  context: BlockBehaviorAvailabilityContext,
  action: Action,
  ...args: Parameters<NonNullable<BlockBehavior[Action]>>
): boolean {
  for (const behavior of behaviors) {
    const handler = behavior[action];
    if (!handler || !behavior.isAvailable(context)) {
      continue;
    }
    const outcome = (
      handler as (...values: Parameters<NonNullable<BlockBehavior[Action]>>) => BlockBehaviorOutcome
    ).call(behavior, ...args);
    if (outcome !== "default") {
      return true;
    }
  }
  return false;
}
