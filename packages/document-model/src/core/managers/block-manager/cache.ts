/**
 * Stores detached block snapshots, path hints, and the placed-parent index.
 * The manager supplies plain child IDs and owns CRDT observation and subscriber
 * notifications. Transaction reads bypass the detached snapshots.
 */
import type { Block, BlockNode } from "../../types";
import type { IDBlock } from "../../types/storage";

type ParentId = IDBlock | null;
type ReadChildren = (parentId: ParentId) => readonly IDBlock[] | undefined;

/** Owns cached block values and the derived placement index. */
export class BlockCache {
  /** Recursive snapshots share child objects instead of copying subtrees. */
  private readonly blocks = new Map<IDBlock, Block>();
  /** Own-field nodes change only for their fields or direct child lists. */
  private readonly nodes = new Map<IDBlock, BlockNode>();
  /** Child arrays retain identity when only the parent's fields change. */
  private readonly childIds = new Map<IDBlock, string[]>();
  private rootIds?: string[];
  /**
   * Each path is a sequence of zero-based positions in sibling arrays.
   * For example, [1, 2] means roots[1], then that block's children[2].
   * The ID is the map key; indexes only locate it and can shift after moves,
   * so the manager checks the ID at the path before reusing the hint.
   */
  private readonly paths = new Map<IDBlock, readonly number[]>();
  /** First structural parent for each placed block. */
  private readonly parents = new Map<IDBlock, ParentId>();
  /** Previous direct memberships reveal IDs removed from an observed array. */
  private readonly indexedChildren = new Map<ParentId, readonly IDBlock[]>();
  /** Duplicate placements require a full traversal in tree order. */
  private hasDuplicates = false;
  /** Last transaction that rebuilt the complete parent index. */
  private lastParentTransaction?: unknown;

  /**
   * Creates a cache backed by read-only access to current plain IDs.
   * @param readChildren - Reads root or block child IDs without exposing storage.
   * @param hasRecord - Reports whether a block record still exists.
   */
  constructor(
    private readonly readChildren: ReadChildren,
    private readonly hasRecord: (id: IDBlock) => boolean,
  ) {}

  /** @param id - Block identity. @returns Last known tree path, if any. */
  getPath(id: IDBlock): readonly number[] | undefined { return this.paths.get(id); }

  /** @param id - Block identity. @param path - Validated path. @returns No value. */
  setPath(id: IDBlock, path: readonly number[]): void { this.paths.set(id, path); }

  /** @param id - Block identity. @returns No value after dropping its path. */
  deletePath(id: IDBlock): void { this.paths.delete(id); }

  /** @returns No value after dropping all path hints. */
  clearPaths(): void { this.paths.clear(); }

  /**
   * Reads only the immediate parent; it does not walk toward the root.
   * @param id - Block identity to look up.
   * @returns Parent ID, null for a root, or undefined when unplaced.
   */
  getParentId(id: IDBlock): ParentId | undefined { return this.parents.get(id); }

  /** @param id - Block identity. @returns Whether the block is indexed as placed. */
  hasParent(id: IDBlock): boolean { return this.parents.has(id); }

  /** @param parentId - Array owner, or null for roots. @returns Last indexed direct children. */
  getIndexedChildren(parentId: ParentId): readonly IDBlock[] { return this.indexedChildren.get(parentId) ?? []; }

  /** @returns Whether tree order can change the first parent of a duplicate placement. */
  hasDuplicatePlacements(): boolean { return this.hasDuplicates; }

  /** @returns A stable copy of parent links before an observed hierarchy change. */
  snapshotParents(): ReadonlyMap<IDBlock, ParentId> { return new Map(this.parents); }

  /**
   * Walks each indexed parent chain to the root. Unlike `getParentId`, this
   * collects every ancestor and includes each starting ID by default.
   * Input IDs are processed in iteration order. Each new chain adds its
   * starting ID first, then parents upward, with the root last if not already
   * present; shared ancestors keep their first insertion position.
   * @param ids - Changed IDs whose ancestor chains are needed.
   * @param startAtParent - Start at each immediate parent, excluding the IDs themselves.
   * @returns Affected IDs in first-visit order.
   */
  getAncestorIds(ids: Iterable<IDBlock>, startAtParent = false): Set<IDBlock> {
    const affected = new Set<IDBlock>();
    for (const id of ids) {
      let current: IDBlock | null | undefined = startAtParent ? this.parents.get(id) : id;
      while (current != null && !affected.has(current)) {
        affected.add(current);
        current = this.parents.get(current);
      }
    }
    return affected;
  }

