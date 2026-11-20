import { createContext, type RefCallback } from "react";

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
