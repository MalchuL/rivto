/**
 * Publishes element storage and collection validation contracts.
 * Field-level normalization remains internal to the document manager, while
 * portable collection validation is shared with clipboard boundaries.
 */
export { DocumentElementManager } from "./element-manager";
export { validateElementCollection } from "./utils";
