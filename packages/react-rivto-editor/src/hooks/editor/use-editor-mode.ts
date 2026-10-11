import type { EditorMode } from "@chulane/rivto";
import { useCallback, useSyncExternalStore } from "react";
import { useEditorContext } from "../../editor-view/editor-context";

/**
 * Value and mutation API returned by {@link useEditorMode}.
 */
export interface UseEditorModeResult {
  /** The editor's current local presentation mode. */
  readonly mode: EditorMode;

  /**
   * Changes the editor's local presentation mode.
   *
   * This operation only changes the mode. Application-specific behavior such
   * as clearing a selection before switching surfaces remains the caller's
   * responsibility.
   *
   * @param mode - The presentation mode that should become active.
   */
  readonly setMode: (mode: EditorMode) => void;
}

/**
 * Returns the editor's active presentation mode and a stable mode setter.
 *
 * Mode is local presentation state, never persisted in the collaborative document.
 * Ordinary views share the runtime ModeManager. Panels have their own manager,
 * unless the host supplies one to retain the mode across navigation. This hook
 * subscribes directly to the manager of the surrounding view.
 *
 * The returned `setMode` function keeps the same identity while the surrounding
 * component rerenders. Calling it with the active mode is a no-op.
 *
 * @returns The current mode and the operation used to change it.
 * @throws If called outside an EditorView subtree.
 */
export function useEditorMode(): UseEditorModeResult {
  const { editorView } = useEditorContext();
  const subscribe = useCallback(
    (listener: () => void) => editorView.mode.subscribe(listener),
    [editorView],
  );
  const mode = useSyncExternalStore(subscribe, () => editorView.mode.get(), () => editorView.mode.get());
  const setMode = useCallback(
    (mode: EditorMode) => editorView.mode.set(mode),
    [editorView],
  );

  return {
    mode,
    setMode,
  };
}
