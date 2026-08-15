import type { CRDTDoc } from "./doc";

/** Disconnects one exact provider attachment. */
export type ProviderCleanup = () => Promise<void>;

/**
 * Interface representing a provider for synchronizing CRDT documents.
 */
export interface Provider {
    /**
     * A unique identifier for the provider.
     */
    get id(): string;

    /**
     * Connects the provider to the given CRDT document.
     * @param doc - The CRDT document to connect to.
     * @returns A Promise that resolves when the connection is established.
     */
    connect(doc: CRDTDoc): Promise<void>;

    /**
     * Disconnects the provider from the given CRDT document.
     * @param doc - The CRDT document to disconnect from.
     * @returns A Promise that resolves when the disconnection is complete.
     */
    disconnect(doc: CRDTDoc): Promise<void>;
}
