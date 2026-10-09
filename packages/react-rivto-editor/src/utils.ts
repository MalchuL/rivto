import type { EditorRuntime } from "./editor-runtime";
/**
 * Distinguishes view editors and framework-neutral editors from shared React runtimes.
 * The guards use public capability discriminants and expose no coordinator or
 * document internals.
 */
import type { RivtoEditorApi } from "@chulane/rivto";
import type { EditorViewApi } from "./types";

/**
 * Determines whether an editor belongs to one rendered React occurrence.
 *
 * @param editor - Known view editor, shared React runtime, or framework-neutral editor.
 * @returns Whether `editor` has an explicit occurrence and shared runtime.
 */
export function isEditorViewApi(editor: EditorViewApi | EditorRuntime | RivtoEditorApi): editor is EditorViewApi {
  return "runtime" in editor && "view" in editor;
}

/**
 * Determines whether an editor is the framework-neutral core runtime.
 *
 * @param editor - Known view editor, shared React runtime, or framework-neutral editor.
 * @returns Whether `editor` exposes the core block-definition registry.
 */
export function isRivtoEditor(editor: EditorViewApi | EditorRuntime | RivtoEditorApi): editor is RivtoEditorApi {
  return "blockRegistry" in editor;
}
