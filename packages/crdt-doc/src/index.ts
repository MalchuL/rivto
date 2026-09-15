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
} from './yjs-doc';
export type { CRDTDoc, CRDTArray, CRDTMap, CRDTText,
              Unsubscribe, Provider, ProviderCleanup, CRDTInstantiator, BasicType, CRDTType,
              CRDTError, CRDTTextDelta, CRDTUndoManager, CRDTUndoScope } from './types';
