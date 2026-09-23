/**
 * Session-stable view of selected collaborative block fields.
 *
 * The document keeps storing and replicating every field. This cache remembers
 * the value each block had when the editor first observed a pinned field, then
 * advances only for this editor's own transactions and for its undo/redo.
 * Remote transactions update storage without changing the cache, so editor
 * reads stay put until a new editor session (a page reload) observes the
 * replicated value again.
 *
 * Pins cover block payload: `content`, `type`, a `listProps` / `props` /
 * `pluginData` entry, or one of those maps as a whole. Hierarchy stays shared.
 * `DocumentModel.getSnapshot` still reads storage, so persistence and peers
 * keep the replicated values.
 *
 * @module
 */
import type { BlockFieldValue, BlockPatch, BlockPayloadField } from "@chulane/document-model";
import type { EditorBlock } from "../../editor/model";
import type { RivtoEditorApi } from "../../editor/types";

/** One collaborative payload field, optionally narrowed to a map entry. */
export interface BlockFieldPin {
  /** Payload field whose editor reads stay on the session value. */
  readonly field: BlockPayloadField;
  /**
   * Entry inside `listProps`, `props`, or `pluginData`.
   * Omit to pin the whole map. `content` and `type` do not take a key.
   */
  readonly key?: string;
}

/** Cached projection of one block whose pinned fields differ from storage. */
interface ProjectionEntry {
  /** Document snapshot this projection was built from. */
  readonly source: EditorBlock;
  /** Held samples consulted while projecting this node, compared by identity. */
  readonly samples: readonly BlockFieldValue[];
  /** Projected children, compared by identity with the next walk. */
  readonly children: readonly EditorBlock[];
  /** Stable projected block returned while the inputs above stay the same. */
  readonly value: EditorBlock;
}

/** Map payload fields that can be pinned whole or by entry. */
type MapField = "listProps" | "props" | "pluginData";

/**
 * Owns pinned block payload for one editor session.
 *
 * Callers pin `content`, `type`, or a list, prop, or plugin-data field.
 * `project` rewrites those values on detached snapshots without writing
 * them back to the document.
 */
export class PinnedBlockFields {
  /** Active pins in registration order, keyed by {@link pinId}. */
  private readonly pins = new Map<string, BlockFieldPin>();
  /** Last replicated value observed for each pin, including ignored remote edits. */
  private readonly seen = new Map<string, Map<string, BlockFieldValue>>();
  /** Value currently reported by editor reads for each pin. */
  private readonly held = new Map<string, Map<string, BlockFieldValue>>();
  /** Identity-stable projections so repeated reads do not allocate new snapshots. */
  private readonly cache = new Map<string, ProjectionEntry>();
  /** Last root list returned while pins are active, reused while every root is unchanged. */
  private rootList: EditorBlock[] | undefined;
  /** Removes the document observer while at least one field is pinned. */
  private unsubscribe: (() => void) | undefined;

  /**
   * Creates an empty pin set for one editor.
   *
   * @param editor - Editor whose document supplies replicated fields and whose
   * history marks undo/redo transactions.
   */
  constructor(private readonly editor: RivtoEditorApi) {}

  /**
   * Reports whether any payload field is pinned.
   *
   * @returns `true` when editor reads must project session values.
   */
  get active(): boolean {
    return this.pins.size > 0;
  }

