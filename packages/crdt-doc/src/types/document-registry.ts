import type { CRDTDoc } from "./doc";

/** Adapter-neutral registry used by host-owned document storage. */
export interface DocumentCRDTRegistry {
  /** Small workspace document synchronized independently of document content. */
  readonly root: CRDTDoc;
  /** @param documentId - Stable document identity. @returns Whether registered. */
  hasDocument(documentId: string): boolean;
  /** @returns Registered document IDs, including unloaded documents. */
  getDocumentIds(): string[];
  /** @param documentId - New stable identity. @throws If already registered. */
  registerDocument(documentId: string): void;
  /** @param documentId - Registered identity. @returns A loaded adapter; caller owns destruction. @throws If unknown. */
  openDocument(documentId: string): CRDTDoc;
  /** @param listener - Registry change callback. @returns Unsubscribe callback. */
  subscribe(listener: () => void): () => void;
}
