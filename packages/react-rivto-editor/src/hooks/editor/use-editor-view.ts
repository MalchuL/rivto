import { useEditorContext } from "../../editor-context";

/**
 * Returns the editor of the nearest rendered occurrence.
 *
 * Document-facing managers are bound to the surrounding source view. The
 * rendering registries belong to the shared runtime; DOM operations and local
 * registration cleanup belong to this occurrence.
 * Retained commands keep using their source model after the active view changes.
 * @returns The occurrence editor with explicit access to its shared document runtime.
 * @throws If called outside an EditorView subtree.
 */
export function useEditorView() {
  return useEditorContext().editorView;
}
