/**
 * Falls a specialized view through {@link BaseBlockView} when it defers.
 *
 * Dispatchers stay generic: they resolve one view and call a semantic method.
 * `"default"` is the only outcome that consults the shared fallback.
 *
 * @module
 */
import type { BlockViewAction, BlockViewBehavior, BlockViewOutcome } from "./types";

/**
 * Invokes one view action and claims the event when the view handled or refused it.
 *
 * @param view - Resolved view for the target block.
 * @param fallback - Shared generic view used when the specialized view defers.
 * @param action - Semantic method to invoke.
 * @param args - Arguments accepted by that method.
 * @returns `true` when the keyboard or drag dispatcher should claim the event.
 */
export function dispatchViewAction<Action extends BlockViewAction>(
  view: BlockViewBehavior,
  fallback: BlockViewBehavior,
  action: Action,
  ...args: Parameters<BlockViewBehavior[Action]>
): boolean {
  const outcome = (view[action] as (...values: Parameters<BlockViewBehavior[Action]>) => BlockViewOutcome)(
    ...args,
  );
  if (outcome === "default" && view !== fallback) {
    const fallbackOutcome = (fallback[action] as (
      ...values: Parameters<BlockViewBehavior[Action]>
    ) => BlockViewOutcome)(...args);
    return fallbackOutcome === "handled" || fallbackOutcome === "rejected";
  }
  return outcome === "handled" || outcome === "rejected";
}
