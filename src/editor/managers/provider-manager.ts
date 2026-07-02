import type { Provider } from "../../store/crdt-doc";
import type { DocumentModelImpl } from "../../store/document-model";

/** Attaches collaboration providers through the adapter-neutral document API. */
export class ProviderManager {
  /**
   * Creates a provider coordinator for one document.
   *
   * @param document - Document whose CRDT adapter owns provider attachment.
   */
  constructor(private readonly document: DocumentModelImpl) {}

  /**
   * Attaches and synchronizes a provider using the configured CRDT adapter.
   *
   * @param provider - Adapter-neutral provider to attach.
   */
  attach(provider: Provider): Promise<void> {
    return this.document.crdt.attachProvider(provider);
  }

  /** Detaches the current provider without destroying document content. */
  detach(): Promise<void> {
    return this.document.crdt.detachProvider();
  }
}
