/**
 * Reactive editor selection for chrome that needs the complete local value.
 *
 * Subscribes to `editor.selection` directly. `snapshot()` is stable until
 * membership changes, so `get()` clones cannot force a re-render on every poll.
 * Caret and block-range publishes no longer bump `editor.revision`; this hook
 * is the refresh path for consumers that need all selection domains.
 */
import type { Selection } from "@chulane/rivto";
import { useCallback, useSyncExternalStore } from "react";
import { useEditorView } from "../../editor-view/use-editor-view";

/**
 * Returns the current detached local selection.
 *
 * @returns The editor's local selection, or undefined when empty.
 * @throws If called outside an EditorView subtree.
 */
export function useEditorSelection(): Selection | undefined {
  const editorView = useEditorView();
  const subscribe = useCallback(
    (listener: () => void) => editorView.selection.subscribe(listener),
    [editorView],
  );
  return useSyncExternalStore(
    subscribe,
    () => editorView.selection.snapshot(),
    () => editorView.selection.snapshot(),
  );
}
