import { useCallback, useSyncExternalStore } from "react";
import { useReactPanel } from "../editor/use-react-panel";

/**
 * Observes the annotations supplied with a registered block definition.
 *
 * The snapshot is the current metadata reference, not a document subscription.
 * Registering or removing a complete definition triggers a reread, so all panels
 * using the runtime observe its metadata. Direct mutation of metadata is not observed.
 *
 * @param type - Native type to observe, or undefined when no parent type exists.
 * @returns Current opaque annotations, or undefined for missing/unannotated types.
 * @throws If called outside a React panel context.
 */
export function useBlockTypeMetadata(type: string | undefined) {
  const { blockTypes } = useReactPanel().editor;
  /**
   * Observes creation and removal of complete definitions and their annotations.
   *
   * @param listener - External-store callback requesting a snapshot reread.
   * @returns Cleanup removing this hook's subscriptions.
   */
  const subscribe = useCallback(
    (listener: () => void) => blockTypes.subscribe(listener),
    [blockTypes],
  );
  /**
   * Reads the observed type's current annotation reference without cloning it.
   *
   * @returns Metadata, or undefined for an absent type or annotation record.
   */
  const snapshot = useCallback(
    () => (type ? blockTypes.getDefinition(type)?.metadata : undefined),
    [blockTypes, type],
  );
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
