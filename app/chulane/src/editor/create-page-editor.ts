/**
 * Builds one product-page Rivto runtime the same way the workspace demo does.
 *
 * The host owns lifetime: create here, render through `EditorPanel`, then
 * destroy the React editor, core editor, and document model on unmount. Persistence
 * uses `editor.load` / `editor.dump` rather than a live Yjs provider — the
 * mock page store is still a JSON string.
 */

import {
  createDocumentEditor,
  ModeManager,
  type EditorMode,
  type DocumentEditorAPI,
} from "@chulane/rivto";
import {
  createReactEditor,
  edgelessPreset,
  pageDragExtension,
  standardPreset,
  type MarkdownLinkClick,
  type ReactEditorApi,
} from "@chulane/rivto-react";
import { DocumentModelImpl } from "@chulane/document-model";
import { YjsDoc } from "@chulane/crdt-doc";
import { extractPageText, parseEditorSnapshot } from "./snapshot";

/** Core + React pair owned by the page that created it. */
export type PageEditorRuntime = {
  document: DocumentModelImpl;
  mode: ModeManager;
  editor: DocumentEditorAPI;
  reactEditor: ReactEditorApi;
};

/**
 * Intercepts custom Markdown link protocols (`rivto:` / `chulane:`).
 *
 * Host apps own non-http links; ordinary URLs stay native. Dispatches
 * `rivto:markdown-link` so the shell can route later without baking
 * navigation into the editor adapter.
 *
 * @param context - Click raised by the writing-block Markdown renderer.
 * @returns No value.
 */
const handleMarkdownLink = ({ href, event }: MarkdownLinkClick): void => {
  if (!/^(?:rivto|chulane):/i.test(href)) {
    return;
  }
  event.preventDefault();
  window.dispatchEvent(new CustomEvent("rivto:markdown-link", { detail: href }));
};

/**
 * Creates a page/edgeless editor and hydrates it from stored snapshot JSON.
 *
 * @param options.snapshot - Serialized `EditorSnapshot` from `Page.content`.
 * @param options.mode - Initial presentation mode; defaults to page/block.
 * @returns Runtime the caller must destroy.
 */
export function createPageEditor(options: {
  snapshot: string;
  mode?: EditorMode;
}): PageEditorRuntime {
  const document = new DocumentModelImpl(new YjsDoc(`page-${crypto.randomUUID()}`));
  const editor = createDocumentEditor({ document });
  const reactEditor = createReactEditor({
    editor,
    extensions: [
      standardPreset({ writing: { onMarkdownLinkClick: handleMarkdownLink } }),
      pageDragExtension(),
      ...edgelessPreset(),
    ],
  });
  const parsed = parseEditorSnapshot(options.snapshot);
  if (parsed && (parsed.blocks.length > 0 || parsed.elements.length > 0)) {
    editor.load(parsed);
    editor.history.clear();
  } else {
    const leftover = extractPageText(options.snapshot);
    if (leftover) {
      editor.blocks.insertBlock({ type: "paragraph", content: leftover });
      editor.history.clear();
    }
  }
  return { document, mode: new ModeManager(options.mode ?? "block"), editor, reactEditor };
}
