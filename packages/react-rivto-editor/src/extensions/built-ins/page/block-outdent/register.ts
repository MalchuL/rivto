/** Keyboard registration for outdenting a nested block at its start boundary. */
import {
  registerBlockBoundaryShortcut,
  type BlockBoundaryShortcutEditor,
} from "../register-block-boundary-shortcut";

/**
 * Registers nested-block outdent behavior for Backspace at offset zero.
 *
 * @param reactEditor - Runtime receiving the keyboard binding.
 * @returns The keyboard registration is installed for the current extension lifetime.
 * @throws Propagates keyboard registration failures.
 */
export function registerBlockOutdent(reactEditor: BlockBoundaryShortcutEditor): void {
  registerBlockBoundaryShortcut(reactEditor, "onOutdentAtStart");
}
