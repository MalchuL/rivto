import { useEffect, useState } from "react";
import type { EditorStorage } from "../../editor/editor-storage";
import type { ReactEditorApi } from "../../editor/types";

/** Result of retaining a source editor for a mounted React consumer. */
interface AcquiredEditor {
  readonly editor?: ReactEditorApi;
  readonly error?: unknown;
}

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
  storage: EditorStorage | undefined,
  documentId: string | undefined,
): AcquiredEditor {
  const [result, setResult] = useState<AcquiredEditor>({});
  useEffect(() => {
    setResult({});
    if (!storage || !documentId) {
      return;
    }
    const controller = new AbortController();
    let release: (() => Promise<void>) | undefined;
    void storage
      .acquireEditor(documentId, { signal: controller.signal })
      .then((acquisition) => {
        release = acquisition.release;
        if (controller.signal.aborted) {
          void release().catch(console.error);
        } else {
          setResult({ editor: acquisition.editor });
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setResult({ error });
        }
      });
    return () => {
      controller.abort();
      void release?.().catch(console.error);
    };
  }, [storage, documentId]);
  return result;
}
