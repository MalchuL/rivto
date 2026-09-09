/**
 * Stores collaborative block records, text, and ordered subtree placement.
 * Keeps IDs stable, validates writes before mutation, and repairs cached paths.
 * Editor commands and outline policies belong to the public block manager;
 * this layer supplies generic storage operations and snapshot validation.
 */
import {
    CRDTType,
    CRDTArray,
    CRDTMap,
    CRDTText,
} from "@chulane/crdt-doc";
import type {
    Block,
    BlockInput,
    BlockListProps,
    BlockPatch,
    BlockUpdate,
    DocumentModel,
    GenerateId,
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
import { Pipe } from "../../../utils/pipe";
import type { BlockPipeContext } from "./block-pipe";
import {
    contentFrom,
    strings,
    validateBlockForest,
    validateBlockListProps,
} from "./utils";

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
 * container identities and lazily repairs cached tree paths. Plugin constraints are
 * registered on `pipe` and processed against portable block instances before
 * writes.
 */
export class DocumentBlockManager {
    /** Collaborative containers tracked by the owning document's undo manager. */
    readonly undoScopes: readonly [CRDTMap<Record<IDBlock, CRDTMap<BlockStorage>>>, CRDTArray<IDBlock>];

    /** Priority-ordered processors applied to portable blocks before writes. */
    readonly pipe = new Pipe<BlockInput, BlockPipeContext>();
    /**
     * Creates a block identity when an insert omits `id`.
     *
     * Replace this per manager; it is independent of element identity generation.
     * The default uses `crypto.randomUUID`.
     */
    generateId: GenerateId = () => crypto.randomUUID();
    /** Cached block paths for each block. */
    private readonly blockPaths = new Map<IDBlock, readonly number[]>();
    /** Root blocks. */
    private readonly roots: CRDTArray<IDBlock>;
    /** Block storage. */
    private readonly storage: CRDTMap<Record<IDBlock, CRDTMap<BlockStorage>>>;

    /**
     * Creates a block manager over existing collaborative document storage.
     *
     * @param document - Owning document model providing CRDT and transaction boundaries.
     */
    constructor(private readonly document: DocumentModel) {
        this.roots = document.crdt.getArray<IDBlock>(ROOTS_KEY);
        this.storage = document.crdt.getMap<Record<IDBlock, CRDTMap<BlockStorage>>>(BLOCKS_KEY);
        this.undoScopes = [this.storage, this.roots];
    }

    /**
     * Runs one semantic block mutation through the owning document transaction.
     *
     * @param operation - Synchronous block mutation to execute atomically.
     * @returns No value.
     */
    private transact(operation: () => void): void {
        this.document.transact(operation);
    }

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
        if (!this.findContainer(id)) return undefined;
        return this.readBlock(id, new Set());
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
        return strings(this.roots);
    }

    /**
     * Reads one block's direct child identifiers.
     *
     * @param id - Parent block identifier to inspect.
     * @returns Child identifiers in collaborative order, or an empty list when absent.
     */
    getChildIds(id: string): string[] {
        if (!this.findContainer(id)) return [];
        const value = this.storage.get(id);
        return isCRDTMap(value) ? strings(this.requiredArray(value, "children")) : [];
    }

    /**
     * Resolves one block's current structural parent.
     *
     * @param id - Block identifier to locate in the tree.
     * @returns Parent identifier, null for a root, or undefined when absent.
     */
    getParentId(id: string): string | null | undefined {
        const found = this.findContainer(id);
        return found ? found.parentId ?? null : undefined;
    }

    /**
     * Inserts a block into an ordered root or sibling list.
     *
     * @param block - Initial portable block data including its required native type.
     * @param afterId - Sibling to insert after block id, `null` for first, or omitted for last.
     * @returns Stable ID of the inserted block, either supplied or from `generateId`.
     * @throws If the ID already exists or the requested sibling is missing.
     */
    insertBlock(block: BlockInput, afterId?: string | null): string {
        if (!block.type) throw new Error("Block type is required");
        const container = this.resolveInsertContainer(afterId);
        this.validateInsertedForest([block], this.resolveInsertParentType(afterId));
        let id = "";
        this.transact(() => {
            id = this.insertInto(block, container, afterId, this.resolveInsertParentType(afterId));
        });
        return id;
    }

    /**
     * Patch only supplied block fields. Nested CRDT containers stay alive so
     * unrelated concurrent edits are not discarded by whole-object replacement.
     *
     * @param id - ID of the block to update.
     * @param patch - Fields to validate and apply.
     * @throws If the block does not exist.
     * @returns No value.
     */
    updateBlock(id: string, patch: BlockPatch): void {
        this.updateBlocks([{ id, patch }]);
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
     * @returns No value.
     */
    updateBlocks(updates: readonly BlockUpdate[]): void {
        const simulatedProps = new Map<string, Record<string, unknown>>();
        const simulatedListProps = new Map<string, BlockListProps>();
        const prepared = updates.map(({ id, patch }) => {
            const block = this.requiredBlock(id);
            const type = this.requiredType(block, id);
            let validatedListProps: BlockListProps | undefined;
            if (patch.listProps) {
                const current = simulatedListProps.get(id)
                    ?? validateBlockListProps(this.requiredMap(block, "listProps").toObject());
                validatedListProps = validateBlockListProps({ ...current, ...patch.listProps });
                simulatedListProps.set(id, validatedListProps);
            }
            let validatedProps: Record<string, unknown> | undefined;
            if (patch.props) {
                const current = simulatedProps.get(id)
                    ?? this.requiredMap(block, "props").toObject() as Record<string, unknown>;
                Object.entries(patch.props).forEach(([key, value]) => {
                    if (value !== undefined) assertPortableValue(value, `block.props.${key}`);
                });
                validatedProps = this.processBlock({
                    ...this.storedBlockInput(id),
                    type,
                    props: { ...current, ...patch.props },
                    listProps: simulatedListProps.get(id)
                        ?? this.requiredMap(block, "listProps").toObject(),
                }).props ?? {};
                simulatedProps.set(id, validatedProps);
            }
            if (patch.pluginData) assertPortableRecord(patch.pluginData, "block.pluginData");
            return { block, patch, validatedListProps, validatedProps };
        });

        this.transact(() => {
            prepared.forEach(({ block, patch, validatedListProps, validatedProps }) => {
                if (validatedListProps && patch.listProps) {
                    assignMap(this.requiredMap(block, "listProps"), { ...patch.listProps }, false);
                }
                if (patch.props && validatedProps) {
                    const props = this.requiredMap(block, "props");
                    for (const key of Object.keys(patch.props)) {
                        const value = validatedProps[key];
                        if (value === undefined) props.delete(key);
                        else props.set(key, clone(value) as CRDTType);
                    }
                }
                if (patch.pluginData) assignMap(this.requiredMap(block, "pluginData"), patch.pluginData, false);
                if (patch.content !== undefined) assignText(this.requiredText(block, "content"), patch.content);
            });
        });
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
        const nextProps = this.processBlock({
            ...this.storedBlockInput(id),
            type,
            props,
        }).props ?? {};
        this.transact(() => {
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
        this.transact(() => {
            const block = this.requiredBlock(id);
            this.patchProps(id, String(block.get("type")), this.requiredMap(block, "props"), { [key]: value });
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
        this.transact(() => prepared.forEach(({ map, keys }) => keys.forEach((key) => map.delete(key))));
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
        this.transact(() => {
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
        this.transact(() => {
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
        this.transact(() => {
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
        this.transact(() => {
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
        this.transact(() => {
            const found = this.findContainer(id);
            if (!found) return;
            this.removeTree(id);
            found.array.delete(found.index, 1);
        });
    }

    /**
     * Relocates one subtree without choosing editor-specific grouping behavior.
     *
     * @param id - Placed subtree root to move.
     * @param targetId - Placement anchor, or null for the current sibling-list start.
     * @param position - Placement before, after, or appended inside the anchor.
     * @returns No value.
     */
    moveBlock(id: string, targetId: string | null, position: "before" | "after" | "inside" = "after"): void {
        this.relocateBlocks([{ id, targetId, position }]);
    }

    /**
     * Applies explicit subtree placements after validating the complete sequence.
     *
     * Editors decide which subtrees to move. Storage checks destination parent
     * constraints and cycles before any write because CRDT transactions cannot
     * roll back. Later placements observe the parents established by earlier ones.
     *
     * @param placements - Ordered subtree moves with explicit placement anchors.
     * @returns No value.
     * @throws When a source or anchor is unplaced, a cycle forms, or a pipe rejects placement.
     */
    relocateBlocks(placements: readonly {
        id: string;
        targetId: string | null;
        position: "before" | "after" | "inside";
    }[]): void {
        const parents = new Map<string, string | null>();
        /**
         * Resolves a parent after preceding simulated moves.
         * @param id - Placed block identifier.
         * @returns Its simulated or current parent.
         */
        const parentOf = (id: string): string | null => parents.has(id)
            ? parents.get(id)!
            : this.getParentId(id) ?? null;
        const moves = placements.filter(({ id, targetId }) => id !== targetId);
        for (const { id, targetId, position } of moves) {
            if (!this.findContainer(id)) throw new Error(`Block ${id} not found`);
            if (targetId !== null && !this.findContainer(targetId)) {
                throw new Error(`Target block ${targetId} not found`);
            }
            // Even a sibling placement beside a descendant is rejected: its
            // anchor belongs to the subtree being detached.
            let ancestor = targetId;
            while (ancestor !== null) {
                if (ancestor === id) throw new Error(`Cannot move block ${id} relative to its descendant ${targetId}`);
                ancestor = parentOf(ancestor);
            }
            const parentId = targetId === null ? parentOf(id)
                : position === "inside" ? targetId : parentOf(targetId);
            // Preserve the existing null-anchor contract: root eligibility is
            // checked even though placement prepends within the current list.
            this.processBlock(this.storedBlockInput(id), targetId === null || parentId === null
                ? null : this.requiredType(this.requiredBlock(parentId), parentId));
            parents.set(id, parentId);
        }
        this.transact(() => {
            for (const { id, targetId, position } of moves) {
                const source = this.findContainer(id)!;
                const target = targetId === null ? source.array
                    : position === "inside" ? this.requiredArray(this.requiredBlock(targetId), "children")
                        : this.findContainer(targetId)!.array;
                source.array.delete(source.index, 1);
                const index = targetId === null ? 0 : position === "inside" ? target.length
                    : strings(target).indexOf(targetId) + (position === "after" ? 1 : 0);
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
        this.blockPaths.clear();
        this.roots.delete(0, this.roots.length);
        this.storage.clear();
        blocks.forEach((block) => this.insertInto(block, this.roots));
    }

    /**
     * Validates portable block trees before a snapshot transaction starts.
     *
     * Validation precedes destructive replacement because CRDT transactions do
     * not roll back writes when an operation throws. Unique IDs, nonempty types,
     * portable records, schema props, and acyclic children are all required.
     *
     * @param blocks - Portable root block trees to validate recursively.
     * @returns No value.
     * @throws {Error} When any descendant is malformed, duplicated, or cyclic.
     */
    validateBlocks(blocks: readonly Block[]): void {
        validateBlockForest(blocks, {
            requireComplete: true,
            pipe: this.pipe,
            parentType: null,
        });
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
        this.transact(() => {
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
     * Creates CRDT containers for a block and inserts its ID into an ordered list.
     *
     * @param block - Portable block data, including its type and optional descendants.
     * @param container - Root or child array that receives the block ID.
     * @param afterId - Sibling to insert after, `null` for first, or omitted for last.
     * @param parentType - Native type of the insertion parent, or `null` for roots.
     * @returns Stable ID assigned to the block, either supplied or from `generateId`.
     * @throws If the ID already exists or the requested sibling is missing.
     */
    private insertInto(
        block: BlockInput,
        container: CRDTArray<string>,
        afterId?: string | null,
        parentType: string | null = null,
    ): string {
        if (!block.type) throw new Error("Block type is required");
        const validated = this.processBlock(block, parentType);
        const listProps = validateBlockListProps(validated.listProps ?? {});
        const id = requireNonemptyId(validated.id ?? this.generateId(), "Block");
        if (this.storage.has(id)) throw new Error(`Block ${id} already exists`);
        const index = this.placementIndex(container, afterId);
        const model = this.document.crdt.instantiator.createMap<BlockStorage>();
        const props = this.document.crdt.instantiator.createMap<Record<string, CRDTType>>();
        const content = this.document.crdt.instantiator.createText();
        const children = this.document.crdt.instantiator.createArray<string>();
        const listPropsStorage = this.document.crdt.instantiator.createMap<BlockListPropsStorage>();
        const pluginData = this.document.crdt.instantiator.createMap<Record<string, CRDTType>>();
        model.set("id", id);
        model.set("type", validated.type);
        model.set("listProps", listPropsStorage);
        model.set("props", props);
        model.set("content", content);
        model.set("children", children);
        model.set("pluginData", pluginData);
        this.storage.set(id, model);
        assignMap(listPropsStorage, { ...listProps }, true);
        assignMap(props, validated.props ?? {});
        assignText(content, contentFrom(validated.content));
        assignMap(pluginData, validated.pluginData ?? {});
        validated.children?.forEach((child) => this.insertInto(child, children, undefined, validated.type));
        container.insert(index, id);
        return id;
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
     * Resolves the parent type that will own an insertion.
     *
     * @param afterId - Sibling to insert after, `null` for first, or omitted for last.
     * @returns Parent native type, or `null` when the insertion is a document root.
     */
    private resolveInsertParentType(afterId?: string | null): string | null {
        if (afterId === undefined || afterId === null) return null;
        const found = this.findContainer(afterId);
        if (!found) throw new Error(`Target block ${afterId} not found`);
        return found.parentId == null ? null : this.requiredType(this.requiredBlock(found.parentId), found.parentId);
    }

    /**
     * Preflights one inserted forest against current storage before writing.
     *
     * @param blocks - Root inputs that will be written in one insertion.
     * @param parentType - Native type of the insertion parent, or `null` for roots.
     * @returns No value.
     * @throws {Error} When any descendant is malformed or collides with storage.
     */
    private validateInsertedForest(blocks: readonly BlockInput[], parentType: string | null): void {
        validateBlockForest(blocks, {
            existingIds: new Set([...this.storage.keys()]),
            pipe: this.pipe,
            parentType,
        });
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
        const props = this.requiredMap(value, "props").toObject() as Record<IDProp, unknown>;
        const pluginData = this.requiredMap(value, "pluginData").toObject() as Record<IDPlugin, unknown>;
        const content = this.requiredText(value, "content").toString();
        const children = strings(this.requiredArray(value, "children")).flatMap((childId: IDBlock) => {
            const child = this.readBlock(childId, visited);
            return child ? [child] : [];
        });
        return {
            id,
            type: this.requiredType(value, id),
            listProps: validateBlockListProps(this.requiredMap(value, "listProps").toObject()),
            props,
            pluginData,
            content,
            children,
        };
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
            this.blockPaths.delete(id);
            return undefined;
        }

        const cached = this.blockPaths.get(id);
        const resolved = cached ? this.resolvePath(cached) : undefined;
        if (resolved?.id === id) return { ...resolved, path: cached! };

        const path = this.findPath(id);
        if (!path) {
            this.blockPaths.delete(id);
            return undefined;
        }
        this.blockPaths.set(id, path);
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
        this.blockPaths.delete(id);
        const value = this.storage.get(id);
        if (!isCRDTMap(value)) return;
        strings(this.requiredArray(value, "children")).forEach((child) => this.removeTree(child, visited));
        this.storage.delete(id);
    }

    /**
     * Runs the block pipe against one portable block instance.
     *
     * @param block - Candidate block, typically a stored snapshot or insert input.
     * @param parentType - Destination parent type; omitted uses the stored parent.
     * @returns The original block or a processor-normalized replacement.
     */
    private processBlock(block: BlockInput, parentType?: string | null): BlockInput {
        const resolvedParent = parentType !== undefined
            ? parentType
            : (block.id ? this.currentParentType(block.id) : null);
        return this.pipe.process(block, { parentType: resolvedParent });
    }

    /**
     * Resolves the native type of a block's current tree parent.
     *
     * @param id - Placed block identifier.
     * @returns Parent native type, or `null` for a root or unplaced block.
     */
    private currentParentType(id: string): string | null {
        const parentId = this.findContainer(id)?.parentId;
        return parentId == null ? null : this.requiredType(this.requiredBlock(parentId), parentId);
    }

    /**
     * Snapshots one stored block as portable input without walking children.
     *
     * Child trees are omitted so node-level validators cannot recurse through
     * descendants that are not part of the current operation.
     *
     * @param id - Stored block identifier to materialize.
     * @returns Detached block input for the requested record.
     */
    private storedBlockInput(id: string): BlockInput {
        const block = this.requiredBlock(id);
        return {
            id,
            type: this.requiredType(block, id),
            listProps: this.requiredMap(block, "listProps").toObject(),
            props: this.requiredMap(block, "props").toObject() as Record<string, unknown>,
            pluginData: this.requiredMap(block, "pluginData").toObject() as Record<string, unknown>,
            content: this.requiredText(block, "content").toString(),
        };
    }

    /**
     * Applies caller-owned prop keys without rebuilding the live CRDT map.
     *
     * @param id - Block identifier used to resolve the current parent type.
     * @param type - Block type used when reconstructing the portable block.
     * @param props - Shared property map to patch.
     * @param patch - Property keys owned by this operation.
     * @returns No value.
     */
    private patchProps(
        id: string,
        type: string,
        props: CRDTMap<Record<string, CRDTType>>,
        patch: Record<string, unknown>,
    ): void {
        const validated = this.processBlock({
            ...this.storedBlockInput(id),
            type,
            props: { ...props.toObject(), ...patch } as Record<string, unknown>,
        }).props ?? {};
        for (const key of Object.keys(patch)) {
            const value = validated[key];
            if (value === undefined) props.delete(key);
            else props.set(key, clone(value) as CRDTType);
        }
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
