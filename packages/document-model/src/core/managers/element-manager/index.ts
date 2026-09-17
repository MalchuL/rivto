/**
 * Publishes element storage, normalization, and processor contracts.
 * This barrel keeps CRDT implementation details private to the element manager
 * while exposing the portable document-model capabilities used by core.
 */
export { DocumentElementManager } from "./element-manager";
export type { ElementPipe, ElementPipeContext, ElementProcessor } from "./element-pipe";
export {
  ELEMENT_FRAME_PROCESSOR,
  ELEMENT_FRAME_PROCESSOR_ID,
  ELEMENT_PROPS_PROCESSOR,
  ELEMENT_PROPS_PROCESSOR_ID,
  ELEMENT_Z_INDEX_PROCESSOR,
  ELEMENT_Z_INDEX_PROCESSOR_ID,
} from "./element-pipe";
export {
  normalizeElementFrame,
  normalizeElementProps,
  normalizeElementZIndex,
  validateElementCollection,
} from "./utils";
