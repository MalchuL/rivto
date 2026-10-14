/**
 * Reactive access to the canonical first-class element collection.
 *
 * The document manager preserves snapshot identity between element updates, so
 * block-only changes do not wake edgeless surface layout.
 *
 * @module
 */
import { useCallback, useSyncExternalStore } from "react";
import { usePanel } from "../editor/use-panel";

/**
 * Subscribes to all flat element records in the current EditorPanel's canvas.
 *
 * Includes roots and descendants once each, with childIds rather than recursive
 * children. The document manager caches the array between canvas changes. Treat
 * returned records as read-only and use editor commands for mutations; changing
 * these objects does not update collaborative storage.
 *
 * @returns Current detached node array, empty when the canvas has no elements.
 * @throws If called outside an EditorPanel or EditorEmbed subtree.
 */
export function useElements() {
  const panel = usePanel();
  const subscribe = useCallback(
    (listener: () => void) => panel.elements.subscribe(listener),
    [panel],
  );
  const getSnapshot = useCallback(() => panel.elements.getElementNodes(), [panel]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
