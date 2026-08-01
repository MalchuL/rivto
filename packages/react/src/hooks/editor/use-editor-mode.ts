import type { EditorMode } from "@chulane/rivto";
import { useCallback, useSyncExternalStore } from "react";
import { useEditorContext } from "../../editor-context";

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
 * Mode is view-local runtime state and is never persisted in the collaborative
 * document. This hook subscribes directly to ModeManager.
 *
 * The returned `setMode` function keeps the same identity while the surrounding
 * component rerenders. Calling it with the active mode is a no-op.
 *
 * @returns The current mode and the operation used to change it.
 * @throws If called outside an EditorView subtree.
 */
export function useEditorMode(): UseEditorModeResult {
  const { editor } = useEditorContext();
  const subscribe = useCallback(
    (listener: () => void) => editor.mode.subscribe(listener),
    [editor],
  );
  const mode = useSyncExternalStore(subscribe, () => editor.mode.get(), () => editor.mode.get());
  const setMode = useCallback(
    (mode: EditorMode) => editor.mode.set(mode),
    [editor],
  );

  return {
    mode,
    setMode,
  };
}
