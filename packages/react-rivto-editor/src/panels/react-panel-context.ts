import { createContext } from "react";
import type { ReactPanel } from "./react-panel";

/**
 * Reactive value shared by one EditorPanel subtree.
 *
 * The editor reference is stable for the lifetime of a mounted EditorPanel.
 * Source panels share that runtime through a document-bound API for reads and commands
 * to the resolved model until the target moves to another document.
 */
export type ReactPanelContextValue = {
  /** React panel for this occurrence, with the shared React editor available through its editor field. */
  readonly reactPanel: ReactPanel;
  /** Hidden tabs retain their documents but suspend interaction in all nested panels. */
  readonly enabled?: boolean;
};

/**
 * Internal context for the React view boundary.
 *
 * `null` is intentional: it lets hooks report a clear ownership error instead
 * of silently using a global editor or creating an editor during render.
 */
export const ReactPanelContext = createContext<ReactPanelContextValue | null>(null);
