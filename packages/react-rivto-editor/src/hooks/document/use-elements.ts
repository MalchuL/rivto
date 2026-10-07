/**
 * Reactive access to the canonical first-class element collection.
 *
 * The document manager preserves snapshot identity between element updates, so
 * block-only changes do not wake edgeless surface layout.
 *
 * @module
 */
import { useCallback, useSyncExternalStore } from "react";
import { useReactEditor } from "../editor/use-editor";

/** @returns Stable detached elements refreshed only after element mutations. */
export function useElements() {
  const reactEditor = useReactEditor();
  const subscribe = useCallback(
    (listener: () => void) => reactEditor.elements.subscribe(listener),
    [reactEditor],
  );
  const getSnapshot = useCallback(() => reactEditor.elements.getElements(), [reactEditor]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
