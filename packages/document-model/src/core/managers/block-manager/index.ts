/**
 * Publishes block storage and portable validation contracts from one module.
 * Consumers use this boundary instead of depending on the manager's internal
 * CRDT storage helpers.
 */
export { DocumentBlockManager } from "./block-manager";
export {
  validateBlockForest,
  validateBlockListProps,
} from "./utils";
export type { BlockListProps } from "../../types";
