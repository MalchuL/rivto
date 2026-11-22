/** Keyboard registration for resetting the first empty custom block. */
import {
  registerBlockBoundaryShortcut,
  type BlockBoundaryShortcutEditor,
} from "../register-block-boundary-shortcut";

/**
 * Registers reset-to-writing behavior for Backspace at offset zero.
 *
 * @param reactEditor - Runtime receiving the keyboard binding.
 * @returns The keyboard registration is installed for the current extension lifetime.
 * @throws Propagates keyboard registration failures.
 */
export function registerEmptyBlockReset(reactEditor: BlockBoundaryShortcutEditor): void {
  registerBlockBoundaryShortcut(reactEditor, "onResetEmpty");
}
