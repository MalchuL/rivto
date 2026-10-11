import type { CRDTArray, CRDTDoc, CRDTMap } from "@chulane/crdt-doc";
import type { ElementStorage } from "../../types/storage";
import type { ElementDestination, ElementSnapshot } from "../../types";
import { isCRDTArray, isCRDTMap } from "../../utils";

interface ElementLocation {
  parentId: string | null;
}

/**
 * Indexes canonical document roots and element children without storing a second owner.
 * Only structural writes invalidate this index; geometry and props reuse it.
 */
export class ElementHierarchy {
  private dirty = true;
  private locations = new Map<string, ElementLocation>();
  private roots: string[] = [];
  private children = new Map<string, string[]>();
  private readonly empty: readonly string[] = [];

  /**
   * @param crdt - Adapter used for transactional structural writes.
   * @param elements - Shared element records, each containing a child ID array.
   * @param rootIds - Shared ordered document root array, included in element undo history.
   */
  constructor(
    private readonly crdt: CRDTDoc,
    private readonly elements: CRDTMap<Record<string, CRDTMap<ElementStorage>>>,
    private readonly rootIds: CRDTArray<string>,
  ) {}

  /** Invalidates derived ownership after a root, child list, or record changes. */
  invalidate(): void { this.dirty = true; }

  /** @returns Indexed ownership of all placed elements; callers must not mutate it. */
  getLocations(): ReadonlyMap<string, ElementLocation> { this.refresh(); return this.locations; }

  /** @returns Stable ordered document roots, or an empty list when the document has no elements. */
  getRootIds(): readonly string[] { this.refresh(); return this.roots; }

  /** @returns Stable direct children, or an empty list for an unknown element. */
  getChildIds(id: string): readonly string[] { this.refresh(); return this.children.get(id) ?? this.empty; }

  /** @returns Direct parent (null for a document root), or undefined for an unknown element. */
  getLocation(id: string): ElementLocation | undefined { this.refresh(); return this.locations.get(id); }

  /**
   * Collects each selected subtree once in preorder, preserving selection order.
   * @param ids - Element roots; unknown IDs are ignored.
   * @returns Roots and descendants, without duplicates.
   */
  collect(ids: readonly string[]): string[] {
    this.refresh();
    const seen = new Set<string>();
    const visit = (id: string) => {
      if (seen.has(id) || !this.elements.has(id)) return;
      seen.add(id);
      this.getChildIds(id).forEach(visit);
    };
    ids.forEach(visit);
    return [...seen];
  }

  /**
   * Moves existing subtrees after validating the entire destination and selection.
   * Coordinates and descendant identities do not change when the parent changes.
   * @throws Before writing if IDs are missing, an anchor is invalid, or a cycle would result.
   */
  move(ids: readonly string[], destination: ElementDestination): void {
    this.refresh();
    const unique = [...new Set(ids)];
    const selected = new Set(unique);
    unique.forEach((id) => { if (!this.locations.has(id)) throw new Error(`Element ${id} not found`); });
    const roots = unique.filter((id) => {
      let parent = this.locations.get(id)?.parentId;
      while (parent) {
        if (selected.has(parent)) return false;
        parent = this.locations.get(parent)?.parentId;
      }
      return true;
    });
    const array = this.array(destination);
    const descendants = new Set(this.collect(roots));
    if (destination.parentId && descendants.has(destination.parentId)) throw new Error("Cannot move an element into its own subtree");
    if (destination.beforeId && (descendants.has(destination.beforeId)
      || !array.toArray().includes(destination.beforeId))) throw new Error("Invalid destination sibling");
    this.crdt.transact(() => {
      for (const id of roots) {
        const source = this.array(this.locations.get(id)!);
        const index = source.toArray().indexOf(id);
        if (index >= 0) source.delete(index, 1);
      }
      const index = destination.beforeId ? array.toArray().indexOf(destination.beforeId) : array.length;
      if (roots.length) array.insert(index, ...roots);
      this.invalidate();
    });
  }

  /** Removes references to selected records before the caller deletes their payloads. */
  detach(ids: readonly string[]): void {
    this.refresh();
    for (const id of ids) {
      const location = this.locations.get(id);
      if (!location) continue;
      const array = this.array(location);
      const index = array.toArray().indexOf(id);
      if (index >= 0) array.delete(index, 1);
    }
    this.invalidate();
  }