  /**
   * Pins one block payload field to this editor session.
   *
   * Existing blocks are seeded from the current document. Later remote
   * changes to that field stay in storage. Local transactions and undo/redo
   * move the session value. Blocks created after the pin adopt the value
   * they have when they first appear.
   *
   * @param target - Field to pin, with an optional map key.
   * @returns Disposer that restores live reads for this field.
   * @throws {Error} When the field is unsupported, the key does not belong on
   * that field, or the same field is already pinned.
   */
  pin(target: BlockFieldPin): () => void {
    const pin = normalizePin(target);
    const id = pinId(pin);
    if (this.pins.has(id)) throw new Error(`Block field ${id} is already pinned`);
    const readings = new Map(this.editor.document.blocks.readBlockFields(pin.field, pin.key));
    // Seed before the pin becomes visible to the observer so a transaction
    // during registration cannot treat every block as newly created.
    this.seen.set(id, readings);
    this.held.set(id, new Map(readings));
    this.pins.set(id, pin);
    this.ensureSubscription();
    let disposed = false;
    return () => {
      if (disposed) return;
      disposed = true;
      this.release(id);
    };
  }

  /**
   * Copies live values into the session after a local block patch.
   *
   * A local write can repeat a value a remote peer already stored. The
   * document does not change, so the replication observer sees no diff, but
   * this editor still shows the value its user just wrote.
   *
   * @param id - Block the local patch targeted.
   * @param patch - Fields included in that patch.
   * @returns No value.
   */
  holdPatch(id: string, patch: BlockPatch): void {
    this.holdLocal(id, (pin) => patchTouches(pin, patch));
  }

  /**
   * Copies live content into the session after a local text write.
   *
   * @param id - Block whose content was written.
   * @returns No value.
   */
  holdContent(id: string): void {
    this.holdLocal(id, (pin) => pin.field === "content");
  }

  /**
   * Copies live type and props into the session after a local type change.
   *
   * Type replacement also rewrites the prop map, so prop pins follow it.
   *
   * @param id - Block whose type was set.
   * @returns No value.
   */
  holdType(id: string): void {
    this.holdLocal(id, (pin) => pin.field === "type" || pin.field === "props");
  }

  /**
   * Copies live props into the session after a local property write.
   *
   * @param id - Block whose property was set or removed.
   * @param key - Property name the command wrote.
   * @returns No value.
   */
  holdProp(id: string, key: string): void {
    this.holdLocal(id, (pin) => pin.field === "props" && (pin.key === undefined || pin.key === key));
  }

  /**
   * Copies live plugin data into the session after a local namespace write.
   *
   * @param id - Block whose plugin data was set or removed.
   * @param pluginId - Plugin namespace the command wrote.
   * @returns No value.
   */
  holdPluginData(id: string, pluginId: string): void {
    this.holdLocal(id, (pin) => pin.field === "pluginData" && (pin.key === undefined || pin.key === pluginId));
  }

  /**
   * Drops every pin and its document subscription.
   *
   * @returns No value.
   */
  destroy(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.pins.clear();
    this.seen.clear();
    this.held.clear();
    this.clearCache();
  }

  /**
   * Returns a block snapshot whose pinned fields match this session.
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
    const projected = this.projectNode(block);
    const childrenChanged = children.some((child, index) => child !== block.children[index]);
    if (!projected && !childrenChanged) return block;
    const value: EditorBlock = { ...(projected?.block ?? block), children };
    return this.remember(block, projected?.samples ?? [], children, value);
  }

  /**
   * Projects every root and reuses the previous array when those roots are unchanged.
   *
   * `useSyncExternalStore` compares the root list by identity. Returning a new
   * array for an unchanged tree would republish the same document forever.
   *
   * @param blocks - Detached document roots, including descendants.
   * @returns The original array when nothing is pinned or no root changed, or
   * the stable projected array.
   */
  projectAll(blocks: readonly EditorBlock[]): EditorBlock[] {
    if (!this.active) return blocks as EditorBlock[];
    const projected = blocks.map((block) => this.project(block));
    if (
      this.rootList
      && this.rootList.length === projected.length
      && this.rootList.every((block, index) => block === projected[index])
    ) return this.rootList;
    const next = projected.every((block, index) => block === blocks[index])
      ? (blocks as EditorBlock[])
      : projected;
    this.rootList = next;
    return next;
  }

