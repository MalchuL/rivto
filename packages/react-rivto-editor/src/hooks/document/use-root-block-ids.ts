import { useMemo, useCallback, useSyncExternalStore } from "react";
import { useEditorContext } from "../../editor-context";
import { useReactEditor } from "../editor/use-editor";

/** Returns the stable ordered root IDs, updating only when root structure changes. */
export function useRootBlockIds(): readonly string[] {
  const reactEditor = useReactEditor();
  const { rootBlockId } = useEditorContext();
  const displayed = useMemo(() => rootBlockId ? [rootBlockId] : undefined, [rootBlockId]);
  const subscribe = useCallback(
    (listener: () => void) => reactEditor.blocks.subscribeRootIds(listener),
    [reactEditor],
  );
  const getSnapshot = useCallback(() => reactEditor.blocks.getRootIds(), [reactEditor]);
  const roots = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return displayed ?? roots;
}
