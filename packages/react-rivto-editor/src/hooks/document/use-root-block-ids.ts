import { useCallback, useMemo, useSyncExternalStore } from "react";
import { useEditorContext } from "../../editor-view/editor-context";
import { useEditorView } from "../../editor-view/use-editor-view";

/** Returns the stable ordered root IDs, updating only when root structure changes. */
export function useRootBlockIds(): readonly string[] {
  const editorView = useEditorView();
  const { rootBlockId } = useEditorContext();
  const displayed = useMemo(() => rootBlockId ? [rootBlockId] : undefined, [rootBlockId]);
  const subscribe = useCallback(
    (listener: () => void) => editorView.runtime.blocks.subscribeRootIds(listener),
    [editorView],
  );
  const getSnapshot = useCallback(() => editorView.runtime.blocks.getRootIds(), [editorView]);
  const roots = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return displayed ?? roots;
}
