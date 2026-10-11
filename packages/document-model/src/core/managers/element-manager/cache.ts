/**
 * Caches detached flat records, recursive subtrees, and their collections. The
 * manager observes storage and publishes changes after invalidation. Transaction
 * reads bypass every cache so in-flight writes cannot become stable snapshots.
 */
import type { DocumentElement, ElementNode } from "../../types";
import type { IDElement } from "../../types/storage";

/**
 * Preserves snapshot identity for flat records, recursive trees, and root collections. Flat descendant arrays are cached per container as well.
 *
 * This class does not observe storage or build snapshots itself. Its owner supplies
 * read callbacks and invalidates flat and recursive caches before notifying readers.
 * Cached objects are shared, so callers must treat returned values as read-only.
 */
export class ElementCache {
  private readonly elements = new Map<IDElement, ElementNode>();
  private collection?: ElementNode[];
  private readonly subtreeNodes = new Map<string, ElementNode[]>();
  private readonly forests = new Map<string | null, DocumentElement[]>();
  private readonly trees = new Map<string, DocumentElement>();
  private readonly parents = new Map<string, string | null>();

  /**
   * Reads a recursive snapshot without assembling unchanged subtrees again.
   *
   * Outside transactions, an existing tree is returned without calling create. A new
   * nonmissing result is cached; undefined is not. Transaction reads always call
   * create and neither consult nor populate the cache. The callback owns descendant
   * assembly and may reuse this cache for child reads.
   *
   * @param id - Stable ID of the element at the subtree root.
   * @param isTransacting - True while shared writes require uncached current reads.
   * @param create - Reads the current node and its child subtrees when no cache is used.
   * @returns Cached or newly assembled detached tree, or undefined for an absent record.
   * Treat a returned tree as read-only because subsequent readers may share it.
   */
  readTree(id: string, isTransacting: boolean, create: () => DocumentElement | undefined): DocumentElement | undefined {
    if (!isTransacting && this.trees.has(id)) return this.trees.get(id);
    const tree = create();
    if (tree && !isTransacting) this.trees.set(id, tree);
    return tree;
  }

  /**
   * Caches ordered root trees separately for each element container and the whole document.
   *
   * Both empty and nonempty arrays are retained outside transactions. Transaction
   * reads always call create without consulting or updating this cache. Root order
   * and recursive assembly are determined by the callback, not by this class.
   *
   * @param rootElementId - Container ID, or null for the document-wide root collection.
   * @param isTransacting - True to bypass caching while shared writes are in progress.
   * @param create - Materializes ordered roots, normally using readTree for subtrees.
   * @returns Read-only-by-convention root array with stable identity until its container
   * or a descendant is invalidated; document roots refresh after any element change.
   */
  readForest(rootElementId: string | null, isTransacting: boolean, create: () => DocumentElement[]): DocumentElement[] {
    if (isTransacting) return create();
    let roots = this.forests.get(rootElementId);
    if (!roots) { roots = create(); this.forests.set(rootElementId, roots); }
    return roots;
  }

  /**
   * Invalidates changed subtrees and both their previous and current ancestors.
   *
   * Previous parents are retained so moving or deleting a child also invalidates the
   * old ancestor chain. When locations is supplied, current ancestors are included
   * and the entire remembered parent map is replaced. Cycle guards stop repeated
   * ancestor visits. Unaffected subtree objects remain cached.
   *
   * Root arrays and flat descendant arrays for affected ancestors are removed.
   * The document-wide root array is removed after every element change. This method does not invalidate flat node caches,
   * write storage, or notify listeners; the owning manager performs those steps.
   *
   * @param ids - IDs whose fields or child lists changed, including deletions.
   * @param locations - Complete current ownership map after a structural change;
   * undefined for payload-only edits whose parent relationships are unchanged.
   * @returns Changed IDs and affected old/new ancestors whose recursive subscribers
   * need notification. The set includes nested and deleted nodes, not only document roots.
   */
  invalidateTrees(ids: ReadonlySet<string>, locations: ReadonlyMap<string, { parentId: string | null }> | undefined): Set<string> {
    this.forests.delete(null);
    const affected = new Set(ids);
    const addAncestors = (id: string, parentOf: (id: string) => string | null | undefined) => {
      const visited = new Set<string>();
      let parent = parentOf(id);
      while (parent && !visited.has(parent)) {
        visited.add(parent);
        affected.add(parent);
        parent = parentOf(parent);
      }
    };
    if (locations) {
      for (const [id, parent] of this.parents) {
        if (locations.get(id)?.parentId !== parent) affected.add(id);
      }
      for (const [id, location] of locations) {
        if (this.parents.get(id) !== location.parentId) affected.add(id);
      }
    }
    [...affected].forEach((id) => addAncestors(id, (key) => this.parents.get(key)));
    if (locations) {
      [...affected].forEach((id) => addAncestors(id, (key) => locations.get(key)?.parentId));
      this.parents.clear();
      locations.forEach((location, id) => this.parents.set(id, location.parentId));
    }
    affected.forEach((id) => {
      this.trees.delete(id);
      this.forests.delete(id);
      this.subtreeNodes.delete(id);
    });
    return affected;
  }


