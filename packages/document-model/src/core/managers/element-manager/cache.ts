/**
 * Caches detached element records and their complete collection. The manager
 * observes storage and publishes changes after invalidation. Transaction reads
 * bypass both caches so in-flight writes cannot become stable snapshots.
 */
import type { DocumentElement } from "../../types";
import type { IDElement } from "../../types/storage";

/** Owns per-element and collection snapshot identity. */
export class ElementCache {
  private readonly elements = new Map<IDElement, DocumentElement>();
  private collection?: DocumentElement[];

  /**
   * Reads one element snapshot, caching only existing records.
   * @param id - Element identity.
   * @param isTransacting - Whether a transaction is currently in progress.
   * @param create - Materializes the current record, if present.
   * @returns Detached element or undefined.
   */
  readElement(id: IDElement, isTransacting: boolean, create: () => DocumentElement | undefined): DocumentElement | undefined {
    const cached = isTransacting ? undefined : this.elements.get(id);
    if (cached) return cached;
    const element = create();
    if (element && !isTransacting) this.elements.set(id, element);
    return element;
  }

  /**
   * Reads the complete collection with stable identity outside transactions.
   * @param isTransacting - Whether a transaction is currently in progress.
   * @param create - Materializes the current collection.
   * @returns Detached elements in storage order.
   */
  readCollection(isTransacting: boolean, create: () => DocumentElement[]): DocumentElement[] {
    if (isTransacting) return create();
    this.collection ??= create();
    return this.collection;
  }

  /**
   * Drops changed element records and the complete collection.
   * @param ids - Element identities affected by the transaction.
   * @returns No value.
   */
  invalidate(ids: ReadonlySet<IDElement>): void {
    ids.forEach((id) => this.elements.delete(id));
    this.collection = undefined;
  }
}
