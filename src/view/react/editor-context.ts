import { createContext, useContext } from "react";
import type { RivtoEditorApi } from "../../editor";

/**
 * Reactive value shared by one EditorView subtree.
 *
 * The editor reference is stable for the lifetime of a mounted EditorView.
 * `revision` changes whenever the runtime publishes document, mode, or
 * selection changes. Hooks may only read `editor`, but consuming this context
 * still makes their component rerender when the context value receives a new
 * revision.
 */
export interface EditorContextValue {
  /** Runtime used for document access, commands, mode, and local selection. */
  readonly editor: RivtoEditorApi;
  /** Monotonic runtime snapshot used solely to invalidate React consumers. */
  readonly revision: number;
}

/**
 * Internal context for the React view boundary.
 *
 * `null` is intentional: it lets hooks report a clear ownership error instead
 * of silently using a global editor or creating an editor during render.
 */
export const EditorContext = createContext<EditorContextValue | null>(null);

/**
 * Reads the complete internal EditorView context.
 *
 * Public hooks use this helper so the provider requirement and error message
 * stay consistent. Consumers should normally use `useEditor`, `useBlock`, or
 * another focused hook rather than depending on the revision implementation.
 *
 * @returns The nearest EditorView's editor and reactive revision.
 * @throws If called outside an EditorView subtree.
 */
export function useEditorContext(): EditorContextValue {
  const context = useContext(EditorContext);
  if (!context) throw new Error("Editor hooks must be used inside EditorView");
  return context;
}
