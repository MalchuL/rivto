import {
    BasicCRDTType,
    BasicType,
    CRDTArray,
    CRDTMap,
    CRDTDoc,
    CRDTText,
    CRDTUndoScope,
    Unsubscribe,
} from "../../crdt-doc";
import type {
    Block,
    BlockLayout,
    Link,
    PartialBlock,
    Snapshot,
} from "./types";
import type { BlockLayoutStorage, BlockStorage, DocumentStorage, LinkStorage } from "./types/storage";

// Persisted keys retain their original namespace so existing CRDT
// documents remain readable; this is wire format, not an editor dependency.
const ROOTS_KEY = "rivto.editor.roots";
const BLOCKS_KEY = "rivto.editor.blocks";
const LINKS_KEY = "rivto.editor.links";
const PLUGINS_KEY = "rivto.editor.plugins";
const DEFAULT_LAYOUT: BlockLayout = { x: 40, y: 40, width: 320, height: 120, zIndex: 0 };

type PropsValidator = (type: string, props: Record<string, unknown>) => Record<string, unknown>;

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const strings = (array: CRDTArray<string>): string[] => array.toArray().map(String);
const contentFrom = (content: PartialBlock["content"]): string => content ?? "";

/**
 * Canonical collaborative storage model used by applications such as the editor.
 *
 * The class owns the document-model boundary so consumers keep
 * the intended dependency direction: application → DocumentModel → CRDTDoc.
 * Native CRDT adapter types are never exposed here.
 *
 * The optional model id is descriptive; the CRDT document remains authoritative.
 */
export class DocumentModelImpl {
    readonly id: string;
    readonly crdt: CRDTDoc;
    readonly origin = Symbol("rivto-document");
    readonly undoScopes: CRDTUndoScope[];
    private readonly storage: DocumentStorage;
    private validateProps: PropsValidator = (_type, props) => props;

    /**
     * Creates a storage model over an adapter-neutral collaborative document.
     *
     * @param crdt - Collaborative document that owns the shared state.
     */
    constructor(crdt: CRDTDoc);
    /**
     * Creates a named storage model over a collaborative document.
     *
     * @param id - Descriptive model identifier; it does not control persistence.
     * @param crdt - Collaborative document that owns the shared state.
     */
    constructor(id: string, crdt: CRDTDoc);
    constructor(idOrCrdt: string | CRDTDoc, maybeCrdt?: CRDTDoc) {
        const crdt = typeof idOrCrdt === "string" ? maybeCrdt : idOrCrdt;
        if (!crdt) throw new Error("DocumentModelImpl requires a CRDTDoc");
        this.crdt = crdt;
        this.id = typeof idOrCrdt === "string" ? idOrCrdt : crdt.id;
        this.storage = {
            roots: crdt.getArray<string>(ROOTS_KEY),
            blocks: crdt.getMap<Record<string, CRDTMap<BlockStorage>>>(BLOCKS_KEY),
            links: crdt.getMap<Record<string, CRDTMap<LinkStorage>>>(LINKS_KEY),
            pluginData: crdt.getMap<Record<string, BasicCRDTType>>(PLUGINS_KEY),
        };
        this.undoScopes = [
            this.storage.blocks,
            this.storage.roots,
            this.storage.links,
            this.storage.pluginData,
        ];
        this.normalize();
    }

    /**
     * Installs block-property validation without coupling storage to plugins.
     *
     * @param validator - Function that validates and normalizes props by block type.
     */
    setPropsValidator(validator: PropsValidator): void {
        this.validateProps = validator;
    }

    /**
     * Returns the normalized ordered block tree as detached portable values.
     *
     * @returns Root blocks with recursively materialized children.
     */
    get document(): Block[] {
        return strings(this.storage.roots).flatMap((id) => {
            const block = this.readBlock(id, new Set());
            return block ? [block] : [];
        });
    }

