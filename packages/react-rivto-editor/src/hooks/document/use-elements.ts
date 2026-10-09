/**
 * Reactive access to the canonical first-class element collection.
 *
 * The document manager preserves snapshot identity between element updates, so
 * block-only changes do not wake edgeless surface layout.
 *
 * @module
 */
import { useCallback, useSyncExternalStore } from "react";
import { useEditorView } from "../editor/use-editor-view";

/** @returns Stable detached elements refreshed only after element mutations. */
export function useElements() {
  const editorView = useEditorView();
  const subscribe = useCallback(
    (listener: () => void) => editorView.elements.subscribe(listener),
    [editorView],
  );
  const getSnapshot = useCallback(() => editorView.elements.getElements(), [editorView]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
