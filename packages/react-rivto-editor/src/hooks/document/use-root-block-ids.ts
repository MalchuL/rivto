import { useCallback, useSyncExternalStore } from "react";
import { useEditorContext } from "../../editor-context";

/** Returns the stable ordered root IDs, updating only when root structure changes. */
export function useRootBlockIds(): readonly string[] {
  const { editor } = useEditorContext();
  const subscribe = useCallback(
    (listener: () => void) => editor.blocks.subscribeRootIds(listener),
    [editor],
  );
  const getSnapshot = useCallback(() => editor.blocks.getRootIds(), [editor]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
