/**
 * Reactive access to the canonical first-class element collection.
 *
 * The document manager preserves snapshot identity between element updates, so
 * block-only changes do not wake edgeless surface layout.
 *
 * @module
 */
import { useCallback, useSyncExternalStore } from "react";
import { useEditorView } from "../../editor-view/use-editor-view";

/**
 * Subscribes to all flat element records in the current EditorView's canvas.
 *
 * Includes roots and descendants once each, with childIds rather than recursive
 * children. The document manager caches the array between canvas changes. Treat
 * returned records as read-only and use editor commands for mutations; changing
 * these objects does not update collaborative storage.
 *
 * @returns Current detached node array, empty when the canvas has no elements.
 * @throws If called outside an EditorView subtree.
 */
export function useElements() {
  const editorView = useEditorView();
  const subscribe = useCallback(
    (listener: () => void) => editorView.elements.subscribe(listener),
    [editorView],
  );
  const getSnapshot = useCallback(() => editorView.elements.getElementNodes(), [editorView]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
