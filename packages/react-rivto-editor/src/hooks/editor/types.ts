import type { RefCallback } from "react";
import type { DocumentModel } from "@chulane/document-model";
import type { CreateReactEditorOptions, ReactEditorHostApi } from "../../editor/types";

/** Construction options; extensions and keymap are captured when the document changes. */
export interface UseReactEditorOptions<CustomEvents extends object = object> extends Omit<
  CreateReactEditorOptions<CustomEvents>,
  "editor"
> {
  /** Borrowed model; this hook never destroys it. */
  readonly document: DocumentModel;
  /** Reports construction and cleanup failures; construction errors also appear in the returned state. */
  readonly onError?: (error: unknown) => void;
}

/** Loading has no editor; ready exposes the live instance; error records failed construction. */
export type ReactEditorState<CustomEvents extends object = object> =
  | { readonly status: "loading"; readonly editor?: never; readonly error?: never }
  | {
      readonly status: "ready";
      readonly editor: ReactEditorHostApi<CustomEvents>;
      readonly error?: never;
    }
  | { readonly status: "error"; readonly editor?: never; readonly error: unknown };

/** Current hook result paired with the model used to create it. */
export interface UseReactEditorCurrent<CustomEvents extends object> {
  readonly document: DocumentModel;
  readonly state: ReactEditorState<CustomEvents>;
}

/** Surface mounting callback returned by useEditorRoot. */
export interface UseEditorRootResult {
  /** Stable callback ref that registers the current surface root. */
  readonly ref: RefCallback<HTMLElement>;
}
