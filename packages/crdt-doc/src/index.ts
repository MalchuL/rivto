/**
 * Adapter-neutral CRDT document contracts and the Yjs implementation.
 *
 * Native `yjs` imports stay inside `yjs-doc/`. Consumers should use `CRDTDoc`,
 * `CRDTMap`, `CRDTArray`, and `CRDTText` unless they need a Yjs-specific API.
 */
export {
  YjsDoc,
  BroadcastChannelProvider,
  WebRTCProvider,
  YjsError,
  YjsNotAttachedError,
  YjsUndefinedError,
  YjsArray,
  YjsMap,
  YjsText,
} from './yjs-doc';
export type { CRDTDoc, CRDTArray, CRDTMap, CRDTText,
              Unsubscribe, Provider, ProviderCleanup, BasicType, CRDTType,
              CRDTError, CRDTTextDelta, CRDTUndoManager, CRDTUndoScope,
              CRDTObserveEvent } from './types';

export { YjsDocumentRegistry } from "./yjs-doc/document-registry";
export type { DocumentCRDTRegistry } from "./types/document-registry";
