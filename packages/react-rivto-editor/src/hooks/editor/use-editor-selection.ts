/**
 * Reactive full editor selection for chrome that needs the ordered item list.
 *
 * Subscribes to `editor.selection` directly. `snapshot()` is stable until
 * membership changes, so `get()` clones cannot force a re-render on every poll.
 * Caret and block-range publishes no longer bump `editor.revision`; this hook
 * is the refresh path for consumers that need the complete list.
 */
import { useCallback, useSyncExternalStore } from "react";
import type { EditorSelection } from "@chulane/rivto";
import { useEditorContext } from "../../editor-context";

/**
 * Returns the current detached local selection.
 *
 * @returns The editor's ordered text or whole-block selection items.
 * @throws If called outside an EditorView subtree.
 */
export function useEditorSelection(): EditorSelection {
  const { editor } = useEditorContext();
  const subscribe = useCallback(
    (listener: () => void) => editor.selection.subscribe(listener),
    [editor],
  );
  return useSyncExternalStore(
    subscribe,
    () => editor.selection.snapshot(),
    () => editor.selection.snapshot(),
  );
}
