/**
 * Publishes the document-owned local history capability.
 * CRDT scope construction remains private to the document model and its
 * storage managers; consumers receive only focused undo operations.
 */
export { DocumentUndoManager } from "./undo-manager";
