import {
  createRivtoEditor,
  type CreateRivtoEditorOptions,
  type RivtoEditorApi,
} from "@chulane/rivto";
import { DocumentModelImpl, type DocumentModel } from "@chulane/document-model";
import { YjsDoc } from "@chulane/crdt-doc";
import { DEFAULT_WRITING_BLOCK_TYPE } from "./extensions/built-ins/page/default-writing-block";

/**
 * Core editor for React package tests with a local writing type registered.
 *
 * Core no longer auto-installs a writing block; production hosts use
 * `defaultWritingBlockExtension` / `standardPreset`.
 */
export function createTestCoreEditor(
  options: CreateRivtoEditorOptions = {},
): RivtoEditorApi {
  const document = new DocumentModelImpl(new YjsDoc(`rivto-react-test-${crypto.randomUUID()}`));
  const editor = createRivtoEditor(options);
  editor.setDocument(document);
  const documents = new Set<DocumentModel>([document]);
  const setDocument = editor.setDocument.bind(editor);
  const destroy = editor.destroy.bind(editor);
  let destroyed = false;
  editor.setDocument = (next) => {
    documents.add(next);
    setDocument(next);
  };
  editor.destroy = async () => {
    if (destroyed) return;
    destroyed = true;
    const runtimeCleanup = destroy();
    const documentCleanup = Promise.all([...documents].map((item) => item.destroy()));
    await runtimeCleanup;
    await documentCleanup;
  };
  editor.blockRegistry.defineBlock({ type: DEFAULT_WRITING_BLOCK_TYPE, title: "Paragraph" });
  return editor;
}
