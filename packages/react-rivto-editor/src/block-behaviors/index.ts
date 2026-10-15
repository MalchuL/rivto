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
export { createBlockBehaviorContext } from "./utils/context";
export { DefaultBlockBehavior } from "./default-block-behavior";
export { dispatchBlockAction } from "./utils/dispatch";
export { focusCaret, scheduleBlockFocus } from "./utils/focus-ops";
export {
  indentBlocks,
  appendWritingBlock,
  outdentBlocks,
  outdentUntilBoundary,
} from "./utils/outline-ops";
export {
  convertEmptyToList,
  mergeBlocks,
  resetToWritingType,
  splitBlockAt,
} from "./utils/text-ops";
export type {
  BlockBehavior,
  BlockBehaviorAction,
  BlockBehaviorContext,
  BlockBehaviorData,
  BlockBehaviorAvailabilityContext,
  BlockBehaviorOutcome,
  BlockMoveContext,
} from "./types";
