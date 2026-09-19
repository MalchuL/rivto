/**
 * Publishes the document-owned local history capability.
 * CRDT scope construction remains private to the document model and its
 * storage managers; consumers receive focused batching and history operations.
 */
export { DocumentHistoryManager } from "./history-manager";
