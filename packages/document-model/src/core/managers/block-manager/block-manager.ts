/**
 * Stores collaborative block records, text, and ordered subtree placement.
 * Keeps IDs stable, validates writes before mutation, and owns change observation.
 * Editor commands and outline policies belong to the public block manager;
 * this layer supplies generic storage operations and snapshot validation.
 */
import {
    CRDTDoc,
    CRDTType,
    CRDTArray,
    CRDTMap,
    CRDTText,
    CRDTUndoScope,
} from "@chulane/crdt-doc";
import type {
    Block,
    BlockInput,
    BlockListProps,
    BlockNode,
    BlockPatch,
    BlockUpdate,
    DocumentBlockManagerApi,
} from "../../types";
import type {
    BlockListPropsStorage,
    BlockStorage,
    IDBlock,
    IDPlugin,
    IDProp,
} from "../../types/storage";
import {
    assignMap,
    assignText,
    assertPortableRecord,
    assertPortableValue,
    clone,
    isCRDTArray,
    isCRDTMap,
    isCRDTText,
    requireNonemptyId,
} from "../../utils";
import {
    contentFrom,
    strings,
    validateBlockForest,
    validateBlockListProps,
} from "./utils";
import { BlockCache } from "./cache";

const ROOTS_KEY = "rivto.editor.roots";
const BLOCKS_KEY = "rivto.editor.blocks";
interface LocatedBlock {
    array: CRDTArray<string>;
    index: number;
    parentId?: string;
    path: readonly number[];
}

/**
 * Owns block records, collaborative text, and ordered tree placement.
 *
 * The manager is exposed as `document.blocks`. It preserves stable CRDT
 * container identities and lazily repairs cached tree paths. Editor-specific
 * schema and placement policy is applied before this storage boundary.
 */
export class DocumentBlockManager implements DocumentBlockManagerApi {
    /** Creates block identities without exposing generator configuration. */
    private readonly generateId = (): string => crypto.randomUUID();
    /** Detached snapshots invalidated before subscribers are notified. */
    private readonly cache: BlockCache;
    /** Per-block subscribers, including recursive snapshot consumers on ancestors. */
    private readonly blockListeners = new Map<IDBlock, Set<() => void>>();
    /** Subscribers for own fields and direct child IDs only. */
    private readonly blockNodeListeners = new Map<IDBlock, Set<() => void>>();
    /** Subscribers interested only in the ordered root identifier list. */
    private readonly rootListeners = new Set<() => void>();
    /** Subscribers interested in root or child ordering changes. */
    private readonly structureListeners = new Set<() => void>();
    /** Monotonic block-data revision used by derived presentation caches. */
    private currentRevision = 0;
    /** Last transaction already published to hierarchy subscribers. */
    private lastStructureTransaction?: unknown;
    /** Root blocks. */
    private readonly roots: CRDTArray<IDBlock>;
    /** Block storage. */
    private readonly storage: CRDTMap<Record<IDBlock, CRDTMap<BlockStorage>>>;
    /** Adapter roots tracked by document-owned history. */
    readonly historyScopes: readonly CRDTUndoScope[];
    /**
     * Creates a block manager over existing collaborative document storage.
     *
     * @param crdt - Collaborative storage adapter.
     */
    constructor(private readonly crdt: CRDTDoc) {
        this.roots = crdt.getArray<IDBlock>(ROOTS_KEY);
        this.storage = crdt.getMap<Record<IDBlock, CRDTMap<BlockStorage>>>(BLOCKS_KEY);
        this.historyScopes = [this.storage, this.roots];
        this.cache = new BlockCache(
            (parentId) => {
                if (parentId === null) return strings(this.roots);
                const block = this.storage.get(parentId);
                return isCRDTMap(block) ? strings(this.requiredArray(block, "children")) : undefined;
            },
            (id) => this.storage.has(id),
        );
        this.cache.refreshParents();
        // Nested maps name the owning block in `path` / `keys`. Child-list
        // edits therefore already include the parent ID, so ancestor snapshots
        // are dropped through `invalidateBlocks` without a parent-map diff.
        this.storage.observe((events, transaction) => {
            this.currentRevision += 1;
            // Start points for recursive snapshot invalidation up the tree.
            const changedBlockIds = new Set<string>();
            // Blocks whose own-field node snapshots must be rebuilt.
            const nodeFieldChangedIds = new Set<string>();
            // Parents whose direct child-ID snapshots must be rebuilt.
            const childListChangedIds = new Set<string>();
            const placementChangedIds = new Set<string>();
            let structureChanged = false;
            let recordReplaced = false;
            events.forEach(({ path, keys }) => {
                // storage.set/delete("b1") -> path: [], keys: ["b1"].
                // The whole record changed, so both focused caches are stale.
                if (path.length === 0) {
                    keys.forEach((id) => {
                        changedBlockIds.add(id);
                        nodeFieldChangedIds.add(id);
                        childListChangedIds.add(id);
                        if (this.cache.hasParent(id)) recordReplaced = true;
                    });
                    return;
                }
                const id = path[0];
                if (typeof id !== "string") return;
                changedBlockIds.add(id);
                // block.set("type", ...): path ["b1"], keys ["type"].
                // block.set("children", ...): path ["b1"], keys ["children"].
                // content.insert(...): path ["b1", "content"], keys [].
                // props.set("color", ...): path ["b1", "props"], keys ["color"].
                // children.push("c1"): path ["b1", "children"], keys [].
                const childrenChanged = path[1] === "children"
                    || (path.length === 1 && keys.includes("children"));
                const nodeChanged = path.length === 1
                    ? keys.some((key) => key !== "children")
                    : path[1] !== "children";
                if (childrenChanged) childListChangedIds.add(id);
                if (nodeChanged) nodeFieldChangedIds.add(id);
                structureChanged ||= childrenChanged;
            });
            if (structureChanged || recordReplaced) {
                childListChangedIds.forEach((parentId) => {
                    const previous = new Set(this.cache.getIndexedChildren(parentId));
                    const parent = this.storage.get(parentId);
                    const next = new Set(isCRDTMap(parent) ? strings(this.requiredArray(parent, "children")) : []);
                    previous.forEach((id) => { if (!next.has(id)) placementChangedIds.add(id); });
                    next.forEach((id) => { if (!previous.has(id)) placementChangedIds.add(id); });
                });
                this.cache.refreshParents(recordReplaced ? undefined : childListChangedIds, transaction);
            }
            this.invalidateBlocks(changedBlockIds, nodeFieldChangedIds, childListChangedIds, placementChangedIds);
            if (structureChanged || recordReplaced) this.emitStructure(transaction);
        });
        // The roots array is not a field on any block, so these events have an
        // empty path and cannot name a parent for `invalidateBlocks`.
        this.roots.observe((_events, transaction) => {
            this.currentRevision += 1;
            this.cache.invalidateRoots();
            const previousParents = this.cache.hasDuplicatePlacements() ? this.cache.snapshotParents() : undefined;
            const oldRoots = new Set(this.cache.getIndexedChildren(null));
            const newRoots = new Set(strings(this.roots));
            const changedRoots = new Set([...oldRoots, ...newRoots].filter((id) => oldRoots.has(id) !== newRoots.has(id)));
            const affected = this.cache.getAncestorIds(changedRoots, true);
            this.cache.refreshParents(new Set([null]), transaction);
            // Valid trees need only the parent chains of IDs entering/leaving
            // roots. Duplicate references can change the first winner on reorder.
            if (previousParents) {
                const changed = this.cache.invalidateChangedParents(previousParents);
                this.emitFocused(changed, this.blockListeners);
            } else {
                this.cache.getAncestorIds(changedRoots, true).forEach((id) => affected.add(id));
                this.cache.invalidate(affected);
                this.emitFocused(affected, this.blockListeners);
            }
            this.emitFocused(changedRoots, this.blockNodeListeners);
            this.emit(this.rootListeners);
            this.emitStructure(transaction);
        });
    }

