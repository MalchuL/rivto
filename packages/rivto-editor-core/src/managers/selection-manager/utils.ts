import type { EditorSelection } from "../../editor/types";

/** Returns whether a selection has no text ranges and can be handled structurally. */
export function isStructuralSelection(selection: EditorSelection): boolean {
  return !selection.some((item) => item.type === "text");
}
