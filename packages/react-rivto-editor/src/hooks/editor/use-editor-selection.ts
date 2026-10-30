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
import { useReactPanel } from "./use-react-panel";

/**
 * Returns the current detached local selection.
 *
 * @returns The editor's local selection, or undefined when empty.
 * @throws If called outside an EditorPanel or EditorEmbed subtree.
 */
export function useEditorSelection(): Selection | undefined {
  const reactPanel = useReactPanel();
  const subscribe = useCallback(
    (listener: () => void) => reactPanel.selection.subscribe(listener),
    [reactPanel],
  );
  return useSyncExternalStore(
    subscribe,
    () => reactPanel.selection.snapshot(),
    () => reactPanel.selection.snapshot(),
  );
}
