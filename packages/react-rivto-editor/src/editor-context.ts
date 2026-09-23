import { createContext, useContext } from "react";
import type { ReactEditor } from "./types";

/**
 * Reactive value shared by one EditorView subtree.
 *
 * The editor reference is stable for the lifetime of a mounted EditorView.
 * Both references stay stable for the lifetime of the mounted EditorView.
 */
export interface EditorContextValue {
  /** React rendering and extension runtime. */
  readonly reactEditor: ReactEditor;
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
 * stay consistent. Consumers should normally use `useReactEditor`, `useBlock`, or
 * another focused hook rather than depending on the revision implementation.
 *
 * @returns The nearest EditorView's stable editor references.
 * @throws If called outside an EditorView subtree.
 */
export function useEditorContext(): EditorContextValue {
  const context = useContext(EditorContext);
  if (!context) throw new Error("Editor hooks must be used inside EditorView");
  return context;
}
