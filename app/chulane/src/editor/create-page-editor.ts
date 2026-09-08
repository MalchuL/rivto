/**
 * Builds one product-page Rivto runtime the same way the workspace demo does.
 *
 * The host owns lifetime: create here, render through `EditorView`, then
 * destroy both the React runtime and the core editor on unmount. Persistence
 * uses `editor.load` / `editor.dump` rather than a live Yjs provider — the
 * mock page store is still a JSON string.
 */

import {
  createRivtoEditor,
  type EditorMode,
  type RivtoEditorApi,
} from "@chulane/rivto";
import {
  createReactEditor,
  edgelessVisualsExtension,
  standardPreset,
  type MarkdownLinkClick,
  type ReactEditor,
} from "@chulane/rivto-react";
import { extractPageText, parseEditorSnapshot } from "./snapshot";

/** Core + React pair owned by the page that created it. */
export type PageEditorRuntime = {
  editor: RivtoEditorApi;
  reactEditor: ReactEditor;
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
  if (!/^(?:rivto|chulane):/i.test(href)) return;
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
  const editor = createRivtoEditor({ mode: options.mode ?? "block" });
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
  const reactEditor = createReactEditor({
    editor,
    extensions: [
      standardPreset({ writing: { onMarkdownLinkClick: handleMarkdownLink } }),
      edgelessVisualsExtension(),
    ],
  });
  return { editor, reactEditor };
}