  /**
   * Updates parent links from observed arrays, rebuilding when changed arrays
   * cannot be reconciled independently (such as a root-to-child transfer).
   * @param changedParents - Changed array owners, or omitted to rebuild.
   * @param transaction - Adapter transaction identity for rebuild deduplication.
   * @returns No value.
   */
  refreshParents(
    changedParents?: ReadonlySet<ParentId>,
    transaction?: unknown,
  ): void {
    if (transaction !== undefined && this.lastParentTransaction === transaction) return;
    if (changedParents && this.refreshChangedParents(changedParents)) return;

    this.lastParentTransaction = transaction;
    this.parents.clear();
    this.indexedChildren.clear();
    this.hasDuplicates = false;
    /**
     * Indexes one placed sibling array in depth-first order.
     * @param ids - Plain IDs in one sibling array.
     * @param parentId - Owner of that array, or null for roots.
     * @returns No value.
     */
    const visit = (ids: readonly IDBlock[], parentId: ParentId): void => {
      const children: IDBlock[] = [];
      ids.forEach((id) => {
        children.push(id);
        // The first placement in depth-first order owns the parent link.
        if (this.parents.has(id)) {
          this.hasDuplicates = true;
          return;
        }
        this.parents.set(id, parentId);
        const descendants = this.readChildren(id);
        if (descendants) visit(descendants, id);
      });
      this.indexedChildren.set(parentId, children);
    };
    visit(this.readChildren(null) ?? [], null);
  }

  /**
   * Reconciles changed sibling arrays and newly attached subtrees. Ambiguous
   * placements request a full tree walk from `refreshParents`.
   * @param changedParents - Root or block IDs owning changed arrays.
   * @returns True when the index was updated without a full traversal.
   */
  private refreshChangedParents(changedParents: ReadonlySet<ParentId>): boolean {
    if (this.hasDuplicates) return false;
    const current = new Map<ParentId, readonly IDBlock[]>();
    const nextParents = new Map<IDBlock, ParentId>();
    const previousChildren = new Set<IDBlock>();
    let currentCount = 0;
    for (const parentId of changedParents) {
      const ids = this.readChildren(parentId);
      if (!ids || (parentId !== null && !this.parents.has(parentId))) return false;
      ids.forEach((id) => {
        nextParents.set(id, parentId);
        currentCount += 1;
      });
      current.set(parentId, ids);
      this.getIndexedChildren(parentId).forEach((id) => previousChildren.add(id));
    }
    // Duplicate references, an unchanged source array, or a detached ID
    // placed elsewhere cannot be resolved from only the named arrays.
    if (currentCount !== nextParents.size) return false;
    const reparented: IDBlock[] = [];
    for (const [id, parentId] of nextParents) {
      const oldParent = this.parents.get(id);
      if (oldParent !== undefined && !changedParents.has(oldParent)) return false;
      if (oldParent !== parentId) reparented.push(id);
    }
    for (const id of previousChildren) {
      if (!nextParents.has(id) && this.hasRecord(id)) return false;
    }

    /**
     * Drops an indexed subtree removed from the named arrays.
     * @param id - Root ID of the removed subtree.
     * @returns No value.
     */
    const drop = (id: IDBlock): void => {
      for (const childId of this.getIndexedChildren(id)) {
        if (!nextParents.has(childId)) drop(childId);
      }
      this.indexedChildren.delete(id);
      this.parents.delete(id);
    };
    for (const id of previousChildren) {
      if (!nextParents.has(id)) drop(id);
    }
    current.forEach((ids, parentId) => this.indexedChildren.set(parentId, ids));
    const added = [...nextParents.keys()].filter((id) => !this.parents.has(id));
    nextParents.forEach((parentId, id) => this.parents.set(id, parentId));

    /**
     * Indexes descendants of a newly placed subtree without visiting others.
     * @param id - Newly placed subtree root.
     * @returns False when a duplicate or cycle requires a full rebuild.
     */
    const addDescendants = (id: IDBlock): boolean => {
      const children = this.readChildren(id);
      if (!children) return true;
      this.indexedChildren.set(id, children);
      for (const childId of children) {
        if (this.parents.has(childId)) return false;
        this.parents.set(childId, id);
        if (!addDescendants(childId)) return false;
      }
      return true;
    };
    for (const id of added) if (!addDescendants(id)) return false;
    for (const id of reparented) {
      const seen = new Set<IDBlock>();
      let currentId: IDBlock | null | undefined = id;
      while (currentId != null) {
        if (seen.has(currentId)) return false;
        seen.add(currentId);
        currentId = this.parents.get(currentId);
      }
    }
    return true;
  }

