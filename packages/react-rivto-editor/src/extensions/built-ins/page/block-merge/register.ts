/** Runtime registration for backward and forward block boundary merging. */
import type { ReactEditor } from "../../../../types";
import { registerBackwardBlockMerge } from "./backward";
import { registerForwardBlockMerge } from "./forward";

/**
 * Installs both directional boundary-merge keyboard behaviors.
 *
 * @param reactEditor - Runtime receiving the keyboard bindings.
 * @returns No value.
 */
export function registerBlockMerge(reactEditor: ReactEditor): void {
  registerBackwardBlockMerge(reactEditor);
  registerForwardBlockMerge(reactEditor);
}
