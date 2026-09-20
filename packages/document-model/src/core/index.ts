export { DocumentModelImpl } from "./document-model";
export * from "./managers";
export * from "./types";

// Export validation utilities needed by clipboard and React boundaries
export { validateBlockForest, validateElementCollection, validateBlockListProps } from "./managers/block-manager/utils";
export { isPlainRecord, isPortableValue, assertPortableValue, assertPortableRecord, type PortableValue } from "./utils/portable";