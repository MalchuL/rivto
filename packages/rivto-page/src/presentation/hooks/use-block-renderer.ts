import { useCallback, useSyncExternalStore } from "react";
import type { BlockRenderer } from "../../adapter/types";
import { useBlockEditorController } from "./use-block-editor-controller";

/**
 * Observes lookup results rather than rerendering content for every registry revision.
 *
 * @param type - Persisted type whose component or fallback is needed.
 * @returns Stable component identity, or undefined for an unrendered content area.
 * @throws If called outside BlockEditor or registry access fails.
 */
export function useBlockRenderer(type: string): BlockRenderer | undefined {
  const { renderers } = useBlockEditorController().adapter;
  const subscribe = useCallback(
    (listener: () => void) => renderers.subscribe(listener),
    [renderers],
  );
  const getSnapshot = useCallback(() => renderers.get(type), [renderers, type]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
