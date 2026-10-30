import { useEffect, useState } from "react";
import {
  EmbeddedEditorAcquisition,
  type SourceEditorProvider,
  type EmbeddedEditorSnapshot,
} from "@chulane/rivto-page";
import type { ReactEditorApi } from "../../editor/types";

/**
 * Retains one source editor while a React consumer needs it.
 *
 * The storage shares loading between consumers; cancellation releases only this
 * acquisition. A late completion after unmount is released immediately. The
 * returned editor has its own document identity, so callers can ignore an old
 * result while React commits a new document ID. Nested EditorPanel consumers
 * retain their own acquisition independently of this loading boundary.
 * A rejected acquisition exposes its error without starting another request.
 * Cleanup cancels this consumer's waiting and releases its acquired editor.
 *
 * @param storage - Host editor cache, or undefined when references are unavailable.
 * @param documentId - Source to retain; undefined disables acquisition.
 * @returns Acquired editor or load error; both are absent during loading.
 */
export function useAcquiredEditor(
  storage: SourceEditorProvider<ReactEditorApi> | undefined,
  documentId: string | undefined,
): EmbeddedEditorSnapshot<ReactEditorApi> {
  const [result, setResult] = useState<EmbeddedEditorSnapshot<ReactEditorApi>>({});
  useEffect(() => {
    setResult({});
    if (!storage || !documentId) {
      return;
    }
    const acquisition = new EmbeddedEditorAcquisition(
      storage,
      documentId,
      setResult,
      console.error,
    );
    acquisition.start();
    return () => acquisition.destroy();
  }, [storage, documentId]);
  return result;
}
