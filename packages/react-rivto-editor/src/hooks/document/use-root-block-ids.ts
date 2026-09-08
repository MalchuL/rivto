import { useEditorContext } from "../../editor-context";

/** Returns root IDs refreshed by EditorView's global core revision. */
export function useRootBlockIds(): readonly string[] {
  const { editor } = useEditorContext();
  return editor.blocks.getRootIds();
}
