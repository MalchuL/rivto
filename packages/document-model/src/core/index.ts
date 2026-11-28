export {
  DocumentModelImpl,
  DEFAULT_MAX_HISTORY_ENTRIES,
  type DocumentModelOptions,
} from "./document-model";
export * from "./managers";
export * from "./types";

// Export validation utilities needed by clipboard and React boundaries
export { validateBlockForest, validateBlockListProps } from "./managers/block-manager/utils";
export { validateElementCollection } from "./managers/element-manager/utils";
export * from "./document-storage";
