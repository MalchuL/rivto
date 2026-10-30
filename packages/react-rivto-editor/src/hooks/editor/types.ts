import type { DocumentModel } from "@chulane/document-model";
import type { CreateReactEditorOptions, ReactEditorApi } from "../../editor/types";

/** Construction options; extensions and keymap are captured when the document changes. */
export interface UseReactEditorOptions extends Omit<CreateReactEditorOptions, "editor"> {
  /** Borrowed model; this hook never destroys it. */
  readonly document: DocumentModel;
  /** Reports construction and cleanup failures; construction errors also appear in the returned state. */
  readonly onError?: (error: unknown) => void;
}

/** Loading has no editor; ready exposes the live instance; error records failed construction. */
export type ReactEditorState =
  | { readonly status: "loading"; readonly editor?: never; readonly error?: never }
  | { readonly status: "ready"; readonly editor: ReactEditorApi; readonly error?: never }
  | { readonly status: "error"; readonly editor?: never; readonly error: unknown };