    /** @returns Monotonic revision incremented by block data or hierarchy changes. */
    get revision(): number { return this.currentRevision; }

    /**
     * Reports whether the document has no root blocks.
     *
     * @returns `true` when the ordered root list is empty.
     */
    get isEmpty(): boolean {
        return this.roots.length === 0;
    }

    /**
     * Reports whether canonical storage contains one block record.
     *
     * This storage-level check remains true even when a concurrent move has
     * temporarily detached the block from the ordered tree.
     *
     * @param id - Stable block identifier to inspect.
     * @returns True when the block record exists.
     */
    hasBlock(id: string): boolean {
        return this.storage.has(id);
    }

    /**
     * Returns one placed block. Cached index paths are validated lazily, so
     * moves and remote changes need no eager cache maintenance.
     *
     * @param id - Stable block identifier to resolve.
     * @returns Detached block subtree, or undefined when the block is absent.
     */
    getBlock(id: string): Block | undefined {
        if (!this.isPlaced(id)) return undefined;
        return this.readBlock(id, new Set());
    }

    /**
     * Returns one placed block without recursively materializing descendants.
     *
     * Identity stays stable until own fields or direct child IDs change;
     * descendant edits leave this snapshot intact.
     *
     * @param id - Stable block identifier to resolve.
     * @returns Detached node fields, or undefined when the block is absent.
     */
    getBlockNode(id: string): BlockNode | undefined {
        if (!this.isPlaced(id)) return undefined;
        const value = this.storage.get(id);
        if (!isCRDTMap(value)) return undefined;
        return this.cache.readNode(id, this.crdt.isTransacting, () => this.readBlockNode(value, id));
    }

    /**
     * Materializes the complete ordered root tree.
     *
     * @returns Detached root blocks with recursively materialized children.
     */
    getBlocks(): Block[] {
        return strings(this.roots).flatMap((id) => {
            const block = this.readBlock(id, new Set());
            return block ? [block] : [];
        });
    }

    /**
     * Reads root identifiers without materializing block records.
     *
     * @returns Root identifiers in collaborative array order.
     */
    getRootIds(): string[] {
        return this.cache.readRoots(this.crdt.isTransacting, () => strings(this.roots));
    }

    /**
     * Subscribes to changes that can alter one recursive block snapshot.
     *
     * Descendant changes also notify ancestor IDs because `getBlock` includes
     * the complete subtree. Unrelated branches retain their snapshot identity.
     *
     * @param id - Block identifier whose recursive value is observed.
     * @param listener - Callback invoked after that value becomes stale.
     * @returns Function that removes this exact listener.
     */
    subscribeBlock(id: string, listener: () => void): () => void {
        return this.subscribeById(this.blockListeners, id, listener);
    }

    /**
     * Subscribes to a block's own fields and direct child identifiers.
     * @param id - Block identifier to observe.
     * @param listener - Callback invoked after node changes.
     * @returns Function that removes this listener.
     */
    subscribeBlockNode(id: string, listener: () => void): () => void {
        return this.subscribeById(this.blockNodeListeners, id, listener);
    }

