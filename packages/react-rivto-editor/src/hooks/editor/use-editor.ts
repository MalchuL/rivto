import { useEditorContext } from "../../editor-context";

/**
 * Returns the React rendering and extension runtime from the nearest editor view.
 *
 * @returns The host-owned React editor API.
 * @throws If called outside an EditorView subtree.
 */
export function useReactEditor() {
  return useEditorContext().reactEditor;
}
