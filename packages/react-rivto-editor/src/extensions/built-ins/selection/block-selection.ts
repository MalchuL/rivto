import { PageBlockSelectionBoundary } from "../../../surfaces/page/page-selection-boundary";
import type { ReactEditorApi } from "../../../editor/types";

/**
 * Adds explicit whole-block selection to every editor surface.
 *
 * Ctrl/Cmd+pointer-down runs before the text-selection listener, prevents the
 * browser from placing a caret, and toggles the complete block shell. Modifier
 * state is also reflected on the root so CSS can replace the text cursor while
 * the next click means "select this block".
 * Ordinary page clicks release existing block coverage before native caret
 * events arrive. On canvas, only editable block content releases selection here;
 * canvas backgrounds and controls retain their own interaction handlers.
 *
 * Universal-handle clicks preserve the current block group for handle actions.
 *
 * @param reactEditor - Editor owning the keyboard and pointer registrations.
 * @returns Cleanup is owned by the editor's surface registration lifecycle.
 */
export function registerBlockSelection(reactEditor: ReactEditorApi): () => void {
  return reactEditor.surfaces.registerEditorWrapper(PageBlockSelectionBoundary);
}
