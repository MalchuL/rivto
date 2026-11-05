import { useEffect, useRef, useState } from "react";
import type { FileReference } from "../../../../attachments";
import { useReactPanel } from "../../../../hooks";
import { getFileProvider } from "../file-configuration";

/** Operations and feedback owned by one mounted file view. */
interface FileActions {
  /** Latest opening or copying failure, when present. */
  readonly error: string | undefined;
  /** Whether a clipboard writer can copy the file. */
  readonly canCopy: boolean;
  /**
   * Clears the last opening or copying failure.
   *
   * @returns Removes the displayed failure.
   */
  readonly clearError: () => void;
  /**
   * Opens the current file and cancels any earlier operation.
   *
   * @returns Starts opening the file and reports a failure if it remains active.
   */
  readonly open: () => void;
  /**
   * Copies the current file and cancels any earlier operation.
   *
   * @returns Starts copying and reports a failure if it remains active.
   */
  readonly copy: () => void;
}

/**
 * Owns opening and copying for a mounted generic file view.
 *
 * A new operation, a changed URI or copy metadata, or unmounting cancels the
 * active read. Successful copies notify the caller so it can close its menu.
 *
 * @param reference - Persisted file URI and metadata.
 * @param onCopied - Callback invoked after an active copy succeeds.
 * @returns Current feedback, clipboard capability, and file operations.
 */
export function useFileActions(reference: FileReference, onCopied: () => void): FileActions {
  const { editor } = useReactPanel();
  const operation = useRef<AbortController | undefined>(undefined);
  const [error, setError] = useState<string>();
  const { uri, name, mimeType } = reference;
  // Cancel the active operation when its file metadata changes or the view unmounts.
  useEffect(() => () => operation.current?.abort(), [uri, name, mimeType]);

  // Cancel the previous operation and clear its error before starting another.
  const start = (): AbortController => {
    operation.current?.abort();
    const controller = new AbortController();
    operation.current = controller;
    setError(undefined);
    return controller;
  };

  const open = useFileOpen(reference, start, setError);
  const copy = useFileCopy(reference, start, setError, onCopied);

  return {
    error,
    canCopy: editor.clipboard.canWriteBinary(mimeType),
    // Clear the failure shown by the current view.
    clearError: () => setError(undefined),
    open,
    copy,
  };
}

/**
 * Binds file opening to the current panel and the view's cancellation state.
 *
 * @param reference - Persisted attachment to open.
 * @param start - Cancels the prior operation and returns its replacement.
 * @param setError - Displays a failure for the active operation.
 * @returns A callback that starts opening the file.
 */
function useFileOpen(
  reference: FileReference,
  start: () => AbortController,
  setError: (message: string) => void,
): () => void {
  const panel = useReactPanel();
  const editor = panel.editor;
  // Start opening through the provider currently registered for this editor.
  return () => {
    const controller = start();
    const provider = getFileProvider(editor);
    if (!provider) {
      setError("No file provider is installed");
      return;
    }
    void editor.attachments
      .openBinary(provider, reference, { signal: controller.signal })
      // Ignore failures from an operation superseded by another action.
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setError(reason instanceof Error ? reason.message : "Unable to open file");
        }
      });
  };
}

/**
 * Binds binary copying to the current panel and the view's cancellation state.
 *
 * @param reference - Persisted attachment and clipboard metadata.
 * @param start - Cancels the prior operation and returns its replacement.
 * @param setError - Displays a failure for the active operation.
 * @param onCopied - Callback invoked after an active write succeeds.
 * @returns A callback that starts copying the file.
 */
function useFileCopy(
  reference: FileReference,
  start: () => AbortController,
  setError: (message: string) => void,
  onCopied: () => void,
): () => void {
  const panel = useReactPanel();
  const editor = panel.editor;
  const { uri, name, mimeType } = reference;
  // Copy the current reference using the active operation's cancellation signal.
  return () => {
    const controller = start();
    const data = editor.attachments.readBinary(getFileProvider(editor), uri, mimeType, {
      signal: controller.signal,
    });
    void editor.clipboard
      .writeBinary({ name, mimeType, data })
      // Only an active successful copy may close the current menu.
      .then((copied) => {
        if (controller.signal.aborted) {
          return;
        }
        if (copied) {
          onCopied();
        } else {
          setError("This clipboard cannot copy this file type");
        }
      })
      // Ignore errors from a cancelled or superseded copy.
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setError(reason instanceof Error ? reason.message : "Unable to copy file");
        }
      });
  };
}
