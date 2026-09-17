import {
  createRivtoEditor,
  DocumentModelImpl,
  YjsDoc,
  type CreateRivtoEditorOptions,
  type RivtoEditorApi,
} from "@chulane/rivto";
import { DEFAULT_WRITING_BLOCK_TYPE } from "./extensions/built-ins/page/default-writing-block";

/**
 * Core editor for React package tests with a local writing type registered.
 *
 * Core no longer auto-installs a writing block; production hosts use
 * `defaultWritingBlockExtension` / `standardPreset`.
 */
export function createTestCoreEditor(
  options: Omit<CreateRivtoEditorOptions, "document"> = {},
): RivtoEditorApi {
  const document = new DocumentModelImpl(new YjsDoc(`rivto-react-test-${crypto.randomUUID()}`));
  const editor = createRivtoEditor({ ...options, document });
  editor.blocksRegistry.defineBlock({ type: DEFAULT_WRITING_BLOCK_TYPE, title: "Paragraph" });
  return editor;
}