  /**
   * Subscribes once for every pinned field.
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
   * Records replicated values and advances the session view for local history.
   *
   * New block ids always take the value they appear with. Existing ids change
   * only for this editor's origin or while undo/redo is applying. Remote
   * edits still update `seen`, so a later local transaction that does not
   * touch the field — including document repair after a remote update — does
   * not copy that remote value into the session view.
   *
   * @param origin - Origin of the integrated transaction.
   * @returns No value.
   */
  private adopt(origin: unknown): void {
    const followExisting = origin === this.editor.document.origin || this.editor.history.isApplyingHistory;
    let heldChanged = false;
    for (const [id, pin] of this.pins) {
      const next = this.editor.document.blocks.readBlockFields(pin.field, pin.key);
      const seen = this.seen.get(id);
      const held = this.held.get(id);
      if (!seen || !held) continue;
      for (const [blockId, value] of next) {
        const known = seen.has(blockId);
        const previous = seen.get(blockId);
        if (!known || (followExisting && previous && !sameSample(previous, value))) {
          held.set(blockId, value);
          heldChanged = true;
        }
        seen.set(blockId, value);
      }
      for (const blockId of [...seen.keys()]) {
        if (next.has(blockId)) continue;
        seen.delete(blockId);
        if (held.delete(blockId)) heldChanged = true;
        this.cache.delete(blockId);
        this.rootList = undefined;
      }
    }
    if (heldChanged) this.clearCache();
  }

  /**
   * Re-reads pins touched by a local command and stores those live values.
   *
   * @param id - Block the command changed.
   * @param touched - Predicate selecting pins the command wrote.
   * @returns No value.
   */
  private holdLocal(id: string, touched: (pin: BlockFieldPin) => boolean): void {
    if (!this.active) return;
    let heldChanged = false;
    for (const [pinKey, pin] of this.pins) {
      if (!touched(pin)) continue;
      const reading = this.editor.document.blocks.readBlockField(id, pin.field, pin.key);
      const held = this.held.get(pinKey);
      if (!reading || !held) continue;
      const current = held.get(id);
      if (current && sameSample(current, reading)) continue;
      held.set(id, reading);
      heldChanged = true;
    }
    if (heldChanged) this.clearCache();
  }

  /**
   * Applies pinned fields to one block without walking descendants.
   *
   * Whole-map pins are applied before entry pins of the same field, so a
   * pinned key stays on its own session value inside a pinned map.
   *
   * @param block - Document snapshot to project.
   * @returns Replacement fields and the samples they came from, or `undefined`
   * when every pinned field already matches the snapshot.
   */
  private projectNode(block: EditorBlock): { block: EditorBlock; samples: BlockFieldValue[] } | undefined {
    const samples: BlockFieldValue[] = [];
    let content = block.content;
    let type = block.type;
    let listProps = block.listProps;
    let props = block.props;
    let pluginData = block.pluginData;
    let changed = false;
    for (const pin of orderedPins(this.pins.values())) {
      const sample = this.held.get(pinId(pin))?.get(block.id);
      if (!sample) continue;
      samples.push(sample);
      if (pin.field === "content") {
        if (sample.present && sample.value !== content) {
          content = String(sample.value);
          changed = true;
        }
        continue;
      }
      if (pin.field === "type") {
        if (sample.present && sample.value !== type) {
          type = String(sample.value);
          changed = true;
        }
        continue;
      }
      if (!isMapPin(pin)) continue;
      const overlaid = overlayMap(
        pin.field === "listProps" ? listProps : pin.field === "props" ? props : pluginData,
        pin,
        sample,
      );
      if (!overlaid) continue;
      changed = true;
      if (pin.field === "listProps") listProps = overlaid;
      else if (pin.field === "props") props = overlaid;
      else pluginData = overlaid;
    }
    if (!changed) return undefined;
    return {
      block: { ...block, content, type, listProps, props, pluginData },
      samples,
    };
  }

