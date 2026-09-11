/**
 * Reactive editor selection for chrome that needs the complete local value.
 *
 * Subscribes to `editor.selection` directly. `snapshot()` is stable until
 * membership changes, so `get()` clones cannot force a re-render on every poll.
 * Caret and block-range publishes no longer bump `editor.revision`; this hook
 * is the refresh path for consumers that need all selection domains.
 */
import { useCallback, useSyncExternalStore } from "react";
import type { Selection } from "@chulane/rivto";
import { useEditorContext } from "../../editor-context";

/**
 * Returns the current detached local selection.
 *
 * @returns The editor's local selection, or undefined when empty.
 * @throws If called outside an EditorView subtree.
 */
export function useEditorSelection(): Selection | undefined {
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
