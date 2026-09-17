/**
 * Identifies the two editor runtimes accepted by React integration helpers.
 * The guards use public capability discriminants and expose no coordinator or
 * document internals.
 */
import type { RivtoEditorApi } from "@chulane/rivto";
import type { ReactEditor } from "./types";

/**
 * Determines whether an editor is the React presentation runtime.
 *
 * @param editor - Known React or framework-neutral editor runtime.
 * @returns Whether `editor` exposes React rendering capabilities.
 */
export function isReactEditor(editor: ReactEditor | RivtoEditorApi): editor is ReactEditor {
  return "renderers" in editor;
}

/**
 * Determines whether an editor is the framework-neutral core runtime.
 *
 * @param editor - Known React or framework-neutral editor runtime.
 * @returns Whether `editor` exposes the core block-definition registry.
 */
export function isRivtoEditor(editor: ReactEditor | RivtoEditorApi): editor is RivtoEditorApi {
  return "blocksRegistry" in editor;
}
