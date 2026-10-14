import { useCallback, useSyncExternalStore } from "react";
import { usePanel } from "../editor/use-panel";

/** Returns the stable ordered root IDs, updating only when root structure changes. */
export function useRootBlockIds(): readonly string[] {
  const panel = usePanel();
  const subscribe = useCallback(
    (listener: () => void) => panel.blocks.subscribeRootIds(listener),
    [panel],
  );
  const getSnapshot = useCallback(() => panel.blocks.getRootIds(), [panel]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
