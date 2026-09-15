import type { RivtoEditorApi as Editor } from "@chulane/rivto";
import { useEditorContext } from "../../editor-context";

/**
 * Returns the editor runtime provided by the nearest EditorView.
 *
 * The hook does not create, cache, destroy, or subscribe to the editor. Use a
 * focused state hook such as `useBlock`, `useRootBlockIds`, or `useEditorMode`
 * when rendering document state.
 *
 * @returns The host-owned public editor API.
 * @throws If called outside an EditorView subtree.
 */
export function useEditor(): Editor {
  return useEditorContext().editor;
}

/** Returns the React rendering/extension runtime owned by the nearest EditorView. */
export function useReactEditor() {
  return useEditorContext().reactEditor;
}
