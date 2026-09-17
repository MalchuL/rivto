/**
 * Publishes block storage, validation, and processor contracts from one module.
 * Consumers use this boundary instead of depending on the manager's internal
 * CRDT storage helpers.
 */
export { DocumentBlockManager } from "./block-manager";
export type { BlockPipe, BlockPipeContext, BlockProcessor } from "./block-pipe";
export {
  BLOCK_PARENT_CONSTRAINT_PROCESSOR_ID,
  BLOCK_PROPS_PROCESSOR_ID,
  createBlockParentConstraintProcessor,
  createBlockPropsProcessor,
} from "./block-pipe";
export {
  collectBlockIds,
  validateBlockForest,
  validateBlockListProps,
} from "./utils";
export type { BlockListProps } from "../../types";