    /**
     * Subscribes only to changes in the ordered root identifier array.
     *
     * @param listener - Callback invoked after roots are inserted, removed, or reordered.
     * @returns Function that removes this exact listener.
     */
    subscribeRootIds(listener: () => void): () => void {
        this.rootListeners.add(listener);
        return () => this.rootListeners.delete(listener);
    }

    /**
     * Subscribes to root and direct-child ordering changes.
     *
     * @param listener - Callback invoked after document hierarchy changes.
     * @returns Function that removes this exact listener.
     */
    subscribeStructure(listener: () => void): () => void {
        this.structureListeners.add(listener);
        return () => this.structureListeners.delete(listener);
    }

    /**
     * Reports whether a stored block currently has direct children.
     *
     * @param id - Parent block identifier to inspect.
     * @returns True when the block exists and its child list is nonempty.
     */
    hasChildren(id: string): boolean {
        if (!this.isPlaced(id)) return false;
        const value = this.storage.get(id);
        return isCRDTMap(value) && this.requiredArray(value, "children").length > 0;
    }

    /**
     * Resolves one block's current structural parent.
   *
   * @param id - Block identifier to locate in the tree.
   * @returns Parent identifier, null for a root, or undefined when absent.
   */
  getParentId(id: string): string | null | undefined {
    if (this.crdt.isTransacting) {
      const found = this.findContainer(id);
      return found ? found.parentId ?? null : undefined;
    }
    return this.cache.getParentId(id);
  }

  /**
   * Reports whether a block is at the root level.
   *
   * @param id - Block identifier to check.
   * @returns True when the block exists and has no parent.
   */
  isRootBlock(id: string): boolean {
    return this.getParentId(id) === null;
  }

    /**
     * Inserts a block into an ordered root or sibling list.
     *
     * @param block - Initial portable block data including its required native type.
     * @param afterId - Sibling to insert after block id, `null` for first, or omitted for last.
     * @returns Complete inserted block assembled during storage creation.
     * @throws If the ID already exists or the requested sibling is missing.
     */
    insertBlock(block: BlockInput, afterId?: string | null): Block {
        if (!block.type) throw new Error("Block type is required");
        const container = this.resolveInsertContainer(afterId);
        this.validateInsertedForest([block]);
        let inserted: Block | undefined;
        this.crdt.transact(() => {
            inserted = this.insertInto(block, container, afterId);
        });
        return inserted!;
    }

    /**
     * Patch only supplied block fields. Nested CRDT containers stay alive so
     * unrelated concurrent edits are not discarded by whole-object replacement.
     *
     * @param id - ID of the block to update.
     * @param patch - Fields to validate and apply.
     * @throws If the block does not exist.
     * @returns Updated block fields without recursively materializing descendants.
     */
    updateBlock(id: string, patch: BlockPatch): BlockNode {
        return this.updateBlocks([{ id, patch }])[0]!;
    }

    /**
     * Applies identified block patches in order within one transaction.
     *
     * Every target, collapse value, and property patch is validated before the
     * first shared write. Duplicate IDs are allowed and observe preceding
     * property patches from the same batch.
     *
     * @param updates - Ordered block IDs and partial field updates.
     * @throws If a target is missing or a supplied value fails validation.
     * @returns Updated block fields without descendants, in input order.
     */
    updateBlocks(updates: readonly BlockUpdate[]): BlockNode[] {
        const simulatedListProps = new Map<string, BlockListProps>();
        const prepared = updates.map(({ id, patch }) => {
            const block = this.requiredBlock(id);
            let validatedListProps: BlockListProps | undefined;
            if (patch.listProps) {
                const current = simulatedListProps.get(id)
                    ?? validateBlockListProps(this.requiredMap(block, "listProps").toObject());
                validatedListProps = validateBlockListProps({ ...current, ...patch.listProps });
                simulatedListProps.set(id, validatedListProps);
            }
            if (patch.props) {
                Object.entries(patch.props).forEach(([key, value]) => {
                    if (value !== undefined) assertPortableValue(value, `block.props.${key}`);
                });
            }
            if (patch.pluginData) assertPortableRecord(patch.pluginData, "block.pluginData");
            return { id, block, patch, validatedListProps };
        });

        const results: BlockNode[] = [];
        this.crdt.transact(() => {
            prepared.forEach(({ id, block, patch, validatedListProps }) => {
                if (validatedListProps && patch.listProps) {
                    assignMap(this.requiredMap(block, "listProps"), { ...patch.listProps }, false);
                }
                if (patch.props) {
                    const props = this.requiredMap(block, "props");
                    for (const [key, value] of Object.entries(patch.props)) {
                        if (value === undefined) props.delete(key);
                        else props.set(key, clone(value) as CRDTType);
                    }
                }
                if (patch.pluginData) assignMap(this.requiredMap(block, "pluginData"), patch.pluginData, false);
                if (patch.content !== undefined) assignText(this.requiredText(block, "content"), patch.content);
                results.push(this.readBlockNode(block, id));
            });
        });
        return results;
    }

    /**
     * Changes a block's native type while preserving identity and nested data.
     *
     * @param id - Block identifier to convert.
     * @param type - Non-empty destination native type.
     * @param props - Complete properties for the destination type.
     * @returns No value.
     * @throws {Error} When the block is missing or the type is empty.
     */
    setBlockType(id: string, type: string, props: Record<string, unknown> = {}): void {
        if (!type) throw new Error("Block type is required");
        assertPortableRecord(props, "block.props");
        const nextProps = props;
        this.crdt.transact(() => {
            const block = this.requiredBlock(id);
            block.set("type", type);
            assignMap(this.requiredMap(block, "props"), nextProps);
        });
    }

