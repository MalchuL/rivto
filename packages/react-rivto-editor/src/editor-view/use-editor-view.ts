import { useEditorContext } from "./editor-context";

/**
 * Returns the API supplied by the nearest EditorView component in the React tree.
 *
 * In an embedding, this is the view of the referenced document or subtree. It keeps
 * its own DOM root and local event registrations, even if another view later gains
 * focus. Shared document operations and rendering registries are available through
 * editorView.runtime; selection, clipboard, and slash operations use this view.
 * Retained commands keep editing their original document rather than following focus.
 * @returns The surrounding view API, shared by components within that EditorView.
 * @throws If called outside an EditorView subtree.
 */
export function useEditorView() {
  return useEditorContext().editorView;
}
