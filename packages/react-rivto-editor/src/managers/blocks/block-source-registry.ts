import type { PanelAPI } from "@chulane/rivto";
import { RevisionStore } from "../../internal-store";
import type { RegistrationOwner } from "../extensions/types";

/** Persistent identity of a collection provided by an editor extension. */
export interface BlockSourceAddress {
  /** Stable registered source identity. */
  readonly sourceId: string;
  /** Stable collection identity within that source. */
  readonly collectionId: string;
}

/** Extension-owned lookup and protected panel creation for persisted block collections. */
export interface BlockSource {
  /** Stable identity shared by editors that can open this source. */
  readonly id: string;
  /**
   * Locates a block in a persisted collection owned by this editor.
   *
   * @param blockId - Document-local block identity.
   * @returns Stable collection identity, or undefined when the source does not contain it.
   * @throws If the source cannot read its collection index.
   */
  find(blockId: string): string | undefined;
  /**
   * Checks whether a collection can currently be opened.
   *
   * @param collectionId - Stable collection identity.
   * @returns Whether this source currently owns that collection.
   * @throws If the source cannot read the collection.
   */
  has(collectionId: string): boolean;
  /**
   * Checks whether a collection currently contains the addressed block.
   *
   * @param collectionId - Stable collection identity.
   * @param blockId - Block identity within the collection.
   * @returns Whether the block exists in the collection.
   * @throws If the source cannot read the collection.
   */
  hasBlock(collectionId: string, blockId: string): boolean;
  /**
   * Observes collection existence and block changes, including restoration.
   *
   * @param collectionId - Stable collection identity, including a missing collection.
   * @param listener - Callback invoked after source data changes.
   * @returns Disposer for this observation.
   * @throws If observation cannot be established.
   */
  subscribe(collectionId: string, listener: () => void): () => void;
  /**
   * Creates a protected subtree panel over one persisted collection.
   *
   * @param collectionId - Stable identity returned by this source's lookup.
   * @param blockId - Block displayed as the protected subtree root.
   * @returns A borrowed panel, or undefined when the collection cannot be opened.
   * @throws If the source cannot construct its panel.
   */
  createPanel(collectionId: string, blockId: string): PanelAPI | undefined;
}

/** Source registration and lookup borrowed by embedding extensions and views. */
export interface BlockSourcesApi {
  /** Revision of installed source registrations. */
  readonly revision: number;
  /**
   * Observes source registration changes.
   *
   * @param listener - Callback invoked after registration changes.
   * @returns Disposer for this subscription.
   */
  subscribe(listener: () => void): () => void;
  /**
   * Adds one extension-owned source.
   *
   * @param source - Source with a unique stable identity.
   * @returns Idempotent disposer for the registration.
   * @throws If the runtime is destroyed, the identity is empty or duplicated, or publication fails.
   */
  register(source: BlockSource): () => void;
  /**
   * Finds one unambiguous collection containing a block.
   *
   * @param blockId - Document-local block identity.
   * @returns Its source address, or undefined when absent or ambiguous.
   * @throws If a source lookup fails.
   */
  find(blockId: string): BlockSourceAddress | undefined;
  /**
   * Checks whether a registered source currently owns a collection.
   *
   * @param address - Persisted source and collection identity.
   * @returns Whether the collection can currently be opened.
   * @throws If its source lookup fails.
   */
  has(address: BlockSourceAddress): boolean;
  /**
   * Checks whether a registered collection contains a block.
   *
   * @param address - Persisted source and collection identity.
   * @param blockId - Block identity within the collection.
   * @returns Whether the block currently exists in that collection.
   * @throws If its source lookup fails.
   */
  hasBlock(address: BlockSourceAddress, blockId: string): boolean;
  /**
   * Observes an addressed collection while its source is registered.
   *
   * @param address - Persistent source and collection identity.
   * @param listener - Callback invoked after source data changes.
   * @returns Disposer for the source observation, or a no-op when unregistered.
   * @throws If the source cannot establish observation.
   */
  subscribeCollection(address: BlockSourceAddress, listener: () => void): () => void;
  /**
   * Creates a protected subtree panel from a registered source.
   *
   * @param address - Persisted source and collection identity.
   * @param blockId - Block to display as the protected root.
   * @returns Panel, or undefined when the source or collection cannot be opened.
   * @throws If source creation fails or the returned panel does not protect the requested root.
   */
  createPanel(address: BlockSourceAddress, blockId: string): PanelAPI | undefined;
}