    /**
     * Update one block property without replacing the shared props map.
     * Stable CRDT container identities let concurrent edits to different keys merge.
     *
     * @param id - ID of the block to update.
     * @param key - Property name to set or remove.
     * @param value - Portable value, or `undefined` to remove the property.
     * @throws If the block does not exist or validation fails.
     * @returns No value.
     */
    setBlockProp(id: string, key: string, value: unknown): void {
        this.crdt.transact(() => {
            const block = this.requiredBlock(id);
            this.patchProps(this.requiredMap(block, "props"), { [key]: value });
        });
    }

    /**
     * Deletes selected opaque list-property keys from one block transactionally.
     *
     * Missing keys are harmless and duplicate keys are deleted once.
     *
     * @param id - Identifier of the block whose list properties are changed.
     * @param keys - Property names to remove from the block's list-property map.
     * @returns `true` when the target block exists and the deletion transaction
     * runs; otherwise `false`.
     */
    deleteListProps(id: string, keys: readonly string[]): boolean {
        if (!this.hasBlock(id)) return false;
        this.deleteListPropsBatch([{ id, keys }]);
        return true;
    }

    /**
     * Deletes list-property keys from several blocks in one strict transaction.
     *
     * Every target is resolved before the first write, so a missing block rejects
     * the complete batch rather than applying a prefix.
     *
     * @param updates - Block identifiers paired with property names to delete.
     * @returns No value.
     * @throws {Error} When any target block is missing or malformed.
     */
    deleteListPropsBatch(updates: readonly { id: string; keys: readonly string[] }[]): void {
        const prepared = updates.map(({ id, keys }) => ({
            map: this.requiredMap(this.requiredBlock(id), "listProps"),
            keys: [...new Set(keys)],
        }));
        this.crdt.transact(() => prepared.forEach(({ map, keys }) => keys.forEach((key) => map.delete(key))));
    }

    /**
     * Updates one plugin namespace without touching data owned by other plugins.
     *
     * @param id - ID of the owning block.
     * @param pluginId - Stable plugin namespace.
     * @param value - Portable plugin data, or `undefined` to remove it.
     * @throws If the block does not exist.
     * @returns No value.
     */
    setPluginData(id: string, pluginId: string, value: unknown): void {
        this.crdt.transact(() => {
            const data = this.requiredMap(this.requiredBlock(id), "pluginData");
            if (value === undefined) data.delete(pluginId);
            else data.set(pluginId, clone(value) as CRDTType);
        });
    }

    /**
     * Reconciles plain text as the smallest delete/insert range possible.
     * This preserves CRDTText identity and unchanged formatted runs.
     *
     * @param id - ID of the text block.
     * @param text - Complete replacement plain-text value.
     * @throws If the block or its content field does not exist.
     * @returns No value.
     */
    setBlockText(id: string, text: string): void {
        this.crdt.transact(() => {
            const content = this.requiredText(this.requiredBlock(id), "content");
            const current = content.toString();
            if (current === text) return;
            let start = 0;
            while (start < current.length && start < text.length && current[start] === text[start]) start += 1;
            let oldEnd = current.length;
            let newEnd = text.length;
            while (oldEnd > start && newEnd > start && current[oldEnd - 1] === text[newEnd - 1]) {
                oldEnd -= 1;
                newEnd -= 1;
            }
            if (oldEnd > start) content.delete(start, oldEnd - start);
            if (newEnd > start) content.insert(start, text.slice(start, newEnd));
        });
    }

    /**
     * Inserts collaborative text at a block-relative offset.
     *
     * @param id - ID of the text block.
     * @param offset - Requested insertion offset, clamped to the content bounds.
     * @param text - Text to insert.
     * @throws If the block or its content field does not exist.
     * @returns No value.
     */
    insertText(id: string, offset: number, text: string): void {
        if (!text) return;
        this.crdt.transact(() => {
            const content = this.requiredText(this.requiredBlock(id), "content");
            const position = Math.max(0, Math.min(offset, content.length));
            content.insert(position, text);
        });
    }

    /**
     * Deletes a collaborative text range without rewriting unaffected content.
     *
     * @param id - ID of the text block.
     * @param offset - Requested start offset, clamped to the content bounds.
     * @param length - Maximum number of characters to delete.
     * @throws If the block or its content field does not exist.
     * @returns No value.
     */
    deleteText(id: string, offset: number, length: number): void {
        if (length <= 0) return;
        this.crdt.transact(() => {
            const content = this.requiredText(this.requiredBlock(id), "content");
            const position = Math.max(0, Math.min(offset, content.length));
            content.delete(position, Math.min(length, content.length - position));
        });
    }

    /**
     * Removes a block subtree and every descendant placement.
     *
     * @param id - Root ID of the subtree to remove.
     * @returns No value.
     */
    removeBlock(id: string): void {
        this.crdt.transact(() => {
            const found = this.findContainer(id);
            if (!found) return;
            this.removeTree(id);
            found.array.delete(found.index, 1);
        });
    }

    /**
     * Moves one placed subtree relative to an anchor.
     *
     * This is the single-item wrapper around `moveBlocks`. It does not apply
     * editor grouping, descendant filtering, or outline indent policy.
     *
     * @param id - Placed subtree root to move.
     * @param targetId - Placement anchor, or null to prepend in the current sibling list.
     * @param position - Placement before, after, or appended inside the anchor.
     * @returns No value.
     */
    moveBlock(id: string, targetId: string | null, position: "before" | "after" | "inside" = "after"): void {
        this.moveBlocks([{ id, targetId, position }]);
    }

