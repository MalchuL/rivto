import type { ReactEditorApi } from "./editor/types";
/**
 * Distinguishes panel operations from whole-document editor operations.
 * The guards use public capability discriminants and expose no coordinator or
 * document internals.
 */
import type { DocumentEditorAPI } from "@chulane/rivto";
import type { ReactPanelApi } from "./panels/types";

/**
 * Determines whether an editor belongs to one rendered React occurrence.
 *
 * @param editor - Known view editor, shared React runtime, or framework-neutral editor.
 * @returns Whether `editor` has an explicit occurrence and shared runtime.
 */
export function isReactPanelApi(
  editor: ReactPanelApi | ReactEditorApi | DocumentEditorAPI,
): editor is ReactPanelApi {
  return "editor" in editor;
}

/**
 * Determines whether an editor provides the whole-document core contract.
 *
 * @param editor - Known view editor, shared React runtime, or framework-neutral editor.
 * @returns Whether `editor` exposes the core block-definition registry, including a ReactEditorApi.
 */
export function isRivtoEditor(
  editor: ReactPanelApi | ReactEditorApi | DocumentEditorAPI,
): editor is DocumentEditorAPI {
  return "blockRegistry" in editor;
}
