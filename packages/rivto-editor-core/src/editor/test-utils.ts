import { createRivtoEditor, type EditorRuntime } from "./rivto-editor";
import type { CreateRivtoEditorOptions } from "./types";

/**
 * Core test editor with a local writing block registered.
 *
 * Production hosts / React extensions own writing types; core no longer
 * auto-installs `paragraph`.
 */
export function createTestEditor(options: CreateRivtoEditorOptions = {}): EditorRuntime {
  const editor = createRivtoEditor(options);
  editor.blocksRegistry.defineBlock({ type: "paragraph", title: "Paragraph" });
  return editor;
}
