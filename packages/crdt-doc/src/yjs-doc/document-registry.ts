import * as Y from "yjs";
import type { DocumentCRDTRegistry } from "../types/document-registry";
import { YjsDoc } from "./yjs-doc";

/** Registry of lazily loaded document subdocuments. */
export class YjsDocumentRegistry implements DocumentCRDTRegistry {
  readonly root: YjsDoc;
  private readonly documents: Y.Map<Y.Doc>;

  /** @param workspaceId - Shared workspace channel namespace; must be nonempty. */
  constructor(private readonly workspaceId: string) {
    if (!workspaceId.trim()) throw new Error("Workspace ID is required");
    this.root = new YjsDoc(JSON.stringify([workspaceId, "registry"]));
    this.documents = this.root.doc.getMap("documents");
  }

  /** @param documentId - Stable document ID. @returns Whether registered. */
  hasDocument(documentId: string): boolean { return this.documents.has(documentId); }

  /** @returns IDs without loading their content. */
  getDocumentIds(): string[] { return [...this.documents.keys()]; }

  /** @param documentId - New document ID. @throws If empty or already registered. */
  registerDocument(documentId: string): void {
    if (!documentId.trim() || this.hasDocument(documentId)) throw new Error(`Invalid or registered document: ${documentId}`);
    this.root.transact(() => this.documents.set(documentId, new Y.Doc({
      guid: JSON.stringify([this.workspaceId, "document", documentId]),
      autoLoad: false,
      shouldLoad: false,
    })));
  }

  /** @param documentId - Registered ID. @returns Fresh wrapper of the current subdocument. @throws If unknown. */
  openDocument(documentId: string): YjsDoc {
    const doc = this.documents.get(documentId);
    if (!doc) throw new Error(`Unknown document: ${documentId}`);
    doc.load();
    return new YjsDoc(documentId, doc);
  }

  /** @param listener - Callback for registry changes. @returns Unsubscribe callback. */
  subscribe(listener: () => void): () => void { return this.root.on("update", listener); }
}
