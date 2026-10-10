/**
 * Generic block behavior, resolution helpers, and mutation primitives.
 *
 * The DOM shell in `blocks/block-view/block-view.tsx` is separate presentation. This
 * folder owns interaction policy that page dispatchers and container
 * extensions share.
 *
 * @module
 */
export { ContainerBlockBehavior } from "./container-block-behavior";
export { createBlockBehaviorContext } from "./context";
export { DefaultBlockBehavior } from "./default-block-behavior";
export { dispatchBlockAction } from "./dispatch";
export { focusCaret, scheduleBlockFocus } from "./ops/focus-ops";
export { indentBlocks, appendWritingBlock, outdentBlocks, outdentUntilBoundary } from "./ops/outline-ops";
export { convertEmptyToList, mergeBlocks, resetToWritingType, splitBlockAt } from "./ops/text-ops";
export type {
  BlockBehavior, BlockBehaviorAction, BlockBehaviorContext, BlockBehaviorOutcome, BlockDropContext,
  BlockDropDestination, BlockDropPlacementOptions, DropAxis
} from "./types";
