import { CRDTDoc, CRDTUndoScope, Unsubscribe } from "../../crdt-doc";
import {
  DocumentBlockManager,
  DocumentElementManager,
  DocumentLinkManager,
  DocumentPluginDataManager,
} from "./managers";
import type {
  DocumentModel,
  Snapshot,
  SnapshotUpdate,
} from "./types";
import { clone } from "./utils";

/**
 * Coordinates collaborative document lifecycle through block and link managers.
 *
 * Block, element, and link APIs live exclusively on their focused managers.
 * This class retains CRDT transactions, undo scope aggregation,
 * document-level plugin data, subscriptions, and complete snapshot orchestration.
 */
export class DocumentModelImpl implements DocumentModel {
  /** Descriptive model identifier; persistence remains controlled by the CRDT document. */
  readonly id: string;
  /** Adapter-neutral collaborative document containing canonical shared state. */
  readonly crdt: CRDTDoc;
  /** Stable local transaction origin used to scope undo history. */
  readonly origin = Symbol("rivto-document");
  /** Block records, text, hierarchy, and block snapshot behavior. */
  readonly blocks: DocumentBlockManager;
  /** Generic first-class canvas elements and their geometry. */
  readonly elements: DocumentElementManager;
  /** First-class link records and link snapshot behavior. */
  readonly links: DocumentLinkManager;
  /** Generic namespaced collaborative document plugin data. */
  readonly pluginData: DocumentPluginDataManager;
  /** Collaborative containers tracked by document undo managers. */
  readonly undoScopes: CRDTUndoScope[];

  /**
   * Creates a storage model over an adapter-neutral collaborative document.
   *
   * @param crdt - Collaborative document that owns the shared state.
   */
  constructor(crdt: CRDTDoc);
  /**
   * Creates a named storage model over a collaborative document.
   *
   * @param id - Descriptive model identifier; it does not control persistence.
   * @param crdt - Collaborative document that owns the shared state.
   */
  constructor(id: string, crdt: CRDTDoc);
  /**
   * Initializes document-level storage and focused managers.
   *
   * Managers retain this DocumentModel interface and resolve sibling managers
   * lazily, so constructor ordering does not create a dependency cycle.
   *
   * @param idOrCrdt - Descriptive identifier or the collaborative document.
   * @param maybeCrdt - Collaborative document when an identifier is supplied.
   * @throws {Error} When the named constructor form omits its document.
   */
  constructor(idOrCrdt: string | CRDTDoc, maybeCrdt?: CRDTDoc) {
    const crdt = typeof idOrCrdt === "string" ? maybeCrdt : idOrCrdt;
    if (!crdt) throw new Error("DocumentModelImpl requires a CRDTDoc");

    this.crdt = crdt;
    this.id = typeof idOrCrdt === "string" ? idOrCrdt : crdt.id;
    this.blocks = new DocumentBlockManager(this);
    this.elements = new DocumentElementManager(this);
    this.links = new DocumentLinkManager(this);
    this.pluginData = new DocumentPluginDataManager(this);
    this.undoScopes = [
      ...this.blocks.undoScopes,
      ...this.elements.undoScopes,
      ...this.links.undoScopes,
      ...this.pluginData.undoScopes,
    ];
    this.blocks.normalize();
  }

  /**
   * Subscribes to local and remote collaborative document updates.
   *
   * @param listener - Callback invoked after a collaborative update.
   * @returns Function that removes the subscription.
   */
  subscribe(listener: () => void): Unsubscribe {
    return this.crdt.on("update", listener);
  }

  /**
   * Executes one synchronous mutation under the model's local undo origin.
   *
   * @param operation - Mutation to execute atomically.
   * @returns No value.
   */
  transact(operation: () => void): void {
    this.crdt.transact(operation, this.origin);
  }

  /**
   * Produces a lossless portable schema-v6 snapshot.
   *
   * @returns Detached blocks, links, elements, and document-level plugin data.
   */
  getSnapshot(): Snapshot {
    return {
      version: 6,
      blocks: clone(this.blocks.getBlocks()),
      links: clone(this.links.getLinks()),
      elements: clone(this.elements.getElements()),
      pluginData: this.pluginData.getAll(),
    };
  }

  /**
   * Applies supplied schema-v6 snapshot sections atomically.
   *
   * Complete snapshots replace the complete document; partial updates replace
   * only present sections and leave omitted collaborative state unchanged.
   *
   * @param snapshot - Complete snapshot or partial persistence update.
   * @returns No value.
   * @throws {Error} When a supplied block or element collection is unsupported.
   */
  loadSnapshot(snapshot: SnapshotUpdate): void {
    if ((snapshot.blocks !== undefined && !Array.isArray(snapshot.blocks)) ||
      (snapshot.elements !== undefined && !Array.isArray(snapshot.elements))) {
      throw new Error("Unsupported Rivto document snapshot");
    }
    if (snapshot.blocks) this.blocks.validateBlocks(snapshot.blocks);
    if (snapshot.elements) this.elements.validateElements(snapshot.elements);

    this.transact(() => {
      if (snapshot.blocks) this.blocks.loadBlocks(snapshot.blocks);
      if (snapshot.links) this.links.loadLinks(snapshot.links);
      if (snapshot.elements) this.elements.loadElements(snapshot.elements);
      if (snapshot.pluginData) {
        this.pluginData.load(snapshot.pluginData);
      }
    });
  }
}
