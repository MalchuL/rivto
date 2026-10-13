import type { DocumentModel } from "@chulane/document-model";
import { createDocumentEditor, type DocumentEditorAPI } from "@chulane/rivto";
import { useEffect, useState } from "react";
import { createReactEditor } from "../../editor/react-editor";
import type { ReactEditorApi } from "../../editor/types";
import type { ReactEditorState, UseReactEditorOptions } from "./types";

/**
 * Creates one core and React editor after commit, and disposes both after unmount or model replacement.
 * StrictMode cleanup disposes the first pair before the next setup creates a fresh pair. Abandoned
 * renders create nothing. The supplied model remains caller-owned and is never destroyed here.
 * Call once and share the returned editor among several EditorPanel components. Extensions and
 * keymap are construction settings: remount the hook's component with a new key to replace them.
 * React components must use this hook rather than create ReactEditor instances manually,
 * including through createReactEditor in render, useMemo, or useState initializers.
 * Panels are created by the EditorPanel/EditorEmbed hooks; useReactPanel only reads their context.
 * @param options - Borrowed document, construction settings, and optional error reporter.
 * @returns Loading on first render or document replacement, ready after setup, or a construction error.
 */
export function useReactEditor(options: UseReactEditorOptions): ReactEditorState {
  const [current, setCurrent] = useState<{ document: DocumentModel; state: ReactEditorState }>();
  const { document } = options;
  useEffect(() => {
    let core: DocumentEditorAPI | undefined;
    let editor: ReactEditorApi | undefined;
    const dispose = () => {
      const errors: unknown[] = [];
      for (const close of [() => editor?.destroy(), () => core?.destroy()]) {
        try {
          const result = close();
          if (result) void result.catch(error => (options.onError ?? console.error)(error));
        } catch (error) { errors.push(error); }
      }
      if (errors.length) (options.onError ?? console.error)(new AggregateError(errors, "Editor cleanup failed"));
    };
    try {
      core = createDocumentEditor({ document });
      editor = createReactEditor({ ...options, editor: core });
      setCurrent({ document, state: { status: "ready", editor } });
    } catch (error) {
      dispose();
      core = undefined;
      editor = undefined;
      setCurrent({ document, state: { status: "error", error } });
      options.onError?.(error);
    }
    return dispose;
    // Configuration is captured per document lifetime; a new component key replaces it explicitly.
  }, [document]);
  return current?.document === document ? current.state : { status: "loading" };
}
