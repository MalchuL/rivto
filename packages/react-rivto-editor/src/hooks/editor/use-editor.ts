import { useEditorContext } from "../../editor-context";

/**
 * Returns the React rendering and extension runtime from the nearest editor view.
 *
 * Document-facing managers are bound to the surrounding source view. The
 * rendering registries, DOM events, and lifecycle belong to the host runtime.
 * Retained commands keep using their source model after the active view changes.
 * @returns The host-owned React editor API with the current view's document binding.
 * @throws If called outside an EditorView subtree.
 */
export function useReactEditor() {
  return useEditorContext().reactEditor;
}
