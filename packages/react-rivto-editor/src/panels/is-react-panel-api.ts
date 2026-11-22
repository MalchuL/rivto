import type { DocumentEditorAPI } from "@chulane/rivto";
import type { ReactEditorApi } from "../editor/types";
import type { ReactPanelApi } from "./types";

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
