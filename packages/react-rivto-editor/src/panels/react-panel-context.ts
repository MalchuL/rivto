import { createContext } from "react";
import type { DocumentModel } from "@chulane/document-model";
import type { ReactPanel } from "./react-panel";

/**
 * Reactive value shared by one EditorPanel subtree.
 *
 * The editor reference is stable for the lifetime of a mounted EditorPanel.
 * Source panels share that runtime through a document-bound API for reads and commands
 * to the resolved model until the target moves to another document.
 */
export interface ReactPanelContextValue {
  /** React panel for this occurrence, with the shared React editor available through its editor field. */
  readonly reactPanel: ReactPanel;
  /** Model acquired by this panel; absent while its document is loading. */
  readonly document?: DocumentModel;
  /** Identity used to route mutations to the single editor acquired by this panel. */
  readonly documentId: string;
  /** Displayed source root limiting selection and keyboard navigation. */
  readonly rootBlockId?: string;
  /** Hidden tabs retain their documents but suspend interaction in all nested panels. */
  readonly enabled?: boolean;
}

/**
 * Internal context for the React view boundary.
 *
 * `null` is intentional: it lets hooks report a clear ownership error instead
 * of silently using a global editor or creating an editor during render.
 */
export const ReactPanelContext = createContext<ReactPanelContextValue | null>(null);
