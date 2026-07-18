import type { EditorMode } from "../../../../editor";
import { useEditorContext } from "../../editor-context";

/**
 * Returns the editor's active local presentation mode.
 *
 * Mode is view-local runtime state and is never persisted in the collaborative
 * document. ModeManager changes increment the editor revision, so this value is
 * refreshed through EditorView without a second ModeManager subscription.
 *
 * @returns `block` for document layout or `edgeless` for canvas layout.
 * @throws If called outside an EditorView subtree.
 */
export function useEditorMode(): EditorMode {
  const { editor } = useEditorContext();
  return editor.mode.get();
}
