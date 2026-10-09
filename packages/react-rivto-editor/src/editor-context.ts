import { createContext, useContext } from "react";
import type { DocumentModel } from "@chulane/document-model";
import type { EditorViewController } from "./managers/events/editor-view-controller";
import type { EditorViewApi } from "./types";

/**
 * Reactive value shared by one EditorView subtree.
 *
 * The editor reference is stable for the lifetime of a mounted EditorView.
 * Source views share that runtime through a document-bound API for reads and commands
 * to the resolved model until the target moves to another document.
 */
export interface EditorContextValue {
  /** Editor for this occurrence, with shared runtime available through its runtime field. */
  readonly editorView: EditorViewApi;
  /** Model acquired by this view; absent while its document is loading. */
  readonly document?: DocumentModel;
  /** Identity used to route mutations to the single editor acquired by this view. */
  readonly documentId: string;
  /** Displayed source root limiting selection and keyboard navigation. */
  readonly rootBlockId?: string;
  /** Per-view DOM namespace; keeps collapse controls unique across source replicas. */
  readonly domIdPrefix?: string;
  /** Lifecycle and local UI notifications owned by this mounted occurrence. */
  readonly view?: EditorViewController;
  /** Hidden tabs retain their documents but suspend interaction in all nested views. */
  readonly enabled?: boolean;
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
 * stay consistent. Consumers should normally use `useEditorView`, `useBlock`, or
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