  /**
   * Reads one flat element snapshot, caching only existing records.
   *
   * Outside transactions, a cache hit skips create and a nonmissing result is retained.
   * Missing records are not cached. Transaction reads bypass both lookup and storage
   * of cached values so in-flight writes do not become stable snapshots.
   *
   * @param id - Stable element identity to read.
   * @param isTransacting - Whether a shared transaction is currently in progress.
   * @param create - Materializes the current flat record, or undefined when absent.
   * @returns Detached node or undefined. Treat returned nodes as read-only because
   * unchanged cached objects are shared between readers.
   */
  readNode(id: IDElement, isTransacting: boolean, create: () => ElementNode | undefined): ElementNode | undefined {
    const cached = isTransacting ? undefined : this.elements.get(id);
    if (cached) return cached;
    const element = create();
    if (element && !isTransacting) this.elements.set(id, element);
    return element;
  }

  /**
   * Reads the complete flat collection with stable identity outside transactions.
   *
   * The first callback result is cached, including an empty array, until invalidate
   * is called. Transaction reads always materialize current values without consulting
   * or updating the collection cache. This method does not sort or build nodes itself.
   *
   * @param isTransacting - Whether shared writes require an uncached collection read.
   * @param create - Materializes all current records in the intended storage order.
   * @returns Detached flat elements in the callback's order; treat the shared array
   * and its nodes as read-only.
   */
  readCollection(isTransacting: boolean, create: () => ElementNode[]): ElementNode[] {
    if (isTransacting) return create();
    this.collection ??= create();
    return this.collection;
  }

  /**
   * Reads flat descendants of one element without constructing recursive snapshots.
   * Cache entries are invalidated with the corresponding ancestor tree. Transaction
   * reads bypass both lookup and writes so transient records are not retained.
   * @param rootElementId - Container excluded from the returned descendant list.
   * @param isTransacting - Whether shared writes are currently in progress.
   * @param create - Builds descendants in hierarchy traversal order on a cache miss.
   * @returns Shared detached array, including an empty array for a missing container.
   * Callers must treat the array and its records as read-only.
   */
  readSubtreeNodes(rootElementId: string, isTransacting: boolean, create: () => ElementNode[]): ElementNode[] {
    if (isTransacting) return create();
    let nodes = this.subtreeNodes.get(rootElementId);
    if (!nodes) { nodes = create(); this.subtreeNodes.set(rootElementId, nodes); }
    return nodes;
  }

  /**
   * Drops changed flat node snapshots and the complete flat collection.
   *
   * The collection is discarded even when ids is empty. Unlisted individual nodes
   * remain cached. Recursive trees and root arrays are not affected; the owner must
   * also call invalidateTrees with the relevant hierarchy changes.
   *
   * @param ids - Element IDs changed or deleted by the transaction.
   * @returns No value; this only changes cache state and does not notify listeners.
   */
  invalidate(ids: ReadonlySet<IDElement>): void {
    ids.forEach((id) => this.elements.delete(id));
    this.collection = undefined;
  }
}
