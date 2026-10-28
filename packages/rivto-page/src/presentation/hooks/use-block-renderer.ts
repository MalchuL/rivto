import { useCallback, useSyncExternalStore } from "react";
import type { BlockRenderer } from "../renderers/types";
import { useBlockEditorController } from "./use-block-editor-controller";

/**
 * Observes lookup results rather than rerendering content for every registry revision.
 *
 * @param type - Persisted type whose component or fallback is needed.
 * @returns Stable component identity, or undefined for an unrendered content area.
 * @throws If called outside BlockEditor or registry access fails.
 */
export function useBlockRenderer(type: string): BlockRenderer | undefined {
  const { renderers } = useBlockEditorController();
  const subscribe = useCallback(
    (listener: () => void) => renderers.subscribe(listener),
    [renderers],
  );
  const getSnapshot = useCallback(() => renderers.get(type)?.content, [renderers, type]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
