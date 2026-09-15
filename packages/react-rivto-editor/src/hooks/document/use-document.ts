import type { DocumentModel } from "@chulane/rivto";
import { useEditorContext } from "../../editor-context";

/**
 * Returns the collaborative document model owned by the current editor.
 *
 * The model instance is stable and this hook does not subscribe to mutations.
 * Render document state through a focused block, root, or element hook.
 *
 * @returns The current editor's canonical document model.
 * @throws If called outside an EditorView subtree.
 */
export function useDocument(): DocumentModel {
  return useEditorContext().editor.document;
}
