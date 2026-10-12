import { useContext } from "react";
import { EditorRootContext } from "../../components/editor-panel/editor-root-context";
import type { EditorRootContextValue } from "../../components/editor-panel/types";

/**
 * Reads the DOM-root context shared by an EditorPanel subtree.
 *
 * @returns Current surface root and its registration callback.
 * @throws If called outside an EditorPanel or EditorEmbed subtree.
 */
export function useEditorRootContext(): EditorRootContextValue {
  const context = useContext(EditorRootContext);
  if (!context) throw new Error("Editor root hooks must be used inside EditorPanel or EditorEmbed");
  return context;
}
