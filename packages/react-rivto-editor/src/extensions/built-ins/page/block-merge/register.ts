import type { BlockBoundaryShortcutEditor } from "../register-block-boundary-shortcut";
/** Runtime registration for backward and forward block boundary merging. */
import { registerBackwardBlockMerge } from "./backward";
import { registerForwardBlockMerge } from "./forward";

/**
 * Installs both directional boundary-merge keyboard behaviors.
 *
 * @param reactEditor - Runtime receiving the keyboard bindings.
 * @returns Both keyboard registrations are installed for the current extension lifetime.
 * @throws Propagates keyboard registration failures.
 */
export function registerBlockMerge(reactEditor: BlockBoundaryShortcutEditor): void {
  registerBackwardBlockMerge(reactEditor);
  registerForwardBlockMerge(reactEditor);
}