  /**
   * Returns the cached projection when its inputs are unchanged.
   *
   * @param source - Document snapshot used as the cache key.
   * @param samples - Held samples consulted for this node.
   * @param children - Projected children.
   * @param value - Projection to store on a cache miss.
   * @returns The stable projected block.
   */
  private remember(
    source: EditorBlock,
    samples: readonly BlockFieldValue[],
    children: readonly EditorBlock[],
    value: EditorBlock,
  ): EditorBlock {
    const cached = this.cache.get(source.id);
    if (
      cached?.source === source
      && sameSamples(cached.samples, samples)
      && sameChildren(cached.children, children)
    ) return cached.value;
    this.cache.set(source.id, { source, samples, children, value });
    return value;
  }

  /**
   * Removes one pin and the subscription when no fields remain.
   *
   * @param id - Pin identifier previously stored by `pin`.
   * @returns No value.
   */
  private release(id: string): void {
    this.pins.delete(id);
    this.seen.delete(id);
    this.held.delete(id);
    this.clearCache();
    if (this.pins.size > 0 || !this.unsubscribe) return;
    this.unsubscribe();
    this.unsubscribe = undefined;
  }

  /**
   * Drops projections after a session value changes.
   *
   * The next read rebuilds from the current document snapshot and the updated
   * held samples. Clearing the root list as well keeps `projectAll` from
   * returning a tree that still carries the previous samples.
   *
   * @returns No value.
   */
  private clearCache(): void {
    this.cache.clear();
    this.rootList = undefined;
  }
}

/**
 * Validates a pin and drops a key that does not belong on scalar fields.
 *
 * @param target - Caller-supplied pin.
 * @returns The pin that will be stored.
 * @throws {Error} When the field or key is not supported.
 */
function normalizePin(target: BlockFieldPin): BlockFieldPin {
  const field = target.field;
  if (!isPayloadField(field)) throw new Error("Block field pin is not supported");
  if (field === "content" || field === "type") {
    if (target.key !== undefined) throw new Error(`${field} cannot be pinned by key`);
    return { field };
  }
  if (target.key !== undefined && !target.key) throw new Error("Block field key is required");
  return target.key === undefined ? { field } : { field, key: target.key };
}

/**
 * Builds the stable identity of one pin.
 *
 * @param pin - Normalized pin.
 * @returns Field name, or field plus entry name.
 */
function pinId(pin: BlockFieldPin): string {
  return pin.key === undefined ? pin.field : `${pin.field}:${pin.key}`;
}

/**
 * Reports whether a string is a supported payload field.
 *
 * @param field - Candidate field name.
 * @returns `true` when the session pin can store that field.
 */
function isPayloadField(field: string): field is BlockPayloadField {
  return field === "content"
    || field === "type"
    || field === "listProps"
    || field === "props"
    || field === "pluginData";
}

/**
 * Reports whether a pin targets a map payload field.
 *
 * Content and type are handled before this check. The predicate lets the
 * map overlay receive a pin whose field is only `listProps`, `props`, or
 * `pluginData`.
 *
 * @param pin - Pin being projected onto one block.
 * @returns `true` when the pin reads or replaces a map.
 */
function isMapPin(pin: BlockFieldPin): pin is BlockFieldPin & { field: MapField } {
  return pin.field === "listProps" || pin.field === "props" || pin.field === "pluginData";
}

/**
 * Orders whole-map pins before entry pins of the same field.
 *
 * Fields stay in first-seen order. Within one field the whole map is applied
 * first, so a pinned entry can still override that key inside the pinned map.
 *
 * @param pins - Active pins in registration order.
 * @returns Pins with each field's whole map preceding its entries.
 */
