import { CRDTDoc, CRDTUndoScope } from "@chulane/crdt-doc";
import {
  DocumentBlockManager,
  DocumentElementManager,
  DocumentPluginDataManager,
  DocumentHistoryManager,
} from "./managers";
import type {
  DocumentBlockManagerApi,
  DocumentElementManagerApi,
  DocumentHistoryManagerApi,
  DocumentModel,
  DocumentPluginDataManagerApi,
  Snapshot,
  SnapshotUpdate,
} from "./types";
import { assertPortableRecord, clone } from "./utils";

/** Default maximum number of entries in each document history stack. */
export const DEFAULT_MAX_HISTORY_ENTRIES = 100;

/** Construction settings for document-owned history. */
export interface DocumentModelOptions {
  /** Maximum actions in each history stack; defaults to 100 and zero disables history. This does not bound CRDT memory. */
  readonly maxHistoryEntries?: number;
}

/**
 * Coordinates collaborative document lifecycle through block and element managers.
 *
 * Block and element APIs live exclusively on their focused managers.
 * This class retains history construction, document-level plugin data,
 * subscriptions, and complete snapshot orchestration.
 */
export class DocumentModelImpl implements DocumentModel {
  /** Descriptive model identifier; persistence remains controlled by the CRDT document. */
  readonly id: string;
  /** Adapter-neutral collaborative document containing canonical shared state. */
  private readonly crdt: CRDTDoc;
  private blockManager?: DocumentBlockManager;
  private elementManager?: DocumentElementManager;
  private pluginDataManager?: DocumentPluginDataManager;
  private historyManager?: DocumentHistoryManagerApi;
  /** Removes the foreign-update normalization listener during destruction. */
  private readonly unsubscribeFromUpdates: () => void;
  /**
   * Initializes document-level storage and focused managers.
   *
   * Managers receive the CRDT adapter directly; none retain the coordinating
   * document model. Their collaborative scopes are collected after initial
   * normalization to create the document-owned history manager.
   *
   * After the initial tree repair, updates outside the adapter's local transaction
   * window and not marked local re-run block and element normalization. Local APIs
   * already keep parent/child lists consistent; foreign writes (providers, `applyUpdate`, undo, peers)
   * can merge into duplicate ids, missing refs, or orphans.
   *
   * @param crdt - Collaborative document owning identity and local transactions; this model destroys it during teardown.
   * @param options - Optional history settings for this document.
   * @param options.maxHistoryEntries - Maximum entries per undo and redo stack; defaults to 100.
   * @throws If the history limit is not a non-negative integer, or manager initialization fails.
   */
  constructor(crdt: CRDTDoc, options: DocumentModelOptions = {}) {
    const maxEntries = options.maxHistoryEntries ?? DEFAULT_MAX_HISTORY_ENTRIES;
    if (!Number.isInteger(maxEntries) || maxEntries < 0) {
      throw new RangeError("History limit must be a non-negative integer");
    }
    this.crdt = crdt;
    this.id = crdt.id;
    const blocks = this.createBlockManager(crdt);
    const elements = this.createElementManager(crdt);
    const pluginData = new DocumentPluginDataManager(crdt);
    blocks.normalize();
    elements.normalize();
    const undoScopes: CRDTUndoScope[] = [
      ...blocks.historyScopes,
      ...elements.historyScopes,
      ...pluginData.historyScopes,
    ];
    const history = new DocumentHistoryManager(crdt, undoScopes, maxEntries);
    this.blockManager = blocks;
    this.elementManager = elements;
    this.pluginDataManager = pluginData;
    this.historyManager = history;
    // Yjs `"update"` carries the transaction origin: the adapter's local token,
    // a provider instance, undo, or `null`/`undefined` from `applyUpdate`.
    // Skip local origin so we do not open a
    // second normalize transaction after every local write (redundant work and
    // extra undo stacks). The adapter's transaction window also identifies local
    // writes with an explicit origin, such as history-excluded card measurements.
    // Their different history policy must not cause a full-document repair scan.
    // Provider updates and native undo normally remain outside that window and
    // still repair merged hierarchy references. Repair only foreign merges.
    // TODO: Verify foreign updates during an adapter transaction are not skipped;
    // if possible, defer their normalization until the transaction finishes.
    this.unsubscribeFromUpdates = this.crdt.on(
      "update",
      (update: unknown, updateOrigin?: unknown) => {
        if (this.crdt.isTransacting || this.crdt.isLocalOrigin(updateOrigin)) {
          return;
        }
        blocks.normalize();
        elements.normalize();
      },
    );
  }

  /**
   * Provides this document's block records and hierarchy operations.
   *
   * @returns The document-owned block manager until teardown completes.
   * @throws If document teardown has completed.
   */
  get blocks(): DocumentBlockManagerApi {
    if (!this.blockManager) {
      throw new Error("Document model is destroyed");
    }
    return this.blockManager;
  }

  /**
   * Provides this document's canvas elements and geometry operations.
   *
   * @returns The document-owned element manager until teardown completes.
   * @throws If document teardown has completed.
   */
  get elements(): DocumentElementManagerApi {
    if (!this.elementManager) {
      throw new Error("Document model is destroyed");
    }
    return this.elementManager;
  }

  /**
   * Provides this document's namespaced plugin data operations.
   *
   * @returns The document-owned plugin data manager until teardown completes.
   * @throws If document teardown has completed.
   */
  get pluginData(): DocumentPluginDataManagerApi {
    if (!this.pluginDataManager) {
      throw new Error("Document model is destroyed");
    }
    return this.pluginDataManager;
  }

