import { useContext } from "react";
import { EditorContext } from "../../components/editor-panel/editor-context";
import type { EditorContextValue } from "../../components/editor-panel/types";

/**
 * Reads the complete internal EditorPanel context.
 *
 * Public hooks use this helper so the provider requirement and error message
 * stay consistent. Consumers should normally use `usePanel`, `useBlock`, or
 * another focused hook rather than depending on the revision implementation.
 *
 * @returns The nearest EditorPanel's stable editor references.
 * @throws If called outside an EditorPanel or EditorEmbed subtree.
 */
export function useEditorContext(): EditorContextValue {
  const context = useContext(EditorContext);
  if (!context) throw new Error("Editor hooks must be used inside EditorPanel or EditorEmbed");
  return context;
}
