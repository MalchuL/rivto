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
  /** Block records, text, hierarchy, and block snapshot behavior. */
  readonly blocks: DocumentBlockManagerApi;
  /** Generic first-class canvas elements and their geometry. */
  readonly elements: DocumentElementManagerApi;
  /** Generic namespaced collaborative document plugin data. */
  readonly pluginData: DocumentPluginDataManagerApi;
  /** Local history and batching configured from every document manager's roots. */
  readonly history: DocumentHistoryManagerApi;
  /** Removes the foreign-update normalization listener during destruction. */
  private readonly unsubscribeFromUpdates: () => void;
  /**
   * Initializes document-level storage and focused managers.
   *
   * Managers receive the CRDT adapter and private undo-scope accumulator
   * directly; none retain the coordinating document model.
   *
   * After the initial tree repair, updates not marked local by the CRDT adapter
   * re-run `blocks.normalize()`. Local APIs already keep parent/child
   * lists consistent; foreign writes (providers, `applyUpdate`, undo, peers)
   * can merge into duplicate ids, missing refs, or orphans.
   *
   * @param crdt - Collaborative document owning identity and local transactions.
   */
  constructor(crdt: CRDTDoc) {
    this.crdt = crdt;
    this.id = crdt.id;
    const blocks = new DocumentBlockManager(crdt);
    const elements = new DocumentElementManager(crdt);
    const pluginData = new DocumentPluginDataManager(crdt);
    blocks.normalize();
    const undoScopes: CRDTUndoScope[] = [
      ...blocks.historyScopes,
      ...elements.historyScopes,
      ...pluginData.historyScopes,
    ];
    const history = new DocumentHistoryManager(crdt, undoScopes);
    this.blocks = blocks;
    this.elements = elements;
    this.pluginData = pluginData;
    this.history = history;
    // Yjs `"update"` carries the transaction origin: the adapter's local token,
    // a provider instance, undo, or `null`/`undefined` from `applyUpdate`.
    // Skip local origin so we do not open a
    // second normalize transaction after every local write (redundant work and
    // extra undo stacks). Repair only foreign merges.
    this.unsubscribeFromUpdates = this.crdt.on("update", (_update: unknown, updateOrigin?: unknown) => {
      if (this.crdt.isLocalOrigin(updateOrigin)) return;
      blocks.normalize();
    });
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
   * Produces a lossless portable schema-v6 snapshot.
   *
   * @returns Detached blocks, elements, and document-level plugin data.
   */
  getSnapshot(): Snapshot {
    return {
      version: 6,
      blocks: clone(this.blocks.getBlocks()),
      elements: clone(this.elements.getElements()),
      pluginData: this.pluginData.getAll(),
    };
  }

  /**
   * Applies supplied schema-v6 snapshot sections atomically.
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
    if (snapshot.version !== 6) {
      throw new Error(`Unsupported Rivto document snapshot version: ${String(snapshot.version)}`);
    }
    if ((snapshot.blocks !== undefined && !Array.isArray(snapshot.blocks)) ||
      (snapshot.elements !== undefined && !Array.isArray(snapshot.elements))) {
      throw new Error("Unsupported Rivto document snapshot");
    }
    if (snapshot.blocks) this.blocks.validateBlocks(snapshot.blocks);
    if (snapshot.elements) this.elements.validateElements(snapshot.elements);
    if (snapshot.pluginData) assertPortableRecord(snapshot.pluginData, "pluginData");

    this.crdt.transact(() => {
      if (snapshot.blocks) this.blocks.loadBlocks(snapshot.blocks);
      if (snapshot.elements) this.elements.loadElements(snapshot.elements);
      if (snapshot.pluginData) this.pluginData.load(snapshot.pluginData);
    });
  }

  /**
   * Releases document-owned history, subscriptions, and collaborative storage.
   *
   * Cleanup continues after individual failures so CRDT providers are not leaked.
   *
   * @returns Promise resolved after asynchronous CRDT cleanup.
   */
  async destroy(): Promise<void> {
    const errors: unknown[] = [];
    try {
      this.unsubscribeFromUpdates();
    } catch (error) {
      errors.push(error);
    }
    try {
      this.history.destroy();
    } catch (error) {
      errors.push(error);
    }
    try {
      await this.crdt.destroy();
    } catch (error) {
      errors.push(error);
    }
    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) throw new AggregateError(errors, "Document teardown failed");
  }
}