    /**
     * Moves placed subtrees according to an ordered list of explicit placements.
     *
     * Callers choose which roots to move. This method does not drop selected
     * descendants or keep sibling groups together; those policies belong to the
     * editor block manager. Only each named root ID is rewritten between sibling
     * arrays, so descendants stay attached and travel with that root.
     *
     * Placement meaning:
     * - `"before"` / `"after"` insert beside `targetId` in that sibling list.
     * - `"inside"` appends as the last child of `targetId`.
     * - `targetId === null` prepends in the source's current sibling list and
     *   keeps its parent; `position` is unused for that entry.
     *
     * A placement that names itself as the anchor is skipped. Remaining entries
     * are validated as a sequence before any write because CRDT transactions
     * cannot roll back. Cycle checks run against simulated parents, so later
     * entries observe parents established by earlier ones. The write then
     * detaches each ID and inserts it at the resolved index.
     *
     * @param moves - Ordered subtree placements; later entries see earlier parents.
     * @returns No value.
     * @throws When a source or anchor is unplaced or a cycle would form.
     */
    moveBlocks(moves: readonly {
        id: string;
        targetId: string | null;
        position: "before" | "after" | "inside";
    }[]): void {
        const parents = new Map<string, string | null>();
        /**
         * Resolves a parent after preceding simulated moves.
         *
         * @param id - Placed block identifier.
         * @returns Its simulated parent, or the live parent when not yet moved.
         */
        const parentOf = (id: string): string | null => parents.has(id)
            ? parents.get(id)!
            : this.getParentId(id) ?? null;
        // Self-anchors are already in the requested place; keeping them would
        // still trip the descendant-cycle walk below.
        const pending = moves.filter(({ id, targetId }) => id !== targetId);
        for (const { id, targetId, position } of pending) {
            if (!this.findContainer(id)) throw new Error(`Block ${id} not found`);
            if (targetId !== null && !this.findContainer(targetId)) {
                throw new Error(`Target block ${targetId} not found`);
            }
            // Reject any placement whose anchor sits in the moving subtree,
            // including a sibling insert beside a descendant: detaching the
            // root would take the anchor with it.
            let ancestor = targetId;
            while (ancestor !== null) {
                if (ancestor === id) throw new Error(`Cannot move block ${id} relative to its descendant ${targetId}`);
                ancestor = parentOf(ancestor);
            }
            let parentId: string | null;
            if (targetId === null) parentId = parentOf(id);
            else if (position === "inside") parentId = targetId;
            else parentId = parentOf(targetId);
            parents.set(id, parentId);
        }
        this.crdt.transact(() => {
            for (const { id, targetId, position } of pending) {
                const source = this.findContainer(id)!;
                let target: CRDTArray<string>;
                if (targetId === null) target = source.array;
                else if (position === "inside") target = this.requiredArray(this.requiredBlock(targetId), "children");
                else target = this.findContainer(targetId)!.array;
                // Detach first so same-array sibling indexes are computed on
                // the remaining IDs, then insert at the resolved slot.
                source.array.delete(source.index, 1);
                let index: number;
                if (targetId === null) index = 0;
                else if (position === "inside") index = target.length;
                else {
                    index = strings(target).indexOf(targetId);
                    if (position === "after") index += 1;
                }
                target.insert(index, id);
            }
        });
    }

    /**
     * Replaces the complete block tree inside the caller's snapshot transaction.
     *
     * Every supplied block is validated before existing collaborative state is
     * cleared, preventing malformed snapshots from partially replacing data.
     *
     * @param blocks - Portable root block trees that become the stored document.
     * @returns No value.
     * @throws {Error} When list properties or child collections are malformed.
     */
    loadBlocks(blocks: readonly Block[]): void {
        this.validateBlocks(blocks);
        this.cache.clearPaths();
        this.roots.delete(0, this.roots.length);
        this.storage.clear();
        blocks.forEach((block) => this.insertInto(block, this.roots));
    }

    /**
     * Validates portable block trees before a snapshot transaction starts.
     *
     * Validation precedes destructive replacement because CRDT transactions do
     * not roll back writes when an operation throws. Unique IDs, nonempty types,
     * portable records and acyclic children are all required.
     *
     * @param blocks - Portable root block trees to validate recursively.
     * @returns No value.
     * @throws {Error} When any descendant is malformed, duplicated, or cyclic.
     */
    validateBlocks(blocks: readonly Block[]): void {
        validateBlockForest(blocks, { requireComplete: true });
    }

    /**
     * Repair duplicate, missing, and orphaned tree references deterministically.
     * Block payloads are retained even when a concurrent move leaves an orphan.
     *
     * Orphaned blocks are appended to the root list, while duplicate and missing
     * references are removed.
     * @returns No value.
     */
    normalize(): void {
        this.crdt.transact(() => {
            const seen = new Set<string>();
            const clean = (array: CRDTArray<string>) => {
                for (let index = array.length - 1; index >= 0; index -= 1) {
                    const id = String(array.get(index));
                    if (!this.storage.has(id) || seen.has(id)) array.delete(index, 1);
                    else seen.add(id);
                }
            };
            clean(this.roots);
            for (const value of Array.from(this.storage.values())) {
                if (isCRDTMap(value)) clean(this.requiredArray(value, "children"));
            }
            for (const id of Array.from(this.storage.keys())) if (!seen.has(id)) this.roots.push(id);
        });
    }

