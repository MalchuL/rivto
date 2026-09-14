/** Public entry point for boundary block merging. */
export { registerBlockMerge } from "./register";
export { registerBackwardBlockMerge } from "./backward";
export { registerForwardBlockMerge } from "./forward";
export { removeEmptyBlockAfterStructuralPredecessor } from "./utils";
