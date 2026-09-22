/**
 * Session-stable view of selected collaborative list-property flags.
 *
 * The document keeps storing and replicating every key. This cache remembers
 * the boolean value each block had when the editor first observed it, then
 * advances only for this editor's own transactions and for its undo/redo.
 * Remote transactions update the stored value without changing the cache, so
 * reads through the editor stay put until a new editor session (a page
 * reload) observes the replicated value again.
 *
 * The cache sits in front of `BlockManager` reads. `DocumentModel.getSnapshot`
 * still walks storage directly, so persistence and peers keep the replicated
 * value.
 *
 * @module
 */
import type { EditorBlock } from "../../editor/model";
import type { RivtoEditorApi } from "../../editor/types";

/** Cached projection of one block whose session flags differ from storage. */
interface ProjectionEntry {
  /** Document snapshot this projection was built from. */
  readonly source: EditorBlock;
  /** Session flags that differ from that snapshot, keyed by list-property name. */
  readonly overrides: Readonly<Record<string, boolean>> | undefined;
  /** Projected children, compared by identity with the next walk. */
  readonly children: readonly EditorBlock[];
  /** Stable projected block returned while the inputs above stay the same. */
  readonly value: EditorBlock;
}

/**
 * Owns pinned boolean list properties for one editor session.
 *
 * Callers pin a key such as `collapsed`. `project` then rewrites that flag on
 * detached block snapshots without writing back to the document.
 */
export class PinnedListProps {
  /** Keys whose editor reads stay on the session value. */
  private readonly keys = new Set<string>();
  /** Last replicated flag observed for each pinned key, including ignored remote edits. */
  private readonly seen = new Map<string, Map<string, boolean>>();
  /** Flag currently reported by editor reads for each pinned key. */
  private readonly held = new Map<string, Map<string, boolean>>();
  /** Identity-stable projections so repeated reads do not allocate new snapshots. */
  private readonly cache = new Map<string, ProjectionEntry>();
  /** Removes the document observer while at least one key is pinned. */
  private unsubscribe: (() => void) | undefined;

  /**
   * Creates an empty pin set for one editor.
   *
   * @param editor - Editor whose document supplies replicated flags and whose
   * history marks undo/redo transactions.
   */
  constructor(private readonly editor: RivtoEditorApi) {}

  /**
   * Reports whether any list-property key is pinned.
   *
   * @returns `true` when editor reads must project session flags.
   */
  get active(): boolean {
    return this.keys.size > 0;
  }

  /**
   * Pins one boolean list-property key to this editor session.
   *
   * Existing blocks are seeded from the current document. Later remote
   * changes to the key stay in storage. Local transactions and undo/redo
   * move the session value. Blocks created after the pin adopt the value
   * they have when they first appear.
   *
   * @param key - Non-empty list-property name, such as `collapsed`.
   * @returns Disposer that restores live reads for this key.
   * @throws {Error} When `key` is empty or already pinned.
   */
  pin(key: string): () => void {
    if (!key) throw new Error("List property name is required");
    if (this.keys.has(key)) throw new Error(`List property ${key} is already pinned`);
    const flags = new Map(this.editor.document.blocks.readListPropFlags(key));
    // Seed before the key becomes visible to the observer so a transaction
    // during registration cannot treat every block as newly created.
    this.seen.set(key, flags);
    this.held.set(key, new Map(flags));
    this.keys.add(key);
    this.ensureSubscription();
    let disposed = false;
    return () => {
      if (disposed) return;
      disposed = true;
      this.release(key);
    };
  }

  /**
   * Forces the session flag after a local write of a pinned key.
   *
   * A local write can repeat a value a remote peer already stored. The
   * document does not change, so the replication observer sees no diff, but
   * this editor still shows the value its user just wrote.
   *
   * @param key - Pinned list-property name. Unknown keys are ignored.
   * @param id - Block the local write targeted.
   * @param value - Boolean flag to show until a later local change or reload.
   * @returns No value.
   */
  holdLocal(key: string, id: string, value: boolean): void {
    if (!this.keys.has(key)) return;
    const held = this.held.get(key);
    if (!held || held.get(id) === value) return;
    held.set(id, value);
    this.cache.clear();
  }

  /**
   * Drops every pin and its document subscription.
   *
   * @returns No value.
   */
  destroy(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.keys.clear();
    this.seen.clear();
    this.held.clear();
    this.cache.clear();
  }