    /**
     * Creates the block ID map used by an immediate import.
     *
     * Available source IDs survive cut/paste. IDs already present in this
     * document receive generated replacements so copied blocks cannot overwrite
     * existing data. The returned IDs are not inserted or reserved.
     *
     * @param sourceIds - Stable source IDs in import order.
     * @returns Destination ID for every source block ID.
     */
    createImportIdMap(sourceIds: readonly string[]): ReadonlyMap<string, string> {
        const assigned = new Set<string>();
        return new Map(sourceIds.map((sourceId) => {
            // A free identity survives cut/paste. Copying into a document that
            // still owns it needs a fresh identity to avoid replacing data.
            const reusable = !this.storage.has(sourceId) && !assigned.has(sourceId);
            let id = reusable ? sourceId : this.generateId();
            // Generated collisions are improbable, but the document boundary
            // still guarantees a usable mapping rather than relying on chance.
            while (this.storage.has(id) || assigned.has(id)) id = this.generateId();
            assigned.add(id);
            return [sourceId, id];
        }));
    }

    /**
     * Creates CRDT containers for a block and inserts its ID into an ordered list.
     *
     * @param block - Portable block data, including its type and optional descendants.
     * @param container - Root or child array that receives the block ID.
     * @param afterId - Sibling to insert after, `null` for first, or omitted for last.
     * @returns Complete inserted block assembled from the normalized stored values.
     * @throws If the ID already exists or the requested sibling is missing.
     */
    private insertInto(
        block: BlockInput,
        container: CRDTArray<string>,
        afterId?: string | null,
    ): Block {
        if (!block.type) throw new Error("Block type is required");
        const listProps = validateBlockListProps(block.listProps ?? {});
        const id = requireNonemptyId(block.id ?? this.generateId(), "Block");
        if (this.storage.has(id)) throw new Error(`Block ${id} already exists`);
        const index = this.placementIndex(container, afterId);
        const model = this.crdt.createDetachedMap<BlockStorage>();
        const props = this.crdt.createDetachedMap<Record<string, CRDTType>>();
        const content = this.crdt.createDetachedText();
        const children = this.crdt.createDetachedArray<string>();
        const listPropsStorage = this.crdt.createDetachedMap<BlockListPropsStorage>();
        const pluginData = this.crdt.createDetachedMap<Record<string, CRDTType>>();
        model.set("id", id);
        model.set("type", block.type);
        model.set("listProps", listPropsStorage);
        model.set("props", props);
        model.set("content", content);
        model.set("children", children);
        model.set("pluginData", pluginData);
        this.storage.set(id, model);
        assignMap(listPropsStorage, { ...listProps }, true);
        assignMap(props, block.props ?? {});
        assignText(content, contentFrom(block.content));
        assignMap(pluginData, block.pluginData ?? {});
        const insertedChildren = block.children?.map((child) => this.insertInto(child, children)) ?? [];
        container.insert(index, id);
        return {
            id,
            type: block.type,
            listProps,
            props: props.toObject() as Record<IDProp, unknown>,
            pluginData: pluginData.toObject() as Record<IDPlugin, unknown>,
            content: content.toString(),
            children: insertedChildren,
        };
    }

    /**
     * Resolves the sibling array that will receive an insertion.
     *
     * @param afterId - Sibling to insert after, `null` for first, or omitted for last.
     * @returns The root array or the sibling's current container.
     * @throws {Error} When a named sibling is not placed in the tree.
     */
    private resolveInsertContainer(afterId?: string | null): CRDTArray<string> {
        if (afterId === undefined || afterId === null) return this.roots;
        const found = this.findContainer(afterId);
        if (!found) throw new Error(`Target block ${afterId} not found`);
        return found.array;
    }

    /**
     * Computes the insertion index after the exact requested sibling.
     *
     * @param container - Sibling array that must contain `afterId` when named.
     * @param afterId - Sibling to insert after, `null` for first, or omitted for last.
     * @returns Index at which the new ID should be inserted.
     * @throws {Error} When a named sibling is missing from the container.
     */
    private placementIndex(container: CRDTArray<string>, afterId?: string | null): number {
        if (afterId === undefined) return container.length;
        if (afterId === null) return 0;
        const found = strings(container).indexOf(afterId);
        if (found < 0) throw new Error(`Target block ${afterId} not found`);
        return found + 1;
    }

    /**
     * Preflights one inserted forest against current storage before writing.
     *
     * @param blocks - Root inputs that will be written in one insertion.
     * @returns No value.
     * @throws {Error} When any descendant is malformed or collides with storage.
     */
    private validateInsertedForest(blocks: readonly BlockInput[]): void {
        validateBlockForest(blocks, { existingIds: new Set([...this.storage.keys()]) });
    }

    /**
     * Materializes one stored block and its descendants as detached values.
     *
     * @param id - ID of the block to read.
     * @param visited - IDs already traversed, used to break malformed cycles.
     * @returns Materialized block, or `undefined` when missing or already visited.
     */
    private readBlock(id: IDBlock, visited: Set<IDBlock>): Block | undefined {
        if (visited.has(id)) return undefined;
        const value = this.storage.get(id);
        if (!isCRDTMap(value)) return undefined;
        visited.add(id);
        return this.cache.readBlock(id, this.crdt.isTransacting, () => {
            // Child reads share cached objects with their parent snapshot.
            const { childIds, ...node } = this.cache.readNode(id, this.crdt.isTransacting, () => this.readBlockNode(value, id));
            const children = childIds.flatMap((childId: IDBlock) => {
                const child = this.readBlock(childId, visited);
                return child ? [child] : [];
            });
            const snapshot = { ...node, children };
            Object.freeze(children);
            Object.freeze(snapshot);
            return snapshot;
        });
    }

