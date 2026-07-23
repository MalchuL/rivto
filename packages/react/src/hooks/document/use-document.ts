import type { DocumentModelImpl } from "@chulane/rivto";
import { useEditorContext } from "../../editor-context";

/**
 * Returns the collaborative document model owned by the current editor.
 *
 * The model instance is stable, but components using this hook still rerender
 * after local or remote document updates because EditorView publishes the
 * editor revision through context. Read `document.document` for the detached
 * root block tree and use editor commands for application-level mutations;
 * exposing the model here is primarily useful for document metadata and future
 * document-scoped hooks.
 *
 * @returns The current editor's canonical DocumentModelImpl instance.
 * @throws If called outside an EditorView subtree.
 */
export function useDocument(): DocumentModelImpl {
  return useEditorContext().editor.document;
}