  /**
   * Appends a new record to a parent or the document roots inside the caller's transaction.
   * The caller validates the destination and inserts the record before this call.
   * @param id - Newly inserted element ID.
   * @param parentId - Existing parent, or null for document roots.
   */
  append(id: string, parentId: string | null): void {
    this.array({ parentId }).push(id);
    if (!this.dirty) {
      this.locations.set(id, { parentId });
      this.children.set(id, []);
      if (parentId === null) this.roots = [...this.roots, id];
      else this.children.set(parentId, [...this.children.get(parentId) ?? [], id]);
    }
  }

  /**
   * Repairs foreign merges using the same deterministic traversal as reads.
   * Missing and duplicate references are removed. Unreachable records are retained
   * at the document root, including records orphaned by concurrent deletion.
   */
  normalize(): void {
    this.refresh();
    this.crdt.transact(() => {
      this.replace(this.rootIds, this.roots);
      for (const [id, children] of this.children) {
        const value = this.elements.get(id);
        if (isCRDTMap(value)) this.replace(this.requiredArray(value.get("childIds")), children);
      }
    });
  }

  /** Validates one complete forest without changing either records or root lists. */
  static validate(elements: readonly Pick<ElementSnapshot, "id" | "childIds">[], rootIds: readonly string[]): void {
    const records = new Map(elements.map((element) => [element.id, element]));
    const seen = new Set<string>();
    const visit = (ids: readonly string[]) => {
      if (!Array.isArray(ids)) throw new Error("Element children and document roots must be arrays");
      for (const id of ids) {
        if (typeof id !== "string" || !records.has(id)) throw new Error(`Unknown element reference ${id}`);
        if (seen.has(id)) throw new Error(`Duplicate or cyclic element reference ${id}`);
        seen.add(id);
        visit(records.get(id)!.childIds);
      }
    };
    visit(rootIds);
    if (seen.size !== records.size) throw new Error("Every element must belong to the document tree");
  }

  /** Rebuilds after structural edits; the first placement in document traversal wins. */
  private refresh(): void {
    if (!this.dirty) return;
    this.dirty = false;
    const locations = new Map<string, ElementLocation>();
    const children = new Map<string, string[]>();
    const visit = (ids: Iterable<string>, parentId: string | null): string[] => {
      const result: string[] = [];
      for (const id of ids) {
        const value = this.elements.get(id);
        if (!isCRDTMap(value) || locations.has(id)) continue;
        locations.set(id, { parentId });
        result.push(id);
        children.set(id, this.reuse(this.children.get(id), visit(this.requiredArray(value.get("childIds")).toArray().map(String), id)));
      }
      return result;
    };
    const roots = visit(this.rootIds.toArray().map(String), null);
    // Concurrent deletion can leave records unreachable. Retain their payloads
    // as document roots so normalization and undo do not silently discard data.
    const orphans = [...this.elements.keys()].filter((id) => !locations.has(id)).sort();
    roots.push(...visit(orphans, null));
    this.roots = this.reuse(this.roots, roots);
    this.locations = locations;
    this.children = children;
  }

  /** Resolves the collaborative list for a parent, or the document root array. */
  private array(location: ElementLocation): CRDTArray<string> {
    if (location.parentId === null) return this.rootIds;
    const value = this.elements.get(location.parentId);
    if (!isCRDTMap(value)) throw new Error("Element destination not found");
    return this.requiredArray(value.get("childIds"));
  }

  /** Rejects malformed shared storage rather than silently dropping its contents. */
  private requiredArray(value: unknown): CRDTArray<string> {
    if (!isCRDTArray(value)) throw new Error("Invalid element hierarchy array");
    return value as CRDTArray<string>;
  }

  /** Preserves array identity when a structural change occurred in a different list. */
  private reuse(previous: string[] | undefined, next: string[]): string[] {
    return previous?.length === next.length && previous.every((id, index) => id === next[index]) ? previous : next;
  }

  /** Applies only changed lists, keeping CRDT container identities intact. */
  private replace(array: CRDTArray<string>, ids: readonly string[]): void {
    const previous = array.toArray();
    if (previous.length === ids.length && previous.every((id, index) => id === ids[index])) return;
    array.delete(0, array.length);
    if (ids.length) array.insert(0, ...ids);
  }
}