    /**
     * Materializes one stored block record and its direct child IDs.
     *
     * @param value - Stored block map already resolved by the caller.
     * @param id - Stable block identity used for validation and the result.
     * @returns Detached non-recursive block fields.
     */
    private readBlockNode(value: CRDTMap<BlockStorage>, id: IDBlock): BlockNode {
        // The adapter can expose plain nested property values by reference.
        // Detach them before callers receive or cache the node.
        const fields = clone({
            id,
            type: this.requiredType(value, id),
            listProps: validateBlockListProps(this.requiredMap(value, "listProps").toObject()),
            props: this.requiredMap(value, "props").toObject() as Record<IDProp, unknown>,
            pluginData: this.requiredMap(value, "pluginData").toObject() as Record<IDPlugin, unknown>,
            content: this.requiredText(value, "content").toString(),
        });
        return {
            ...fields,
            childIds: this.cache.readChildIds(id, this.crdt.isTransacting, () => strings(this.requiredArray(value, "children"))),
        };
    }

    /**
     * Invalidates changed blocks and recursive snapshots of their live ancestors.
     *
     * Recursive snapshots include descendants, so they follow the ancestor
     * chain. Focused caches are dropped only for their relevant record changes.
     *
     * @param ids - Changed block IDs whose cached ancestor chains are stale.
     * @param nodeIds - Blocks whose own node fields changed.
     * @param childListIds - Blocks whose direct child array changed.
     * @returns No value.
     */
    private invalidateBlocks(
        ids: ReadonlySet<string>,
        nodeIds: ReadonlySet<string>,
        childListIds: ReadonlySet<string>,
        placementIds: ReadonlySet<string>,
    ): void {
        const affected = this.cache.getAncestorIds(ids);
        this.cache.invalidate(affected, nodeIds, childListIds);
        this.emitFocused(affected, this.blockListeners);
        this.emitFocused(new Set([...nodeIds, ...childListIds, ...placementIds]), this.blockNodeListeners);
    }

    /**
     * Adds a listener to one keyed channel.
     * @param registry - Listener registry for the requested snapshot kind.
     * @param id - Block identifier to observe.
     * @param listener - Callback to register.
     * @returns Function that removes this listener.
     */
    private subscribeById(registry: Map<IDBlock, Set<() => void>>, id: string, listener: () => void): () => void {
        let listeners = registry.get(id);
        if (!listeners) {
            listeners = new Set();
            registry.set(id, listeners);
        }
        listeners.add(listener);
        return () => {
            listeners!.delete(listener);
            if (!listeners!.size) registry.delete(id);
        };
    }

    /**
     * Notifies only listeners whose requested ID is in a changed set.
     * @param ids - Changed block identifiers.
     * @param registry - Listener registry for one snapshot kind.
     * @returns No value.
     */
    private emitFocused(ids: ReadonlySet<string>, registry: ReadonlyMap<IDBlock, Set<() => void>>): void {
        ids.forEach((id) => {
            const listeners = registry.get(id);
            if (listeners) this.emit(listeners);
        });
    }

    /**
     * Calls a stable listener snapshot so callbacks may unsubscribe safely.
     *
     * @param listeners - Callbacks to invoke once.
     * @returns No value.
     */
    private emit(listeners: ReadonlySet<() => void>): void {
        [...listeners].forEach((listener) => listener());
    }

    /**
     * Publishes at most one hierarchy notification for a CRDT transaction.
     *
     * @param transaction - Adapter transaction identity used for deduplication.
     * @returns No value.
     */
    private emitStructure(transaction: unknown): void {
        if (this.lastStructureTransaction === transaction) return;
        this.lastStructureTransaction = transaction;
        this.emit(this.structureListeners);
    }

    /**
     * Checks placement through the maintained index outside transactions.
     * Reads inside a transaction inspect live arrays because observers update
     * the index only after the transaction commits.
     * @param id - Block identifier to locate.
     * @returns Whether the block is currently placed in the tree.
     */
    private isPlaced(id: string): boolean {
        return this.crdt.isTransacting ? Boolean(this.findContainer(id)) : this.cache.hasParent(id);
    }

    /**
     * Resolves a validated cached path or searches the current CRDT tree.
     * Paths are intentionally repaired only when the corresponding ID is read.
     *
     * @param id - Block identifier whose containing array is required.
     * @returns Current array, index, parent, and path, or undefined when unplaced.
     */
    private findContainer(id: string): LocatedBlock | undefined {
        if (!this.storage.has(id)) {
            this.cache.deletePath(id);
            return undefined;
        }

        const cached = this.cache.getPath(id);
        const resolved = cached ? this.resolvePath(cached) : undefined;
        if (resolved?.id === id) return { ...resolved, path: cached! };

        const path = this.findPath(id);
        if (!path) {
            this.cache.deletePath(id);
            return undefined;
        }
        this.cache.setPath(id, path);
        const found = this.resolvePath(path);
        return found ? { ...found, path } : undefined;
    }

