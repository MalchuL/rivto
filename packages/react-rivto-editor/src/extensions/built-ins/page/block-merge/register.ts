import type { EditorRuntime } from "../../../../editor/editor-runtime";
/** Runtime registration for backward and forward block boundary merging. */
import { registerBackwardBlockMerge } from "./backward";
import { registerForwardBlockMerge } from "./forward";

/**
 * Installs both directional boundary-merge keyboard behaviors.
 *
 * @param editorRuntime - Runtime receiving the keyboard bindings.
 * @returns No value.
 */
export function registerBlockMerge(editorRuntime: EditorRuntime): void {
  registerBackwardBlockMerge(editorRuntime);
  registerForwardBlockMerge(editorRuntime);
}
