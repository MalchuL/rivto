/** Keyboard registration for backward block merging at a content boundary. */
import {
  registerBlockBoundaryShortcut,
  type BlockBoundaryShortcutEditor,
} from "../../register-block-boundary-shortcut";

/**
 * Registers backward merge behavior for Backspace at offset zero.
 *
 * @param reactEditor - Runtime receiving the keyboard binding.
 * @returns The keyboard registration is installed for the current extension lifetime.
 * @throws Propagates keyboard registration failures.
 */
export function registerBackwardBlockMerge(reactEditor: BlockBoundaryShortcutEditor): void {
  registerBlockBoundaryShortcut(reactEditor, "onMergeBackward");
}
