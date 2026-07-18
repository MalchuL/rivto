import type { RivtoEditorApi } from "../../../../editor";
import { useEditorContext } from "../../editor-context";

/**
 * Returns the editor runtime provided by the nearest EditorView.
 *
 * The hook does not create, cache, or destroy an editor. Although the returned
 * runtime reference is stable, the component rerenders for runtime revisions
 * because `useEditorContext` consumes the reactive provider value.
 *
 * @returns The host-owned public editor API.
 * @throws If called outside an EditorView subtree.
 */
export function useEditor(): RivtoEditorApi {
  return useEditorContext().editor;
}
