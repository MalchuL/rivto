import {
  createContext,
  useContext,
  type RefCallback,
} from "react";

/** Internal value connecting one surface DOM root to editor extensions. */
export interface EditorRootContextValue {
  /** Current root element, or null before mount and after unmount. */
  readonly element: HTMLElement | null;
  /** Stable callback ref used by the active surface to register its root. */
  readonly ref: RefCallback<HTMLElement>;
}

/**
 * Internal root context kept separate from editor revision state.
 *
 * Mounting or switching a surface updates this context without changing the
 * editor runtime or pretending that a DOM element is collaborative state.
 */
export const EditorRootContext = createContext<EditorRootContextValue | null>(null);

/**
 * Reads the DOM-root context shared by an EditorView subtree.
 *
 * @returns Current surface root and its registration callback.
 * @throws If called outside an EditorView subtree.
 */
export function useEditorRootContext(): EditorRootContextValue {
  const context = useContext(EditorRootContext);
  if (!context) throw new Error("Editor root hooks must be used inside EditorView");
  return context;
}
