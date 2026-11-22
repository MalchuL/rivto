/**
 * Forward Delete dispatch at editable block boundaries.
 *
 * Eligibility stays here. The resolved block view owns merge and empty-block
 * removal so containers can refuse a merge without type switches in this file.
 *
 * @module
 */
import {
  registerBlockBoundaryShortcut,
  type BlockBoundaryShortcutEditor,
} from "../../register-block-boundary-shortcut";

/**
 * Registers forward merging at a collapsed block-end caret.
 *
 * @param reactEditor - Runtime receiving the keyboard binding.
 * @returns The keyboard registration is installed for the current extension lifetime.
 * @throws Propagates keyboard registration failures.
 */
export function registerForwardBlockMerge(reactEditor: BlockBoundaryShortcutEditor): void {
  registerBlockBoundaryShortcut(reactEditor, "onMergeForward");
}
