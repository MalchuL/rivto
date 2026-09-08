import { createRivtoEditor, type CreateRivtoEditorOptions, type RivtoEditorApi } from "@chulane/rivto";
import { DEFAULT_WRITING_BLOCK_TYPE } from "./extensions/page/default-writing-block";

/**
 * Core editor for React package tests with a local writing type registered.
 *
 * Core no longer auto-installs a writing block; production hosts use
 * `defaultWritingBlockExtension` / `standardPreset`.
 */
export function createTestCoreEditor(options: CreateRivtoEditorOptions = {}): RivtoEditorApi {
  const editor = createRivtoEditor(options);
  editor.blocksRegistry.defineBlock({ type: DEFAULT_WRITING_BLOCK_TYPE, title: "Paragraph" });
  return editor;
}