  /**
   * Invalidates recursive snapshots of old and new ancestors after reparenting.
   * @param previousParents - Parent index captured before the change.
   * @returns IDs whose recursive snapshots were dropped.
   */
  invalidateChangedParents(previousParents: ReadonlyMap<IDBlock, ParentId>): Set<IDBlock> {
    const affected = new Set<IDBlock>();
    const addAncestors = (start: IDBlock | null | undefined, parents: ReadonlyMap<IDBlock, ParentId>): void => {
      let current = start;
      while (current != null && !affected.has(current)) {
        affected.add(current);
        current = parents.get(current);
      }
    };
    const ids = new Set([...previousParents.keys(), ...this.parents.keys()]);
    ids.forEach((id) => {
      const previous = previousParents.get(id);
      const next = this.parents.get(id);
      if (previous === next) return;
      addAncestors(previous, previousParents);
      addAncestors(next, this.parents);
    });
    this.invalidate(affected);
    return affected;
  }

  /**
   * Reads a recursive snapshot, caching it outside transactions.
   * @param id - Block identity.
   * @param isTransacting - Whether a transaction is currently in progress.
   * @param create - Materializes the current recursive block.
   * @returns Current detached subtree.
   */
  readBlock(id: IDBlock, isTransacting: boolean, create: () => Block): Block {
    const cached = isTransacting ? undefined : this.blocks.get(id);
    if (cached) return cached;
    const block = create();
    if (!isTransacting) this.blocks.set(id, block);
    return block;
  }

  /**
   * Reads a frozen node, caching it outside transactions.
   * @param id - Block identity.
   * @param isTransacting - Whether a transaction is currently in progress.
   * @param create - Materializes own fields and direct child IDs.
   * @returns Current detached node.
   */
  readNode(id: IDBlock, isTransacting: boolean, create: () => BlockNode): BlockNode {
    const cached = isTransacting ? undefined : this.nodes.get(id);
    if (cached) return cached;
    const node = create();
    if (!isTransacting) this.nodes.set(id, this.freeze(node));
    return node;
  }

  /**
   * Reads a frozen direct-child list independently of the node's own fields.
   * @param id - Parent block identity.
   * @param isTransacting - Whether a transaction is currently in progress.
   * @param create - Reads the current collaborative child array.
   * @returns Direct child IDs in stored order.
   */
  readChildIds(id: IDBlock, isTransacting: boolean, create: () => string[]): string[] {
    const cached = isTransacting ? undefined : this.childIds.get(id);
    if (cached) return cached;
    const ids = create();
    if (!isTransacting) this.childIds.set(id, this.freeze(ids));
    return ids;
  }

  /**
   * Reads the ordered root list with stable identity outside transactions.
   * @param isTransacting - Whether a transaction is currently in progress.
   * @param create - Reads the current collaborative root array.
   * @returns Root IDs in stored order.
   */
  readRoots(isTransacting: boolean, create: () => string[]): string[] {
    if (isTransacting) return create();
    this.rootIds ??= this.freeze(create());
    return this.rootIds;
  }

  /** @returns No value after dropping the cached root list. */
  invalidateRoots(): void {
    this.rootIds = undefined;
  }

  /**
   * Drops stale snapshots before the manager publishes change notifications.
   * @param recursiveIds - Changed blocks and ancestors with stale subtrees.
   * @param nodeIds - Blocks with changed own fields.
   * @param childListIds - Blocks with changed direct child arrays.
   * @returns No value.
   */
  invalidate(
    recursiveIds: ReadonlySet<IDBlock>,
    nodeIds?: ReadonlySet<IDBlock>,
    childListIds?: ReadonlySet<IDBlock>,
  ): void {
    recursiveIds.forEach((id) => this.blocks.delete(id));
    nodeIds?.forEach((id) => this.nodes.delete(id));
    childListIds?.forEach((id) => {
      this.nodes.delete(id);
      this.childIds.delete(id);
    });
  }

  /**
   * Freezes a detached snapshot and its portable nested values.
   * @param value - Detached snapshot to protect.
   * @returns The same frozen snapshot.
   */
  private freeze<T>(value: T): T {
    if (value !== null && typeof value === "object") {
      Object.values(value).forEach((nested) => this.freeze(nested));
      Object.freeze(value);
    }
    return value;
  }
}
