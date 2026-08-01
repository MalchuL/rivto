import type { EditorSelection } from "@chulane/rivto";
import { useEditorContext } from "../../editor-context";

/**
 * Returns the current detached local selection. EditorView's global core
 * revision subscription refreshes consumers when selection changes.
 *
 * @returns The editor's ordered text or whole-block selection items.
 */
export function useEditorSelection(): EditorSelection {
  return useEditorContext().editor.selection.get();
}
