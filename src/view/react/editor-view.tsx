import { useCallback, useMemo, useSyncExternalStore, type ReactNode } from "react";
import type { RivtoEditorApi } from "../../editor";
import { EditorContext } from "./editor-context";

/** Properties accepted by the React editor boundary. */
export interface EditorViewProps {
  /** Long-lived editor runtime created and destroyed by the host application. */
  readonly editor: RivtoEditorApi;
  /** Surface, inspector, or other React consumers that use the editor hooks. */
  readonly children: ReactNode;
}

/**
 * Provides one reactive editor runtime to a React subtree.
 *
 * EditorView is intentionally a provider rather than a renderer. It does not
 * create or destroy the editor, choose a page/canvas surface, traverse blocks,
 * or render a DOM wrapper. The host owns runtime lifetime and the child surface
 * owns presentation.
 *
 * One `useSyncExternalStore` subscription converts the runtime's monotonic
 * revision into React updates. The revision is included in the context value,
 * so every focused hook observes current state without opening another runtime
 * subscription. Changing the `editor` prop safely unsubscribes from the old
 * runtime and subscribes to the new one.
 *
 * The server snapshot reads the same revision because the runtime is supplied
 * by the host and currently has no separate serialized React snapshot.
 *
 * @param props - Editor runtime and React subtree to bind together.
 * @returns A context provider; EditorView adds no DOM element.
 */
export function EditorView({ editor, children }: EditorViewProps) {
  // Keep the subscribe function stable until the editor instance changes;
  // otherwise useSyncExternalStore would unsubscribe on every React render.
  const subscribe = useCallback((listener: () => void) => editor.subscribe(listener), [editor]);
  const revision = useSyncExternalStore(subscribe, () => editor.revision, () => editor.revision);

  // A new value is published only for an editor swap or runtime revision. The
  // revision is not an API feature; it is the invalidation signal for hooks.
  const context = useMemo(() => ({ editor, revision }), [editor, revision]);

  return <EditorContext.Provider value={context}>{children}</EditorContext.Provider>;
}