/** Registered persistent block collections, scoped to one editor runtime. */
export class BlockSourceRegistry implements BlockSourcesApi {
  private readonly sources = new Map<string, BlockSource>();
  private readonly store = new RevisionStore();

  /**
   * Creates a registry whose registrations belong to the editor extension lifecycle.
   *
   * @param owner - Extension lifecycle retaining exact registration disposers.
   */
  constructor(private readonly owner: RegistrationOwner) {
    owner.registerCleanup(() => this.store.clear());
  }

  /**
   * Reads the revision of installed block-source registrations.
   *
   * @returns Monotonic revision advanced when a source is added or removed.
   */
  get revision(): number {
    return this.store.revision;
  }

  /**
   * Observes additions and removals of source registrations.
   *
   * @param listener - Callback invoked when registrations change.
   * @returns Disposer for this subscription.
   */
  subscribe(listener: () => void): () => void {
    return this.store.subscribe(listener);
  }

  /**
   * Registers a collection source until its extension or disposer releases it.
   *
   * @param source - Source with a unique, nonempty stable identity.
   * @returns Idempotent disposer for this exact registration.
   * @throws If the runtime is destroyed, the source ID is empty or duplicated, or publication fails.
   */
  register(source: BlockSource): () => void {
    this.owner.assertActive();
    const id = source.id;
    if (!id.trim() || this.sources.has(id)) {
      throw new Error(`Block source ${id} is invalid or already registered`);
    }
    this.sources.set(id, source);
    const dispose = this.owner.registerCleanup(() => {
      if (this.sources.get(id) === source) {
        this.sources.delete(id);
        this.store.changed();
      }
    });
    try {
      this.store.changed();
    } catch (error) {
      try {
        dispose();
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], "Block source registration failed");
      }
      throw error;
    }
    return dispose;
  }

  /**
   * Finds one unambiguous registered collection containing the requested block.
   *
   * @param blockId - Block identity to locate in this editor's collections.
   * @returns Its address, or undefined if absent or present in multiple sources.
   * @throws If a source lookup fails.
   */
  find(blockId: string): BlockSourceAddress | undefined {
    let match: BlockSourceAddress | undefined;
    for (const [sourceId, source] of this.sources) {
      const collectionId = source.find(blockId);
      if (!collectionId?.trim()) {
        continue;
      }
      if (match) {
        return undefined;
      }
      match = { sourceId, collectionId };
    }
    return match;
  }

  /**
   * Checks whether a currently registered source owns the requested collection.
   *
   * @param address - Persisted source and collection identity.
   * @returns Whether the source can open this collection.
   * @throws If its source lookup fails.
   */
  has(address: BlockSourceAddress): boolean {
    return this.sources.get(address.sourceId)?.has(address.collectionId) ?? false;
  }

  /**
   * Checks whether a block exists in one registered collection.
   *
   * @param address - Persisted source and collection identity.
   * @param blockId - Block identity within the collection.
   * @returns Whether that collection currently contains the block.
   * @throws If its source lookup fails.
   */
  hasBlock(address: BlockSourceAddress, blockId: string): boolean {
    return this.sources.get(address.sourceId)?.hasBlock(address.collectionId, blockId) ?? false;
  }

  /**
   * Observes one collection using its current registered source.
   *
   * @param address - Persistent source and collection identity.
   * @param listener - Callback invoked after source data changes.
   * @returns Disposer for the source observation, or a no-op when unregistered.
   * @throws If the source cannot establish observation.
   */
  subscribeCollection(address: BlockSourceAddress, listener: () => void): () => void {
    return (
      this.sources.get(address.sourceId)?.subscribe(address.collectionId, listener) ?? (() => {})
    );
  }

  /**
   * Creates a protected panel through a currently registered source.
   *
   * @param address - Persisted source and collection identity.
   * @param blockId - Root block to display and protect.
   * @returns The source panel, or undefined when its source or collection is unavailable.
   * @throws If source creation fails or the returned panel does not protect the requested root.
   */
  createPanel(address: BlockSourceAddress, blockId: string): PanelAPI | undefined {
    const source = this.sources.get(address.sourceId);
    if (!source?.has(address.collectionId)) {
      return undefined;
    }
    const panel = source.createPanel(address.collectionId, blockId);
    if (
      panel &&
      (panel.rootBlockId !== blockId ||
        !panel.blocks.includeRoot ||
        panel.blocks.canRemove(blockId))
    ) {
      throw new Error("Block source must return a panel with a protected reference root");
    }
    return panel;
  }
}
