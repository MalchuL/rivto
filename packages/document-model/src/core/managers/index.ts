/**
 * Exposes the focused managers owned by the document model.
 * Each manager controls one persisted concern and hides its collaborative
 * storage representation from editor and presentation layers.
 */
export {
  DocumentBlockManager,
  validateBlockForest,
  validateBlockListProps,
} from "./block-manager";
export type { BlockListProps } from "./block-manager";
export { DocumentElementManager } from "./element-manager";
export { validateElementCollection } from "./element-manager";
export { DocumentPluginDataManager } from "./plugin-data-manager";
export { DocumentHistoryManager } from "./history-manager";
