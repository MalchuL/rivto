import {
    BasicCRDTType,
    CRDTArray,
    CRDTMap,
    CRDTText,
} from "../../../../crdt-doc";
import type {
    Block,
    BlockInput,
    BlockPatch,
    BlockPropsValidator,
    BlockUpdate,
    DocumentModel,
} from "../../types";
import type {
    BlockListPropsStorage,
    BlockStorage,
    IDBlock,
    IDPlugin,
    IDProp,
} from "../../types/storage";
import { assignMap, assignText, clone, isCRDTArray, isCRDTMap, isCRDTText } from "../../utils";
import { contentFrom, strings, validateBlockListProps, type BlockListProps } from "./utils";

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
 * container identities, lazily repairs cached tree paths, and coordinates link
 * cleanup whenever a block operation removes endpoints.
 */
export class DocumentBlockManager {
    /** Collaborative containers tracked by the owning document's undo manager. */
    readonly undoScopes: readonly [CRDTMap<Record<IDBlock, CRDTMap<BlockStorage>>>, CRDTArray<IDBlock>];

    /** Block property validator. */
    private validateProps: BlockPropsValidator = (_type, props) => props;
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
     * Installs block-property validation without coupling storage to plugins.
     *
     * @param validator - Function that validates and normalizes props by block type.
     * @returns No value.
     */
    setPropsValidator(validator: BlockPropsValidator): void {
        this.validateProps = validator;
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
     * Link validation uses this storage-level check even when a concurrent move
     * has temporarily detached the block from the ordered tree.
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
     * @returns Stable ID of the inserted block.
     * @throws If the ID already exists or the requested sibling is missing.
     */
    insertBlock(block: BlockInput, afterId?: string | null): string {
        if (!block.type) throw new Error("Block type is required");
        let id = "";
        this.transact(() => {
            const container = afterId ? this.findContainer(afterId)?.array ?? this.roots : this.roots;
            id = this.insertInto(block, container, afterId);
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
                validatedProps = this.validateProps(type, { ...current, ...patch.props });
                simulatedProps.set(id, validatedProps);
            }
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
                        else props.set(key, clone(value) as BasicCRDTType);
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
        this.transact(() => {
            const block = this.requiredBlock(id);
            const nextProps = this.validateProps(type, props);
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
            this.patchProps(String(block.get("type")), this.requiredMap(block, "props"), { [key]: value });
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
            else data.set(pluginId, clone(value) as BasicCRDTType);
        });
    }

    /**
     * Reconcile DOM plain text as the smallest delete/insert range possible.
     * This preserves CRDTText identity and unchanged formatted runs.
     *
     * @param id - ID of the text block.
     * @param text - Complete plain-text value received from the view.
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
     * Removes a block subtree and every link touching a removed descendant.
     *
     * @param id - Root ID of the subtree to remove.
     * @returns No value.
     */
    removeBlock(id: string): void {
        this.transact(() => {
            const found = this.findContainer(id);
            if (!found) return;
            const removed = new Set(this.collectTreeIds(id));
            this.removeTree(id);
            found.array.delete(found.index, 1);
            this.document.links.removeForBlockIds(removed);
        });
    }

    /**
     * Joins two blocks while preserving the target block's identity.
     *
     * This is the document operation used when Backspace is pressed at the
     * beginning of a block. For example, merging `"World"` into `"Hello "`
     * produces one target block containing `"Hello World"`; the source block
     * no longer exists.
     *
     * A merge transfers more than text. Source children are appended after the
     * target's existing children, preserving their relative order. Links that
     * point directly to the removed source are deleted because their endpoint
     * would otherwise be invalid. The source's other fields are intentionally
     * discarded: the target keeps its type, props, and plugin data.
     *
     * Every mutation runs inside one CRDT transaction. Remote collaborators see
     * one coherent change, and Undo restores the entire source block—including
     * its text and children—in one step.
     *
     * @param targetId - Block that remains in the document and receives content.
     * @param sourceId - Block whose text and children are transferred, then removed.
     * @returns The target's original text length. A view can place the caret at
     * this offset, which is the boundary between the old target and source text.
     * @throws If either block is missing, both IDs match, or target is inside source.
     */
    mergeBlocks(targetId: string, sourceId: string): number {
        if (targetId === sourceId) throw new Error("Cannot merge a block into itself");

        let joinOffset = 0;
        this.transact(() => {
            // Keep the source's parent array and index so its tree entry can be
            // removed after its transferable data has been copied to the target.
            const sourceContainer = this.findContainer(sourceId);
            if (!sourceContainer) throw new Error(`Block ${sourceId} not found`);

            // Moving a source into one of its own descendants would leave that
            // descendant referring to a deleted ancestor and corrupt the tree.
            if (this.collectTreeIds(sourceId).includes(targetId)) {
                throw new Error(`Cannot merge block ${sourceId} into its descendant ${targetId}`);
            }

            const target = this.requiredBlock(targetId);
            const source = this.requiredBlock(sourceId);
            const targetContent = this.requiredText(target, "content");
            const sourceContent = this.requiredText(source, "content").toString();
            const targetChildren = this.requiredArray(target, "children");
            const sourceChildren = this.requiredArray(source, "children");
            const sourceChildIds = strings(sourceChildren);

            // Capture this before inserting source text. The Backspace plugin
            // uses the returned boundary to restore the caret after React rerenders.
            joinOffset = targetContent.length;
            if (sourceContent) targetContent.insert(joinOffset, sourceContent);
            if (sourceChildIds.length > 0) {
                // A CRDT child array is ownership, not a copy. Detach the child
                // IDs from the source before attaching them to the target so a
                // child appears in exactly one parent list throughout the change.
                sourceChildren.delete(0, sourceChildIds.length);
                targetChildren.push(...sourceChildIds);
            }

            // Remove both representations of the source: its ID in the tree and
            // its stored block record. The moved children remain stored normally.
            sourceContainer.array.delete(sourceContainer.index, 1);
            this.storage.delete(sourceId);

            // Links address blocks by ID. Once sourceId is gone, links touching
            // it cannot be resolved and must be removed in the same transaction.
            this.document.links.removeForBlockIds(new Set([sourceId]));
        });
        return joinOffset;
    }

    /**
     * Moves a block within its sibling list by editing the ordered CRDT array.
     *
     * @param id - ID of the block to move.
     * @param targetId - Sibling to move beside, or `null` to move to the start.
     * @param position - Whether to insert before, after, or inside the target. "inside" is append to the target childrent at the end.
     * @throws If the block or target sibling does not exist.
     * @returns No value.
     */
    moveBlock(id: string, targetId: string | null, position: "before" | "after" | "inside" = "after"): void {
        if (id === targetId) return;
        this.transact(() => {
            const source = this.findContainer(id);
            if (!source) throw new Error(`Block ${id} not found`);
            // A subtree cannot be inserted into its own descendants. Besides
            // being an invalid outline operation, doing so would create a
            // recursive ownership cycle that detached snapshots cannot render.
            if (targetId !== null && this.collectTreeIds(id).includes(targetId)) {
                throw new Error(`Cannot move block ${id} relative to its descendant ${targetId}`);
            }
            const targetBlock = targetId === null ? undefined : this.requiredBlock(targetId);
            const target = position === "inside" && targetBlock
                ? this.requiredArray(targetBlock, "children")
                : targetId === null ? source.array : this.findContainer(targetId)?.array;
            if (!target) throw new Error(`Target block ${targetId} not found`);
            source.array.delete(source.index, 1);
            const targetIndex = targetId === null ? 0 : strings(target).indexOf(targetId);
            const index = position === "inside"
                ? target.length
                : targetId === null ? 0 : Math.max(0, targetIndex + (position === "after" ? 1 : 0));
            target.insert(index, id);
        });
    }

    /**
     * Moves sibling block roots as one ordered, atomic operation.
     *
     * Selected descendants are ignored because moving their selected ancestor
     * already carries them. Every remaining root must belong to the same direct
     * parent; accepting mixed source levels would make one drag silently change
     * the relative hierarchy of otherwise independent branches.
     *
     * @param ids - Selected block IDs in any order, including descendants.
     * @param targetId - Block beside or inside which the roots are inserted.
     * @param position - Placement relative to `targetId`.
     * @throws If selected roots are not siblings or target their own subtree.
     * @returns No value.
     */
    moveBlocks(
        ids: string[],
        targetId: string | null,
        position: "before" | "after" | "inside" = "after",
    ): void {
        this.transact(() => {
            const roots = this.selectedTopLevelRoots(ids);
            if (!roots.length) return;
            const parentId = this.findContainer(roots[0]!)?.parentId;
            if (roots.some((id) => this.findContainer(id)?.parentId !== parentId)) {
                throw new Error("Moved blocks must share the same parent");
            }
            if (targetId !== null && roots.some((id) => this.collectTreeIds(id).includes(targetId))) {
                throw new Error(`Cannot move blocks relative to their descendant ${targetId}`);
            }

            // Repeated "after" and root-start insertions target the same index,
            // so process from the end to retain visible source order. "before"
            // and "inside" naturally retain order when processed forwards.
            const ordered = targetId === null || position === "after" ? [...roots].reverse() : roots;
            ordered.forEach((id) => this.moveBlock(id, targetId, position));
        });
    }

    /**
     * Nests a block under its preceding sibling.
     *
     * @param id - ID of the block to indent.
     * @returns No value.
     */
    indentBlock(id: string): void {
        this.indentBlocks([id]);
    }

    /**
     * Nests consecutive selected roots under the first root's previous sibling.
     *
     * Descendants whose ancestors are also selected are removed from the move
     * list: moving the selected ancestor already carries its complete subtree.
     * The remaining roots must cover one uninterrupted visible range. If the
     * first root has no previous sibling, the complete operation is a no-op;
     * later roots are never partially indented. This matches grouped
     * outliner behavior and keeps the supplied roots at the same new depth.
     *
     * @param ids - Selected block IDs in any order, including descendants.
     * @returns No value.
     */
    indentBlocks(ids: string[]): void {
        this.transact(() => {
            const roots = this.selectedTopLevelRoots(ids);
            if (!this.isConsecutiveSelection(roots)) return;
            const source = this.findContainer(roots[0]!);
            if (!source || source.index === 0) return;
            const parent = this.requiredBlock(String(source.array.get(source.index - 1)));
            roots.forEach((rootId) => {
                const current = this.findContainer(rootId);
                if (current) current.array.delete(current.index, 1);
            });
            this.requiredArray(parent, "children").push(...roots);
        });
    }

    /**
     * Moves a nested block directly after its parent and adopts later siblings.
     *
     * Following siblings become children of the outdented block, preserving the
     * visible tree order: the block's existing children stay first, followed by
     * the siblings that previously appeared after it. Removing and reinserting
     * every affected ID inside this method's transaction publishes one update
     * and creates one undoable tree operation.
     *
     * @param id - ID of the block to outdent.
     * @returns No value.
     */
    outdentBlock(id: string): void {
        this.outdentBlocks([id]);
    }

    /**
     * Outdents consecutive selected roots as one ordered group.
     *
     * Only top-level selected roots move, so selected descendants travel with
     * their selected ancestor exactly once. The group is inserted directly
     * after its parent. Unselected siblings following the last moved root become
     * children of that last root, preserving the visible outline order and the
     * direct-outdent behavior used by the single-block command.
     *
     * Selection that begins at root depth or skips visible blocks is a no-op.
     * All detach, insert, and adoption mutations share one CRDT transaction.
     *
     * @param ids - Selected block IDs in any order, including descendants.
     * @returns No value.
     */
    outdentBlocks(ids: string[]): void {
        this.transact(() => {
            const roots = this.selectedTopLevelRoots(ids);
            if (!this.isConsecutiveSelection(roots)) return;
            const source = this.findContainer(roots[0]!);
            if (!source?.parentId) return;
            const parentContainer = this.findContainer(source.parentId);
            if (!parentContainer) return;

            // A range may continue with blocks already at the destination depth.
            // Stop before them instead of moving them one level too far.
            const firstDestinationLevel = roots.findIndex(
                (rootId) => this.findContainer(rootId)?.parentId === parentContainer.parentId,
            );
            const moving = firstDestinationLevel < 0 ? roots : roots.slice(0, firstDestinationLevel);
            if (!moving.length) return;
            const last = this.findContainer(moving.at(-1)!);
            if (!last) return;
            const followingSiblingIds = strings(last.array).slice(last.index + 1);

            moving.forEach((rootId) => {
                const current = this.findContainer(rootId);
                if (current) current.array.delete(current.index, 1);
            });
            followingSiblingIds.forEach((siblingId) => {
                const current = this.findContainer(siblingId);
                if (current) current.array.delete(current.index, 1);
            });
            parentContainer.array.insert(parentContainer.index + 1, ...moving);
            if (followingSiblingIds.length > 0) {
                this.requiredArray(this.requiredBlock(moving.at(-1)!), "children").push(...followingSiblingIds);
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
        this.roots.delete(0, this.roots.length);
        this.storage.clear();
        blocks.forEach((block) => this.insertInto(block, this.roots));
    }

    /**
     * Validates portable block trees before a snapshot transaction starts.
     *
     * Validation precedes destructive replacement because CRDT transactions do
     * not roll back writes when an operation throws.
     *
     * @param blocks - Portable root block trees to validate recursively.
     * @returns No value.
     * @throws {Error} When list properties or child collections are malformed.
     */
    validateBlocks(blocks: readonly Block[]): void {
        const validate = (block: Block): void => {
            validateBlockListProps(block.listProps);
            if (!Array.isArray(block.children)) throw new Error("Snapshot block children must be an array");
            block.children.forEach(validate);
        };
        blocks.forEach(validate);
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
     * @returns Stable ID assigned to the block.
     * @throws If the ID already exists or the requested sibling is missing.
     */
    private insertInto(block: BlockInput, container: CRDTArray<string>, afterId?: string | null): string {
        if (!block.type) throw new Error("Block type is required");
        const listProps = validateBlockListProps(block.listProps ?? {});
        const id = block.id ?? crypto.randomUUID();
        if (this.storage.has(id)) throw new Error(`Block ${id} already exists`);
        const model = this.document.crdt.instantiator.createMap<BlockStorage>();
        const props = this.document.crdt.instantiator.createMap<Record<string, BasicCRDTType>>();
        const content = this.document.crdt.instantiator.createText();
        const children = this.document.crdt.instantiator.createArray<string>();
        const listPropsStorage = this.document.crdt.instantiator.createMap<BlockListPropsStorage>();
        const pluginData = this.document.crdt.instantiator.createMap<Record<string, BasicCRDTType>>();
        model.set("id", id);
        model.set("type", block.type);
        model.set("listProps", listPropsStorage);
        model.set("props", props);
        model.set("content", content);
        model.set("children", children);
        model.set("pluginData", pluginData);
        this.storage.set(id, model);
        assignMap(listPropsStorage, { ...listProps }, true);
        assignMap(props, this.validateProps(block.type, block.props ?? {}));
        assignText(content, contentFrom(block.content));
        assignMap(pluginData, block.pluginData ?? {});
        block.children?.forEach((child) => this.insertInto(child, children));
        const index = afterId === undefined ? container.length : afterId === null ? 0 : strings(container).indexOf(afterId) + 1;
        if (index < 0) throw new Error(`Target block ${afterId} not found`);
        container.insert(index, id);
        return id;
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
     * Filters a selection to independently movable subtree roots.
     *
     * @param ids - Candidate selected block identifiers.
     * @returns Selected roots in visible order, excluding selected descendants.
     */
    private selectedTopLevelRoots(ids: string[]): string[] {
        const selected = new Set(ids.filter((id) => this.storage.has(id)));
        const hasSelectedAncestor = (id: string): boolean => {
            let parentId = this.findContainer(id)?.parentId;
            while (parentId) {
                if (selected.has(parentId)) return true;
                parentId = this.findContainer(parentId)?.parentId;
            }
            return false;
        };
        return this.visibleBlockIds().filter((id) => selected.has(id) && !hasSelectedAncestor(id));
    }

    /**
     * Checks whether selected subtrees cover one uninterrupted visible range.
     *
     * @param roots - Selected top-level subtree roots in visible order.
     * @returns True when their complete subtrees form one consecutive range.
     */
    private isConsecutiveSelection(roots: string[]): boolean {
        if (!roots.length) return false;
        const visible = this.visibleBlockIds();
        const covered = new Set(roots.flatMap((id) => this.collectTreeIds(id)));
        const first = visible.indexOf(roots[0]!);
        const lastTree = this.collectTreeIds(roots.at(-1)!);
        const last = visible.indexOf(lastTree.at(-1)!);
        return first >= 0 && last >= first && visible.slice(first, last + 1).every((id) => covered.has(id));
    }

    /**
     * Materializes every placed tree identifier, including collapsed descendants.
     *
     * @returns Stored tree identifiers in depth-first order.
     */
    private visibleBlockIds(): string[] {
        return strings(this.roots).flatMap((id) => this.collectTreeIds(id));
    }

    /**
     * Deletes a block and all descendants from the block map.
     *
     * @param id - Root ID of the subtree to delete.
     * @returns No value.
     */
    private removeTree(id: string): void {
        const value = this.storage.get(id);
        if (!isCRDTMap(value)) return;
        strings(this.requiredArray(value, "children")).forEach((child) => this.removeTree(child));
        this.storage.delete(id);
    }

    /**
     * Collects every block ID in a subtree.
     *
     * @param id - Root ID of the subtree.
     * @returns Root and descendant IDs in depth-first order.
     */
    private collectTreeIds(id: string): string[] {
        const value = this.storage.get(id);
        if (!isCRDTMap(value)) return [];
        return [id, ...strings(this.requiredArray(value, "children")).flatMap((child) => this.collectTreeIds(child))];
    }

    /**
     * Applies caller-owned prop keys without rebuilding the live CRDT map.
     *
     * @param type - Block type passed to the installed validator.
     * @param props - Shared property map to patch.
     * @param patch - Property keys owned by this operation.
     * @returns No value.
     */
    private patchProps(
        type: string,
        props: CRDTMap<Record<string, BasicCRDTType>>,
        patch: Record<string, unknown>,
    ): void {
        const validated = this.validateProps(type, { ...props.toObject(), ...patch } as Record<string, unknown>);
        for (const key of Object.keys(patch)) {
            const value = validated[key];
            if (value === undefined) props.delete(key);
            else props.set(key, clone(value) as BasicCRDTType);
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
