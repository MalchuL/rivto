import { useCallback, useMemo, useSyncExternalStore } from "react";
import { useEditorContext } from "../../editor-view/editor-context";
import { useEditorView } from "../../editor-view/use-editor-view";

/** Returns the stable ordered root IDs, updating only when root structure changes. */
export function useRootBlockIds(): readonly string[] {
  const editorView = useEditorView();
  const { rootBlockId } = useEditorContext();
  const embedded = useMemo(() => rootBlockId ? [rootBlockId] : undefined, [rootBlockId]);
  const empty = useMemo<readonly string[]>(() => [], []);
  const subscribe = useCallback((listener: () => void) => {
    if (rootBlockId) return editorView.runtime.blocks.subscribeBlockNode(rootBlockId, listener);
    return editorView.runtime.blocks.subscribeRootIds(listener);
  }, [editorView, rootBlockId]);
  const getSnapshot = useCallback(() => {
    if (!rootBlockId) return editorView.runtime.blocks.getRootIds();
    if (editorView.panel) return editorView.runtime.blocks.getBlockNode(rootBlockId)?.childIds ?? empty;
    return embedded!;
  }, [editorView, rootBlockId, embedded, empty]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