  /**
   * Returns a block snapshot whose pinned flags match this session.
   *
   * Unpinned editors receive the document snapshot unchanged. A projection is
   * cached against that snapshot so a second read in the same revision keeps
   * the same object identity.
   *
   * @param block - Detached document snapshot, including descendants.
   * @returns The original snapshot, or a session projection of it.
   */
  project(block: EditorBlock): EditorBlock {
    if (!this.active) return block;
    const children = block.children.map((child) => this.project(child));
    const overrides = this.overridesFor(block);
    const childrenChanged = children.some((child, index) => child !== block.children[index]);
    let value = block;
    if (overrides || childrenChanged) {
      const cached = this.cache.get(block.id);
      if (
        cached?.source === block
        && sameOverrides(cached.overrides, overrides)
        && sameChildren(cached.children, children)
      ) {
        value = cached.value;
      } else {
        value = {
          ...block,
          listProps: overrides ? { ...block.listProps, ...overrides } : block.listProps,
          children,
        };
        this.cache.set(block.id, { source: block, overrides, children, value });
      }
    }
    return value;
  }

  /**
   * Subscribes once for every pinned key.
   *
   * The observer runs after integration and before block listeners, so a
   * local edit is already in the session map when React reads the block.
   *
   * @returns No value.
   */
  private ensureSubscription(): void {
    if (this.unsubscribe) return;
    this.unsubscribe = this.editor.document.crdt.onBeforeObservers((origin) => {
      this.adopt(origin);
    });
  }

  /**
   * Records replicated flags and advances the session view for local history.
   *
   * New block ids always take the value they appear with. Existing ids change
   * only for this editor's origin or while undo/redo is applying. Remote
   * edits still update `seen`, so a later local transaction that does not
   * touch the key — including document repair after a remote update — does
   * not copy that remote value into the session view.
   *
   * @param origin - Origin of the integrated transaction.
   * @returns No value.
   */
  private adopt(origin: unknown): void {
    const followExisting = origin === this.editor.document.origin || this.editor.history.isApplyingHistory;
    let heldChanged = false;
    for (const key of this.keys) {
      const next = this.editor.document.blocks.readListPropFlags(key);
      const seen = this.seen.get(key);
      const held = this.held.get(key);
      if (!seen || !held) continue;
      for (const [id, value] of next) {
        const known = seen.has(id);
        if (!known || (followExisting && seen.get(id) !== value)) {
          held.set(id, value);
          heldChanged = true;
        }
        seen.set(id, value);
      }
      for (const id of [...seen.keys()]) {
        if (next.has(id)) continue;
        seen.delete(id);
        if (held.delete(id)) heldChanged = true;
        this.cache.delete(id);
      }
    }
    if (heldChanged) this.cache.clear();
  }

  /**
   * Collects pinned flags that differ from one stored snapshot.
   *
   * @param block - Snapshot whose list properties are compared with the session.
   * @returns Overrides to apply, or `undefined` when the snapshot already matches.
   */
  private overridesFor(block: EditorBlock): Record<string, boolean> | undefined {
    let overrides: Record<string, boolean> | undefined;
    for (const key of this.keys) {
      const heldValue = this.held.get(key)?.get(block.id) === true;
      if ((block.listProps[key] === true) === heldValue) continue;
      overrides ??= {};
      overrides[key] = heldValue;
    }
    return overrides;
  }

  /**
   * Removes one pin and the subscription when no keys remain.
   *
   * @param key - List-property name previously passed to `pin`.
   * @returns No value.
   */
  private release(key: string): void {
    this.keys.delete(key);
    this.seen.delete(key);
    this.held.delete(key);
    this.cache.clear();
    if (this.keys.size > 0 || !this.unsubscribe) return;
    this.unsubscribe();
    this.unsubscribe = undefined;
  }
}

/**
 * Compares two override records by key and boolean value.
 *
 * @param left - Overrides cached with a projection.
 * @param right - Overrides computed for the current snapshot.
 * @returns Whether both records describe the same flags.
 */
function sameOverrides(
  left: Readonly<Record<string, boolean>> | undefined,
  right: Readonly<Record<string, boolean>> | undefined,
): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  const leftKeys = Object.keys(left);
  if (leftKeys.length !== Object.keys(right).length) return false;
  return leftKeys.every((key) => left[key] === right[key]);
}

/**
 * Compares projected children by object identity.
 *
 * @param left - Children stored on the cached projection.
 * @param right - Children produced by the current walk.
 * @returns Whether both lists are the same length and the same objects.
 */
function sameChildren(left: readonly EditorBlock[], right: readonly EditorBlock[]): boolean {
  return left.length === right.length && left.every((child, index) => child === right[index]);
}