  /**
   * Provides local history and transaction batching for this document.
   *
   * @returns The document-owned history manager until teardown completes. Its
   * destruction is attempted before providers disconnect.
   * @throws If document teardown has completed.
   */
  get history(): DocumentHistoryManagerApi {
    if (!this.historyManager) {
      throw new Error("Document model is destroyed");
    }
    return this.historyManager;
  }

  /**
   * Creates block storage before initial normalization and history-scope collection.
   * Override to use an application manager; the default retains native document behavior.
   * Called during base construction, before subclass fields are initialized, so managers
   * must defer reading those fields until their operations run.
   * @param crdt - This document's collaborative adapter, already assigned with its ID.
   * @returns Block manager whose scopes are included in document history.
   */
  protected createBlockManager(crdt: CRDTDoc): DocumentBlockManager {
    return new DocumentBlockManager(crdt);
  }

  /**
   * Creates element storage before history-scope collection.
   * Override to use an application manager; the default retains native document behavior.
   * Called during base construction, before subclass fields are initialized, so managers
   * must defer reading those fields until their operations run.
   * @param crdt - This document's collaborative adapter, already assigned with its ID.
   * @returns Element manager whose scopes are included in document history.
   */
  protected createElementManager(crdt: CRDTDoc): DocumentElementManager {
    return new DocumentElementManager(crdt);
  }

  /**
   * Subscribes to local and remote collaborative document updates.
   *
   * @param listener - Callback invoked after a collaborative update.
   * @returns Function that removes the subscription.
   */
  subscribe(listener: () => void): () => void {
    return this.crdt.on("update", listener);
  }

  /**
   * Produces a lossless portable schema-v9 snapshot.
   *
   * @returns Detached blocks, elements, and document-level plugin data.
   */
  getSnapshot(): Snapshot {
    return {
      version: 9,
      blocks: clone(this.blocks.getBlocks()),
      elements: this.elements
        .getElementNodes()
        .map(({ id, type, childIds, frame, zIndex, props }) =>
          clone({ id, type, childIds, frame, zIndex, props }),
        ),
      rootElementIds: [...this.elements.getRootIds()],
      pluginData: this.pluginData.getAll(),
    };
  }

  /**
   * Applies supplied schema-v9 snapshot sections atomically.
   *
   * Every supplied section and its cross-references are validated before the
   * transaction begins. CRDT transactions do not roll back thrown writes, so
   * the transaction performs writes only.
   *
   * Complete snapshots replace the complete document. Partial updates replace
   * only present sections and leave omitted collaborative state unchanged.
   *
   * @param snapshot - Complete snapshot or partial persistence update.
   * @returns No value.
   * @throws {Error} When a supplied section is unsupported or cross-references
   * are invalid.
   */
  loadSnapshot(snapshot: SnapshotUpdate): void {
    if (snapshot.version !== 9) {
      throw new Error(`Unsupported Rivto document snapshot version: ${String(snapshot.version)}`);
    }
    if (
      (snapshot.blocks !== undefined && !Array.isArray(snapshot.blocks)) ||
      (snapshot.elements !== undefined && !Array.isArray(snapshot.elements))
    ) {
      throw new Error("Unsupported Rivto document snapshot");
    }
    const rootElementIds = snapshot.rootElementIds ?? this.elements.getRootIds();
    if (snapshot.blocks) {
      this.blocks.validateBlocks(snapshot.blocks);
    }
    if (snapshot.elements) {
      this.elements.validateElements(snapshot.elements);
    }
    this.elements.validateHierarchy(
      snapshot.elements ?? this.elements.getElementNodes(),
      rootElementIds,
    );
    if (snapshot.pluginData) {
      assertPortableRecord(snapshot.pluginData, "pluginData");
    }

    this.crdt.transact(() => {
      if (snapshot.rootElementIds) {
        this.elements.loadRootIds(snapshot.rootElementIds);
      }
      if (snapshot.blocks) {
        this.blocks.loadBlocks(snapshot.blocks);
      }
      if (snapshot.elements) {
        this.elements.loadElements(snapshot.elements);
      }
      if (snapshot.pluginData) {
        this.pluginData.load(snapshot.pluginData);
      }
    });
  }

  /**
   * Releases document-owned history, subscriptions, and collaborative storage.
   *
   * Cleanup continues after individual failures so CRDT providers are not leaked.
   * Block, element, and plugin-data managers remain available during provider
   * disconnection and are released after it settles, including when teardown fails.
   * History destruction is attempted before provider disconnection begins.
   *
   * @returns Promise resolved after asynchronous CRDT cleanup.
   * @throws A cleanup error, or an AggregateError when multiple cleanups fail.
   */
  async destroy(): Promise<void> {
    const errors: unknown[] = [];
    try {
      this.unsubscribeFromUpdates();
    } catch (error) {
      errors.push(error);
    }
    try {
      this.historyManager?.destroy();
    } catch (error) {
      errors.push(error);
    }
    try {
      await this.crdt.destroy();
    } catch (error) {
      errors.push(error);
    }
    for (const manager of [this.blockManager, this.elementManager, this.pluginDataManager]) {
      try {
        manager?.destroy();
      } catch (error) {
        errors.push(error);
      }
    }
    this.blockManager = undefined;
    this.elementManager = undefined;
    this.pluginDataManager = undefined;
    this.historyManager = undefined;
    if (errors.length === 1) {
      throw errors[0];
    }
    if (errors.length > 1) {
      throw new AggregateError(errors, "Document teardown failed");
    }
  }
}
