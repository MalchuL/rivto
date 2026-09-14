/**
 * Generic block-view behavior, resolution helpers, and mutation primitives.
 *
 * The DOM shell in `blocks/block-view.tsx` is separate presentation. This
 * folder owns interaction policy that page dispatchers and container
 * extensions share.
 *
 * @module
 */
export type {
  BlockViewAction,
  BlockViewBehavior,
  BlockDropPlacementOptions,
  BlockViewContext,
  BlockViewDropContext,
  BlockViewOutcome,
  DropAxis,
} from "./types";
export { BaseBlockView } from "./base-view";
export { ContainerBlockView } from "./container-view";
export { createBlockViewContext } from "./context";
export { dispatchViewAction } from "./dispatch";
export { indentBlocks, insertFirstChild, outdentBlocks, outdentUntilBoundary } from "./ops/outline-ops";
export { convertEmptyToList, mergeBlocks, resetToWritingType, splitBlockAt } from "./ops/text-ops";
export { focusBlockLater, focusCaret } from "./ops/focus-ops";