function orderedPins(pins: Iterable<BlockFieldPin>): BlockFieldPin[] {
  // Grouping by first-seen field keeps registration order across fields while
  // still putting each field's whole map ahead of its entries. A comparator
  // cannot do both: an entry registered before another field, which is itself
  // before the whole map, has no transitive order.
  const groups = new Map<BlockPayloadField, BlockFieldPin[]>();
  for (const pin of pins) {
    const group = groups.get(pin.field);
    if (group) group.push(pin);
    else groups.set(pin.field, [pin]);
  }
  const ordered: BlockFieldPin[] = [];
  for (const group of groups.values()) {
    ordered.push(...group.filter((pin) => pin.key === undefined));
    ordered.push(...group.filter((pin) => pin.key !== undefined));
  }
  return ordered;
}

/**
 * Reports whether a local patch writes one pinned field.
 *
 * Undefined list and plugin entries are not writes. An undefined prop entry
 * removes that prop, so it does count.
 *
 * @param pin - Active pin to test.
 * @param patch - Local block patch.
 * @returns `true` when the patch writes the pinned field.
 */
function patchTouches(pin: BlockFieldPin, patch: BlockPatch): boolean {
  if (pin.field === "content") return patch.content !== undefined;
  if (pin.field === "type") return false;
  const record = patch[pin.field];
  if (!record) return false;
  if (pin.key === undefined) return true;
  if (!Object.prototype.hasOwnProperty.call(record, pin.key)) return false;
  return pin.field === "props" || record[pin.key] !== undefined;
}

/**
 * Replaces or edits one map when the session sample differs from it.
 *
 * @param current - Map currently on the snapshot or produced by an earlier pin.
 * @param pin - Map pin being applied. Entry pins carry `key`.
 * @param sample - Session value for this block.
 * @returns A detached map, or `undefined` when `current` already matches.
 */
function overlayMap(
  current: Record<string, unknown>,
  pin: BlockFieldPin & { field: MapField },
  sample: BlockFieldValue,
): Record<string, unknown> | undefined {
  if (pin.key === undefined) {
    if (!sample.present || sameValue(current, sample.value)) return undefined;
    return copyValue(sample.value) as Record<string, unknown>;
  }
  const presentNow = Object.prototype.hasOwnProperty.call(current, pin.key);
  const matches = sample.present
    ? presentNow && sameValue(current[pin.key], sample.value)
    : !presentNow;
  if (matches) return undefined;
  const next = { ...current };
  if (sample.present) next[pin.key] = copyValue(sample.value);
  else delete next[pin.key];
  return next;
}

/**
 * Compares two field readings by presence and portable value.
 *
 * @param left - Previously observed reading.
 * @param right - Reading from the latest storage scan.
 * @returns Whether both readings describe the same value.
 */
function sameSample(left: BlockFieldValue, right: BlockFieldValue): boolean {
  return left.present === right.present && sameValue(left.value, right.value);
}

/**
 * Compares portable JSON-like values.
 *
 * @param left - Session or snapshot value.
 * @param right - Value to compare with `left`.
 * @returns Whether the values have the same structure and primitives.
 */
function sameValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (typeof left !== "object" || typeof right !== "object" || !left || !right) return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    return left.every((item, index) => sameValue(item, right[index]));
  }
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord);
  if (leftKeys.length !== Object.keys(rightRecord).length) return false;
  return leftKeys.every((key) => sameValue(leftRecord[key], rightRecord[key]));
}

/**
 * Detaches an object or array before placing it on a projected snapshot.
 *
 * @param value - Portable value stored in the session cache.
 * @returns A copy of object values, or the original primitive.
 */
function copyValue<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  return structuredClone(value);
}

/**
 * Compares consulted samples by object identity.
 *
 * @param left - Samples stored on the cached projection.
 * @param right - Samples consulted for the current snapshot.
 * @returns Whether both lists are the same readings.
 */
function sameSamples(left: readonly BlockFieldValue[], right: readonly BlockFieldValue[]): boolean {
  return left.length === right.length && left.every((sample, index) => sample === right[index]);
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
