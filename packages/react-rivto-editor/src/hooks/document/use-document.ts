import type { DocumentModel } from "@chulane/rivto";
import { useEditorContext } from "../../editor-context";

/**
 * Returns the collaborative document model owned by the current editor.
 *
 * The model instance is stable. EditorView owns the global core revision
 * subscription, so consumers resolve fresh values when its subtree rerenders.
 *
 * @returns The current editor's canonical document model.
 * @throws If called outside an EditorView subtree.
 */
export function useDocument(): DocumentModel {
  return useEditorContext().editor.document;
}