    /**
     * Returns all first-class links as detached portable values.
     *
     * @returns Links currently stored in the collaborative document.
     */
    get links(): Link[] {
        return Array.from(this.storage.links.values()).flatMap((value) => {
            if (!this.isMap(value)) return [];
            return [{
                id: String(value.get("id")),
                from: clone(value.get("from") as Link["from"]),
                to: clone(value.get("to") as Link["to"]),
                meta: clone((value.get("meta") as Record<string, unknown> | undefined) ?? {}),
            }];
        });
    }

    /**
     * Reports whether the document has no root blocks.
     *
     * @returns `true` when the ordered root list is empty.
     */
    get isEmpty(): boolean {
        return this.storage.roots.length === 0;
    }

    /**
     * Subscribes to local and remote document changes through the CRDT abstraction.
     *
     * @param listener - Callback invoked after a collaborative update.
     * @returns Function that removes the subscription.
     */
    subscribe(listener: () => void): Unsubscribe {
        return this.crdt.on("update", listener);
    }

    /**
     * Groups a semantic mutation under this model's local undo origin.
     *
     * @param operation - Synchronous mutation to execute atomically.
     */
    transact(operation: () => void): void {
        this.crdt.transact(operation, this.origin);
    }

    /**
     * Inserts a block into an ordered root or sibling list.
     *
     * @param block - Initial portable block data.
     * @param afterId - Sibling to insert after, `null` for first, or omitted for last.
     * @returns Stable ID of the inserted block.
     * @throws If the ID already exists or the requested sibling is missing.
     */
    insertBlock(block: PartialBlock = {}, afterId?: string | null): string {
        let id = "";
        this.transact(() => {
            const container = afterId ? this.findContainer(afterId)?.array ?? this.storage.roots : this.storage.roots;
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
     */
    updateBlock(id: string, patch: PartialBlock): void {
        this.transact(() => {
            const block = this.requiredBlock(id);
            const type = String(patch.type ?? block.get("type"));
            if (patch.type) block.set("type", patch.type);
            if (patch.props) this.patchProps(type, this.requiredMap(block, "props"), patch.props);
            if (patch.pluginData) this.assignMap(this.requiredMap(block, "pluginData"), patch.pluginData, false);
            if (patch.content !== undefined) this.assignText(this.requiredText(block, "content"), patch.content);
            if (patch.layout) this.assignMap(this.requiredMap(block, "layout"), patch.layout, false);
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
     */
    setBlockProp(id: string, key: string, value: unknown): void {
        this.transact(() => {
            const block = this.requiredBlock(id);
            this.patchProps(String(block.get("type")), this.requiredMap(block, "props"), { [key]: value });
        });
    }

    /**
     * Updates one plugin namespace without touching data owned by other plugins.
     *
     * @param id - ID of the owning block.
     * @param pluginId - Stable plugin namespace.
     * @param value - Portable plugin data, or `undefined` to remove it.
     * @throws If the block does not exist.
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
     */
    removeBlock(id: string): void {
        this.transact(() => {
            const found = this.findContainer(id);
            if (!found) return;
            const removed = new Set(this.collectTreeIds(id));
            this.removeTree(id);
            found.array.delete(found.index, 1);
            for (const link of this.links) {
                if (removed.has(link.from.blockId) || removed.has(link.to.blockId)) this.storage.links.delete(link.id);
            }
        });
    }

    /**
     * Moves a block within its sibling list by editing the ordered CRDT array.
     *
     * @param id - ID of the block to move.
     * @param afterId - Sibling to move after, or `null` to move to the start.
     * @throws If the block or target sibling does not exist.
     */
    moveBlock(id: string, afterId: string | null): void {
        if (id === afterId) return;
        this.transact(() => {
            const source = this.findContainer(id);
            if (!source) throw new Error(`Block ${id} not found`);
            const target = afterId === null ? source.array : this.findContainer(afterId)?.array;
            if (!target) throw new Error(`Target block ${afterId} not found`);
            source.array.delete(source.index, 1);
            const index = afterId === null ? 0 : Math.max(0, strings(target).indexOf(afterId) + 1);
            target.insert(index, id);
        });
    }

    /**
     * Nests a block under its preceding sibling.
     *
     * @param id - ID of the block to indent.
     */
    indentBlock(id: string): void {
        this.transact(() => {
            const source = this.findContainer(id);
            if (!source || source.index === 0) return;
            const parent = this.requiredBlock(String(source.array.get(source.index - 1)));
            source.array.delete(source.index, 1);
            this.requiredArray(parent, "children").push(id);
        });
    }

    /**
     * Moves a nested block directly after its parent.
     *
     * @param id - ID of the block to outdent.
     */
    outdentBlock(id: string): void {
        this.transact(() => {
            const source = this.findContainer(id);
            if (!source?.parentId) return;
            const parentContainer = this.findContainer(source.parentId);
            if (!parentContainer) return;
            source.array.delete(source.index, 1);
            parentContainer.array.insert(parentContainer.index + 1, id);
        });
    }

    /**
     * Patches supplied geometry keys so independent concurrent edits can merge.
     *
     * @param id - ID of the block to reposition or resize.
     * @param layout - Geometry fields to update.
     * @throws If the block or its layout field does not exist.
     */
    setBlockLayout(id: string, layout: Partial<BlockLayout>): void {
        this.transact(() => this.assignMap(this.requiredMap(this.requiredBlock(id), "layout"), layout, false));
    }

    /**
     * Creates or replaces a first-class link between existing blocks.
     *
     * @param link - Portable link record to store.
     * @throws If either endpoint references a missing block.
     */
    createLink(link: Link): void {
        this.transact(() => {
            if (!this.storage.blocks.has(link.from.blockId) || !this.storage.blocks.has(link.to.blockId)) {
                throw new Error("Link endpoints must reference existing blocks");
            }
            const model = this.crdt.instantiator.createMap<LinkStorage>();
            model.set("id", link.id);
            model.set("from", clone(link.from));
            model.set("to", clone(link.to));
            model.set("meta", clone(link.meta ?? {}) as Record<string, BasicType>);
            this.storage.links.set(link.id, model);
        });
    }

    /**
     * Removes a link by ID.
     *
     * @param id - ID of the link to remove.
     */
    removeLink(id: string): void {
        this.transact(() => this.storage.links.delete(id));
    }

    /**
     * Produces a lossless portable schema-v3 snapshot.
     *
     * @returns Detached blocks, links, and document-level plugin data.
     */
    getSnapshot(): Snapshot {
        return {
            version: 3,
            blocks: clone(this.document),
            links: clone(this.links),
            pluginData: clone(this.storage.pluginData.toObject() as Record<string, unknown>),
        };
    }

    /**
     * Replaces collaborative state from a schema-v3 snapshot atomically.
     *
     * @param snapshot - Portable snapshot to hydrate.
     * @throws If the snapshot version or block collection is unsupported.
     */
    loadSnapshot(snapshot: Snapshot): void {
        if (snapshot.version !== 3 || !Array.isArray(snapshot.blocks)) throw new Error("Unsupported Rivto document snapshot");
        this.transact(() => {
            this.storage.roots.delete(0, this.storage.roots.length);
            this.storage.blocks.clear();
            this.storage.links.clear();
            this.storage.pluginData.clear();
            snapshot.blocks.forEach((block) => this.insertInto(block, this.storage.roots));
            snapshot.links?.forEach((link) => this.createLink(link));
            this.assignMap(this.storage.pluginData, snapshot.pluginData ?? {});
        });
    }

    /**
     * Repair duplicate, missing, and orphaned tree references deterministically.
     * Block payloads are retained even when a concurrent move leaves an orphan.
     *
     * Orphaned blocks are appended to the root list, while duplicate and missing
     * references are removed.
     */
    normalize(): void {
        this.transact(() => {
            const seen = new Set<string>();
            const clean = (array: CRDTArray<string>) => {
                for (let index = array.length - 1; index >= 0; index -= 1) {
                    const id = String(array.get(index));
                    if (!this.storage.blocks.has(id) || seen.has(id)) array.delete(index, 1);
                    else seen.add(id);
                }
            };
            clean(this.storage.roots);
            for (const value of Array.from(this.storage.blocks.values())) {
                if (this.isMap(value)) clean(this.requiredArray(value, "children"));
            }
            for (const id of Array.from(this.storage.blocks.keys())) if (!seen.has(id)) this.storage.roots.push(id);
        });
    }

    /**
     * Creates CRDT containers for a block and inserts its ID into an ordered list.
     *
     * @param block - Portable block data, including optional descendants.
     * @param container - Root or child array that receives the block ID.
     * @param afterId - Sibling to insert after, `null` for first, or omitted for last.
     * @returns Stable ID assigned to the block.
     * @throws If the ID already exists or the requested sibling is missing.
     */
    private insertInto(block: PartialBlock, container: CRDTArray<string>, afterId?: string | null): string {
        const id = block.id ?? crypto.randomUUID();
        if (this.storage.blocks.has(id)) throw new Error(`Block ${id} already exists`);
        const model = this.crdt.instantiator.createMap<BlockStorage>();
        const props = this.crdt.instantiator.createMap<Record<string, BasicCRDTType>>();
        const content = this.crdt.instantiator.createText();
        const children = this.crdt.instantiator.createArray<string>();
        const layout = this.crdt.instantiator.createMap<BlockLayoutStorage>();
        const pluginData = this.crdt.instantiator.createMap<Record<string, BasicCRDTType>>();
        const type = block.type ?? "paragraph";
        model.set("id", id);
        model.set("type", type);
        model.set("props", props);
        model.set("content", content);
        model.set("children", children);
        model.set("layout", layout);
        model.set("pluginData", pluginData);
        this.storage.blocks.set(id, model);
        this.assignMap(props, this.validateProps(type, block.props ?? {}));
        this.assignText(content, contentFrom(block.content));
        const flowIndex = container.length;
        this.assignMap(layout, {
            ...DEFAULT_LAYOUT,
            x: 60 + (flowIndex % 4) * 350,
            y: 60 + Math.floor(flowIndex / 4) * 180,
            ...block.layout,
        }, false);
        this.assignMap(pluginData, block.pluginData ?? {});
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
    private readBlock(id: string, visited: Set<string>): Block | undefined {
        if (visited.has(id)) return undefined;
        const value = this.storage.blocks.get(id);
        if (!this.isMap(value)) return undefined;
        visited.add(id);
        const props = this.requiredMap(value, "props").toObject() as Record<string, unknown>;
        const pluginData = this.requiredMap(value, "pluginData").toObject() as Record<string, unknown>;
        const content = this.requiredText(value, "content").toString();
        const children = strings(this.requiredArray(value, "children")).flatMap((childId) => {
            const child = this.readBlock(childId, visited);
            return child ? [child] : [];
        });
        const layout = this.requiredMap(value, "layout").toObject() as unknown as Partial<BlockLayout>;
        return {
            id,
            type: String(value.get("type") ?? "paragraph"),
            props,
            pluginData,
            content,
            children,
            layout: { ...DEFAULT_LAYOUT, ...layout },
        };
    }

    /**
     * Locates the ordered array and index containing a block ID.
     *
     * @param id - Block ID to locate.
     * @returns Container information, including parent ID for nested blocks.
     */
    private findContainer(id: string): { array: CRDTArray<string>; index: number; parentId?: string } | undefined {
        const rootIndex = strings(this.storage.roots).indexOf(id);
        if (rootIndex >= 0) return { array: this.storage.roots, index: rootIndex };
        for (const [parentId, value] of Array.from(this.storage.blocks.entries())) {
            if (!this.isMap(value)) continue;
            const children = this.requiredArray(value, "children");
            const index = strings(children).indexOf(id);
            if (index >= 0) return { array: children, index, parentId };
        }
        return undefined;
    }

    /**
     * Deletes a block and all descendants from the block map.
     *
     * @param id - Root ID of the subtree to delete.
     */
    private removeTree(id: string): void {
        const value = this.storage.blocks.get(id);
        if (!this.isMap(value)) return;
        strings(this.requiredArray(value, "children")).forEach((child) => this.removeTree(child));
        this.storage.blocks.delete(id);
    }

    /**
     * Collects every block ID in a subtree.
     *
     * @param id - Root ID of the subtree.
     * @returns Root and descendant IDs in depth-first order.
     */
    private collectTreeIds(id: string): string[] {
        const value = this.storage.blocks.get(id);
        if (!this.isMap(value)) return [];
        return [id, ...strings(this.requiredArray(value, "children")).flatMap((child) => this.collectTreeIds(child))];
    }

    /**
     * Applies caller-owned prop keys without rebuilding the live CRDT map.
     *
     * @param type - Block type passed to the installed validator.
     * @param props - Shared property map to patch.
     * @param patch - Property keys owned by this operation.
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
     * Copies portable object fields into a shared map.
     *
     * @param map - Shared map to update.
     * @param values - Portable key-value pairs to copy.
     * @param clear - Whether to remove existing entries before copying.
     */
    private assignMap<Schema extends object>(
        map: CRDTMap<Schema>,
        values: Record<string, unknown>,
        clear = true,
    ): void {
        if (clear) map.clear();
        const writable = map as unknown as CRDTMap<Record<string, BasicCRDTType>>;
        Object.entries(values).forEach(([key, value]) => {
            if (value !== undefined) writable.set(key, clone(value) as BasicCRDTType);
        });
    }

    /**
     * Replaces collaborative text with plain Markdown source.
     *
     * @param text - Shared text to rewrite.
     * @param content - Markdown source.
     */
    private assignText(text: CRDTText, content: string): void {
        if (text.length) text.delete(0, text.length);
        if (content) text.insert(0, content);
    }

    /**
     * Reads a block map or fails with a domain-specific message.
     *
     * @param id - Block ID to resolve.
     * @returns Stored block map.
     * @throws If the block does not exist.
     */
    private requiredBlock(id: string): CRDTMap<BlockStorage> {
        const value = this.storage.blocks.get(id);
        if (!this.isMap(value)) throw new Error(`Block ${id} not found`);
        return value;
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
        if (!this.isMap(value)) throw new Error(`Expected CRDTMap at ${key}`);
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
        if (!this.isArray(value)) throw new Error(`Expected CRDTArray at ${key}`);
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
        if (!this.isText(value)) throw new Error(`Expected CRDTText at ${key}`);
        return value as Extract<Schema[Key], CRDTText>;
    }

    /**
     * Narrows an adapter value to a CRDT map by its required capabilities.
     *
     * @param value - Value to inspect.
     * @returns Whether the value implements the map contract.
     */
    private isMap(value: unknown): value is CRDTMap<any> {
        return Boolean(value && typeof value === "object" && "set" in value && "entries" in value);
    }

    /**
     * Narrows an adapter value to a CRDT array by its required capabilities.
     *
     * @param value - Value to inspect.
     * @returns Whether the value implements the array contract.
     */
    private isArray(value: unknown): value is CRDTArray<any> {
        return Boolean(value && typeof value === "object" && "insert" in value && "toArray" in value);
    }

    /**
     * Narrows an adapter value to collaborative text by its required capabilities.
     *
     * @param value - Value to inspect.
     * @returns Whether the value implements the text contract.
     */
    private isText(value: unknown): value is CRDTText {
        return Boolean(value && typeof value === "object" && "format" in value && "toDelta" in value);
    }
}
