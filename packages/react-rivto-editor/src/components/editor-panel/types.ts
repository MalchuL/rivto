import type { DocumentModel } from "@chulane/document-model";
import type { ModeManagerApi } from "@chulane/rivto";
import type { ReactNode, RefCallback } from "react";
import type { ReactEditorApi } from "../../editor/types";
import type { ReactPanel } from "../../panels/react-panel";

/** Properties accepted by the React editor boundary. */
export interface EditorPanelProps {
  /** React runtime owned by useReactEditor or managed EditorStorage; React components must not create instances manually. */
  readonly editor: ReactEditorApi;
  /** Independent element container; null or omitted selects document element roots. */
  readonly rootElementId?: string | null;
  /** Optional Panel-local presentation mode retained by the host. */
  readonly mode?: ModeManagerApi;
  /** Block whose children are displayed; omitted displays document roots. */
  readonly rootBlockId?: string;
  /** False suspends hidden-tab interaction while retaining local bindings; defaults to true. */
  readonly active?: boolean;
  /** Notifies the host after this panel mounts with its borrowed model; ownership stays with the editor owner. */
  readonly onReady?: (document: DocumentModel) => void;
  /** Explicit PageSurface or EdgelessSurface, plus optional application chrome; extensions are registered at runtime creation. */
  readonly children?: ReactNode;
  /** False disables page virtualization, true always enables it, and a number sets the minimum root count; defaults to false. */
  readonly virtualizePageThreshold?: boolean | number;
  /** Extra mounted roots on each side of the viewport; defaults to 8. */
  readonly virtualizePageOverscan?: number;
}

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

/** Internal value connecting one surface DOM root to editor extensions. */
export interface EditorRootContextValue {
  /** Current root element, or null before mount and after unmount. */
  readonly element: HTMLElement | null;
  /** Stable callback ref used by the active surface to register its root. */
  readonly ref: RefCallback<HTMLElement>;
}
