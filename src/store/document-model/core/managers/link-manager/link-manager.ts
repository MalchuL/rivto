import type { BasicType, CRDTMap } from "../../../../crdt-doc";
import type { DocumentModel, Link } from "../../types";
import type { IDLink, LinkStorage } from "../../types/storage";
import { clone, isCRDTMap } from "../../utils";

const LINKS_KEY = "rivto.editor.links";

/**
 * Owns first-class link storage for one collaborative document.
 *
 * The manager validates block endpoints, materializes detached link values,
 * and removes invalid links when block operations delete their endpoints.
 */
export class DocumentLinkManager {
  /** Collaborative link container tracked by the owning document's undo manager. */
  readonly undoScopes: readonly [CRDTMap<Record<IDLink, CRDTMap<LinkStorage>>>];

  private readonly storage: CRDTMap<Record<IDLink, CRDTMap<LinkStorage>>>;

  /**
   * Creates a link manager over existing document storage.
   *
   * @param document - Owning document model providing CRDT and transaction boundaries.
   */
  constructor(private readonly document: DocumentModel) {
    this.storage = document.crdt.getMap<Record<IDLink, CRDTMap<LinkStorage>>>(LINKS_KEY);
    this.undoScopes = [this.storage];
  }

  /**
   * Resolves one link directly from the canonical collaborative map.
   *
   * @param id - Stable link identifier to resolve.
   * @returns Detached link data, or undefined when the link is absent or malformed.
   */
  getLink(id: string): Link | undefined {
    const value = this.storage.get(id);
    return isCRDTMap(value) ? this.readLink(value) : undefined;
  }

  /**
   * Materializes every valid first-class document link.
   *
   * @returns Detached links in collaborative map iteration order.
   */
  getLinks(): Link[] {
    return Array.from(this.storage.values()).flatMap((value) =>
      isCRDTMap(value) ? [this.readLink(value)] : [],
    );
  }

  /**
   * Creates or replaces a first-class link between existing blocks.
   *
   * @param link - Complete portable link record to persist.
   * @returns No value.
   * @throws {Error} When either endpoint references a missing block.
   */
  createLink(link: Link): void {
    this.document.transact(() => {
      if (!this.document.blocks.hasBlock(link.from.blockId) || !this.document.blocks.hasBlock(link.to.blockId)) {
        throw new Error("Link endpoints must reference existing blocks");
      }
      const model = this.document.crdt.instantiator.createMap<LinkStorage>();
      model.set("id", link.id);
      model.set("from", clone(link.from));
      model.set("to", clone(link.to));
      model.set("meta", clone(link.meta ?? {}) as Record<string, BasicType>);
      this.storage.set(link.id, model);
    });
  }

  /**
   * Removes one first-class link by its stable identifier.
   *
   * Missing identifiers are harmless and leave storage unchanged.
   *
   * @param id - Link identifier to remove.
   * @returns No value.
   */
  removeLink(id: string): void {
    this.document.transact(() => this.storage.delete(id));
  }

  /**
   * Replaces the complete link collection inside the caller's snapshot transaction.
   *
   * @param links - Portable links that become the complete stored collection.
   * @returns No value.
   * @throws {Error} When a supplied link references a missing block.
   */
  loadLinks(links: readonly Link[]): void {
    this.storage.clear();
    links.forEach((link) => this.createLink(link));
  }

  /**
   * Removes every link touching any supplied block identifier.
   *
   * This method is called from block mutations within their active transaction,
   * ensuring observers never see links whose endpoints have already disappeared.
   *
   * @param blockIds - Deleted block identifiers whose links are invalid.
   * @returns No value.
   */
  removeForBlockIds(blockIds: ReadonlySet<string>): void {
    for (const link of this.getLinks()) {
      if (blockIds.has(link.from.blockId) || blockIds.has(link.to.blockId)) {
        this.storage.delete(link.id);
      }
    }
  }

  /**
   * Converts one collaborative link record into detached portable data.
   *
   * @param value - Stored collaborative link map to read.
   * @returns Detached link value safe for callers to mutate.
   */
  private readLink(value: CRDTMap<LinkStorage>): Link {
    return {
      id: String(value.get("id")),
      from: clone(value.get("from") as Link["from"]),
      to: clone(value.get("to") as Link["to"]),
      meta: clone((value.get("meta") as Record<string, unknown> | undefined) ?? {}),
    };
  }
}
