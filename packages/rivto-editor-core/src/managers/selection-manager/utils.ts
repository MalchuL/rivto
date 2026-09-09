/**
 * Selection contracts and browser interaction helpers. Whole-block state belongs to core; single-block text editing is explicit host context.
 */
import type { EditorSelection } from "../../editor/types";

/** Returns whether a selection has no text ranges and can be handled structurally. */
export function isStructuralSelection(selection: EditorSelection): boolean {
  return selection.length > 0;
}