    /**
     * Walks sibling indexes from roots to one current tree location.
     *
     * @param path - Root-to-descendant sibling indexes to resolve.
     * @returns Located block metadata, or undefined when any path segment is stale.
     */
    private resolvePath(path: readonly number[]): Omit<LocatedBlock, "path"> & { id: string } | undefined {
        if (!path.length) return undefined;
        let array = this.roots;
        let parentId: string | undefined;
        for (let depth = 0; depth < path.length; depth += 1) {
            const index = path[depth]!;
            if (!Number.isInteger(index) || index < 0 || index >= array.length) return undefined;
            const rawId = array.get(index);
            if (typeof rawId !== "string") return undefined;
            if (depth === path.length - 1) return { id: rawId, array, index, parentId };
            const block = this.storage.get(rawId);
            if (!isCRDTMap(block)) return undefined;
            parentId = rawId;
            array = this.requiredArray(block, "children");
        }
        return undefined;
    }

    /**
     * Finds one identifier by walking only root and child arrays.
     *
     * @param id - Block identifier to search for.
     * @returns Root-to-block sibling indexes, or undefined when unplaced.
     */
    private findPath(id: string): readonly number[] | undefined {
        const visited = new Set<string>();
        const visit = (array: CRDTArray<string>, prefix: readonly number[]): readonly number[] | undefined => {
            for (let index = 0; index < array.length; index += 1) {
                const rawId = array.get(index);
                if (typeof rawId !== "string") continue;
                const path = [...prefix, index];
                if (rawId === id) return path;
                if (visited.has(rawId)) continue;
                visited.add(rawId);
                const block = this.storage.get(rawId);
                if (!isCRDTMap(block)) continue;
                const found = visit(this.requiredArray(block, "children"), path);
                if (found) return found;
            }
            return undefined;
        };
        return visit(this.roots, []);
    }

    /**
     * Deletes a block and all descendants from the block map.
     *
     * Path-cache entries are removed with the tree. A visited set stops
     * recursive ownership cycles from looping forever.
     *
     * @param id - Root ID of the subtree to delete.
     * @param visited - IDs already removed during this walk.
     * @returns No value.
     */
    private removeTree(id: string, visited = new Set<string>()): void {
        if (visited.has(id)) return;
        visited.add(id);
        this.cache.deletePath(id);
        const value = this.storage.get(id);
        if (!isCRDTMap(value)) return;
        strings(this.requiredArray(value, "children")).forEach((child) => this.removeTree(child, visited));
        this.storage.delete(id);
    }

    /**
     * Applies caller-owned prop keys without rebuilding the live CRDT map.
     *
     * @param props - Shared property map to patch.
     * @param patch - Property keys owned by this operation.
     * @returns No value.
     */
    private patchProps(
        props: CRDTMap<Record<string, CRDTType>>,
        patch: Record<string, unknown>,
    ): void {
        Object.entries(patch).forEach(([key, value]) => {
            if (value !== undefined) assertPortableValue(value, `block.props.${key}`);
            if (value === undefined) props.delete(key);
            else props.set(key, clone(value) as CRDTType);
        });
    }

    /**
     * Reads a block map or fails with a domain-specific message.
     *
     * @param id - Block ID to resolve.
     * @returns Stored block map.
     * @throws If the block does not exist.
     */
    private requiredBlock(id: string): CRDTMap<BlockStorage> {
        const value = this.storage.get(id);
        if (!isCRDTMap(value)) throw new Error(`Block ${id} not found`);
        return value;
    }

    /**
     * Reads the immutable native type stored on a block.
     *
     * Missing types indicate malformed shared data and are rejected instead of
     * silently changing the block into a built-in editor type.
     *
     * @param block - Stored block map to inspect.
     * @param id - Block ID included in a descriptive error.
     * @returns The non-empty native block type.
     * @throws If shared storage does not contain a valid type.
     */
    private requiredType(block: CRDTMap<BlockStorage>, id: string): string {
        const type = block.get("type");
        if (typeof type !== "string" || !type) throw new Error(`Block ${id} has no type`);
        return type;
    }

    /**
     * Reads a required map field from a parent map.
     *
     * @param parent - Parent shared map.
     * @param key - Field expected to contain a CRDT map.
     * @returns Nested shared map.
     * @throws If the field is absent or has the wrong shared type.
     */
    private requiredMap<Schema extends object, Key extends keyof Schema & string>(
        parent: CRDTMap<Schema>,
        key: Key,
    ): Extract<Schema[Key], CRDTMap<any>> {
        const value = parent.get(key);
        if (!isCRDTMap(value)) throw new Error(`Expected CRDTMap at ${key}`);
        return value as Extract<Schema[Key], CRDTMap<any>>;
    }

    /**
     * Reads a required array field from a parent map.
     *
     * @param parent - Parent shared map.
     * @param key - Field expected to contain a CRDT array.
     * @returns Nested shared array.
     * @throws If the field is absent or has the wrong shared type.
     */
    private requiredArray<Schema extends object, Key extends keyof Schema & string>(
        parent: CRDTMap<Schema>,
        key: Key,
    ): Extract<Schema[Key], CRDTArray<any>> {
        const value = parent.get(key);
        if (!isCRDTArray(value)) throw new Error(`Expected CRDTArray at ${key}`);
        return value as Extract<Schema[Key], CRDTArray<any>>;
    }

    /**
     * Reads a required text field from a parent map.
     *
     * @param parent - Parent shared map.
     * @param key - Field expected to contain collaborative text.
     * @returns Nested collaborative text.
     * @throws If the field is absent or has the wrong shared type.
     */
    private requiredText<Schema extends object, Key extends keyof Schema & string>(
        parent: CRDTMap<Schema>,
        key: Key,
    ): Extract<Schema[Key], CRDTText> {
        const value = parent.get(key);
        if (!isCRDTText(value)) throw new Error(`Expected CRDTText at ${key}`);
        return value as Extract<Schema[Key], CRDTText>;
    }
}
