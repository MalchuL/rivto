import type { DocumentModel } from "@chulane/document-model";
import { useCallback, useMemo, useSyncExternalStore } from "react";
import { getSideBlocks, type SideBlock, type SideBlockReader } from "./side-blocks-store";

/** Change subscription and namespace reads borrowed from a document. */
interface ObservableSideBlockReader extends SideBlockReader {
  /**
   * Observes changes to the document containing the side blocks.
   *
   * @param listener - Callback invoked when document data changes.
   * @returns Disposer removing this listener.
   */
  readonly subscribe: DocumentModel["subscribe"];
}

/**
 * Subscribes to detached side-block records for one borrowed document.
 *
 * The serialized snapshot remains stable across unrelated document changes.
 *
 * @param document - Document supplying plugin data and change notifications.
 * @returns Current valid side-block records in their persisted display order.
 */
export function useSideBlocks(document: ObservableSideBlockReader): readonly SideBlock[] {
  const subscribe = useCallback((listener: () => void) => document.subscribe(listener), [document]);
  const getSnapshot = useCallback(() => JSON.stringify(getSideBlocks(document)), [document]);
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return useMemo(() => JSON.parse(snapshot) as SideBlock[], [snapshot]);
}
