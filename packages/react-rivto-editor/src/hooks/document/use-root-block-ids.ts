import { useMemo, useCallback, useSyncExternalStore } from "react";
import { useEditorContext } from "../../editor-context";
import { useEditorView } from "../editor/use-editor-view";

/** Returns the stable ordered root IDs, updating only when root structure changes. */
export function useRootBlockIds(): readonly string[] {
  const editorView = useEditorView();
  const { rootBlockId } = useEditorContext();
  const displayed = useMemo(() => rootBlockId ? [rootBlockId] : undefined, [rootBlockId]);
  const subscribe = useCallback(
    (listener: () => void) => editorView.blocks.subscribeRootIds(listener),
    [editorView],
  );
  const getSnapshot = useCallback(() => editorView.blocks.getRootIds(), [editorView]);
  const roots = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return displayed ?? roots;
}
