/**
 * Defines normalized observation metadata shared by CRDT container adapters.
 *
 * `observe` on a map or array walks that container and every nested shared
 * map, array, and text. Each callback receives every nested change from one
 * transaction. Consumers can identify changed records from `path` and `keys`
 * without importing Yjs event classes. The `transaction` argument is an opaque
 * identity so higher layers can coalesce related container notifications.
 *
 * @module
 */

/**
 * One nested change inside an observed CRDT map or array.
 *
 * `path` locates the shared value that changed, relative to the container
 * `observe` was called on. `keys` is filled only when that value is a map.
 *
 * Map observed as `doc.getMap("blocks")`:
 * - `blocks.set("b1", record)` → `{ path: [], keys: ["b1"] }`
 * - `blocks.get("b1").set("content", "hi")` → `{ path: ["b1"], keys: ["content"] }`
 * - `blocks.get("b1").get("children").push("c1")` → `{ path: ["b1", "children"], keys: [] }`
 *
 * Array observed as `doc.getArray("roots")`:
 * - `roots.push("b1")` → `{ path: [], keys: [] }`
 * - nested map at index 0 sets a field → `{ path: [0], keys: ["content"] }`
 *
 * Nested text (for example `blocks.get("b1").get("content").insert(0, "x")`):
 * `{ path: ["b1", "content"], keys: [] }`
 */
export interface CRDTObserveEvent {
    /**
     * Segments from the observed container to the shared value that changed.
     *
     * Empty when the observed map or array itself mutated. Map keys are
     * strings; array indexes are numbers. A nested text change uses the path
     * to that text, not a character offset.
     */
    readonly path: readonly (string | number)[];
    /**
     * Map keys mutated on the value at `path`.
     *
     * Empty for array inserts/deletes and for text edits. Several keys can
     * appear when one transaction updates multiple entries on the same map.
     */
    readonly keys: readonly string[];
}

/**
 * Deep observer function for a CRDT map or array.
 *
 * @param events - Normalized nested changes from a single transaction.
 * @param transaction - Opaque transaction identity shared by every observer
 *   that ran for this commit. Compare by reference to skip duplicate work.
 */
export type CRDTObserveHandler = (
    events: readonly CRDTObserveEvent[],
    transaction: unknown,
) => void;
