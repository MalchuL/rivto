import { useCallback, useSyncExternalStore } from "react";
import { useEditorContext } from "../../editor-context";

/** Returns the stable ordered root IDs, updating only when root structure changes. */
export function useRootBlockIds(): readonly string[] {
  const { reactEditor } = useEditorContext();
  const subscribe = useCallback(
    (listener: () => void) => reactEditor.blocks.subscribeRootIds(listener),
    [reactEditor],
  );
  const getSnapshot = useCallback(() => reactEditor.blocks.getRootIds(), [reactEditor]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
