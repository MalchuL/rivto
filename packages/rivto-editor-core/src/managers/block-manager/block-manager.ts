/**
 * Implements editor block features, invariant processors, and command registrations.
 * Owns outline indentation, outdent adoption, grouped moves, and merge
 * policy. Callers pass the block IDs to mutate; this manager does not read
 * editor selection. Mutations use document storage primitives inside the
 * editor batch boundary so each command retains stable IDs and one undo
 * operation.
 */
import type {
  CommandHandler,
  RegisteredCommand,
} from "../command-registry";
import type {
  BlockInput,
  BlockPatch,
  BlockUpdate,
  DocumentModel,
} from "@chulane/document-model";
import {
  createBlockPropsProcessor,
  type BlockProcessor,
} from "./block-pipe";
import type {
  EditorBlock,
  EditorBlockInput,
  EditorBlockPatch,
  EditorBlockUpdate,
} from "../../editor/model";
import { commandPayload, commandString } from "../utils";
import type { RivtoEditorApi } from "../../editor/types";
import { Pipe } from "../../utils/pipe";

/** Result of importing a detached block forest into one editor. */
export interface ImportedBlockForest {
  /** Inserted root IDs in source order. */
  readonly rootIds: string[];
  /** Source block ID to inserted destination block ID. */
  readonly idMap: ReadonlyMap<string, string>;
}

interface BlockSubscription {
  readonly bind: (document: DocumentModel) => () => void;
  readonly listener: () => void;
  dispose: () => void;
}

interface BlockProcessorRegistration {
  readonly processor: BlockProcessor;
  dispose: () => void;
}

/**
 * Owns editor block commands and typed block operations.
 *
 * Collaborative block state remains in DocumentModel.
 * Block definitions remain in the editor's separate `.blocksRegistry`
 * manager. This manager validates command payloads and applies outline
 * grouping to the identifiers the caller supplied.
 */
export class BlockManager {
  private readonly registrations: RegisteredCommand[] = [];
  /**
   * Editor-owned block processing pipeline.
   *
   * It remains stable when the active document changes, so extension
   * processors follow this editor without becoming shared document state.
   */
  private readonly pipe = new Pipe<BlockInput>();
  private readonly processors = new Set<BlockProcessorRegistration>();
  private readonly subscriptions = new Set<BlockSubscription>();
  /** Document currently attached to the owning editor. */
  private currentDocument?: DocumentModel;

  /**
   * Creates the public block manager and installs its built-in commands.
   *
   * @param editor - Owning editor providing shared runtime capabilities.
   */
  constructor(
    private readonly editor: RivtoEditorApi,
  ) {
    this.registerRequiredCommands();
    this.registerRequiredProcessors();
  }

  /** @returns Monotonic document block revision for derived read caches. */
  get revision(): number { return this.document.blocks.revision; }

  /** Registers an editor-owned block processor and returns its disposer. */
  registerProcessor(processor: BlockProcessor): () => void {
    const registration: BlockProcessorRegistration = {
      processor,
      dispose: this.pipe.register(processor),
    };
    this.processors.add(registration);
    return () => {
      if (!this.processors.delete(registration)) return;
      registration.dispose();
    };
  }

  /**
   * Resolves one placed block by its stable identifier.
   *
   * @param id - Persisted block identifier to resolve.
   * @returns Detached block subtree, or undefined when absent.
   */
  getBlock(id: string): EditorBlock | undefined {
    return this.document.blocks.getBlock(id) satisfies EditorBlock | undefined;
  }

  /**
   * Materializes the complete ordered root block tree.
   *
   * @returns Detached root blocks with recursively materialized children.
   */
  getBlocks(): EditorBlock[] {
    return this.document.blocks.getBlocks() satisfies EditorBlock[];
  }

  /**
   * Reads top-level block identifiers without materializing subtrees.
   *
   * @returns Root identifiers in collaborative order.
   */
  getRootIds(): string[] {
    return this.document.blocks.getRootIds();
  }

  /**
   * Subscribes to changes affecting one recursive block snapshot.
   *
   * @param id - Block identifier to observe.
   * @param listener - Callback invoked when the snapshot changes.
   * @returns Function that removes this exact listener.
   */
  subscribeBlock(id: string, listener: () => void): () => void {
    return this.subscribe(listener, (document) => document.blocks.subscribeBlock(id, listener));
  }

  /**
   * Subscribes to ordered root identifier changes.
   *
   * @param listener - Callback invoked after root insertion, removal, or reorder.
   * @returns Function that removes this exact listener.
   */
  subscribeRootIds(listener: () => void): () => void {
    return this.subscribe(listener, (document) => document.blocks.subscribeRootIds(listener));
  }

  /**
   * Subscribes to any root or child hierarchy change.
   *
   * @param listener - Callback invoked after structure changes.
   * @returns Function that removes this exact listener.
   */
  subscribeStructure(listener: () => void): () => void {
    return this.subscribe(listener, (document) => document.blocks.subscribeStructure(listener));
  }

  /**
   * Rebinds document subscriptions while retaining editor-owned processors.
   * @param document - New active document.
   * @returns No value.
   */
  setDocument(document: DocumentModel): void {
    this.subscriptions.forEach((subscription) => subscription.dispose());
    this.currentDocument = document;
    this.subscriptions.forEach((subscription) => {
      subscription.dispose = subscription.bind(document);
    });
  }

  /** @returns No value after publishing the active document to retained block subscribers. */
  refreshSubscriptions(): void {
    [...this.subscriptions].forEach(({ listener }) => listener());
  }

  /**
   * Applies this editor's processors to complete snapshot block trees.
   * @param blocks - Complete portable block trees.
   * @returns Processed complete block trees.
   */
  processSnapshotBlocks(blocks: readonly EditorBlock[]): EditorBlock[] {
    return blocks.map((block) => this.processForest(block) as EditorBlock);
  }

  /**
   * Reads one block's direct child identifiers.
   *
   * @param id - Parent block identifier.
   * @returns Child identifiers in collaborative order, or an empty list when absent.
   */
  getChildIds(id: string): string[] {
    return this.document.blocks.getChildIds(id);
  }

  /**
   * Resolves one block's current structural parent.
   *
   * @param id - Block identifier to locate.
   * @returns Parent identifier, null for a root, or undefined when absent.
   */
  getParentId(id: string): string | null | undefined {
    return this.document.blocks.getParentId(id);
  }

  /**
   * Inserts a validated block through the built-in command path.
   *
   * @param block - Native type and initial persisted values.
   * @param afterId - Sibling to follow, null to prepend, or undefined to append.
   * @returns Stable identifier assigned to the new block.
   */
  insertBlock(block: EditorBlockInput, afterId?: string | null): string {
    const command = { block, afterId } satisfies { block: BlockInput; afterId?: string | null };
    return this.editor.commands.execute("block.insert", command) as string;
  }

  /**
   * Imports a detached forest while preserving every source identity that is
   * free in the destination.
   *
   * Existing IDs indicate copy-and-paste and receive destination-generated
   * replacements. IDs removed by cut remain free and are restored. The result
   * exposes the complete mapping so clipboard extensions can update references
   * without inferring insertion results from selection state.
   *
   * @param blocks - Complete detached source roots to insert recursively.
   * @param afterId - Existing sibling after which roots are inserted.
   * @returns Inserted root IDs and every source-to-destination identity mapping.
   */
  importForest(blocks: readonly EditorBlock[], afterId?: string | null): ImportedBlockForest {
    const sourceIds: string[] = [];
    const collectIds = (block: EditorBlock): void => {
      sourceIds.push(block.id);
      block.children.forEach(collectIds);
    };
    blocks.forEach(collectIds);
    // Map every descendant before insertion so clipboard extensions can use
    // the same destination IDs when rewriting stored references.
    const idMap = this.document.blocks.createImportIdMap(sourceIds);
    const prepare = (block: EditorBlock): EditorBlockInput => {
      const id = idMap.get(block.id)!;
      return { ...block, id, children: block.children.map(prepare) };
    };
    const prepared = blocks.map(prepare);
    const rootIds: string[] = [];
    this.editor.history.batchUpdates(() => {
      let previous = afterId;
      prepared.forEach((block) => {
        previous = this.insertBlock(block, previous);
        rootIds.push(previous);
      });
    });
    return { rootIds, idMap };
  }

  /**
   * Applies supplied mutable fields to one block.
   *
   * @param id - Block identifier to update.
   * @param patch - Mutable fields to validate and apply.
   * @returns No value.
   */
  updateBlock(id: string, patch: EditorBlockPatch): void {
    const command = { id, patch } satisfies { id: string; patch: BlockPatch };
    this.editor.commands.execute("block.update", command);
  }

  /**
   * Applies several identified block patches as one command and undo item.
   *
   * @param updates - Ordered block identifiers and patches.
   * @returns No value.
   */
  updateBlocks(updates: readonly EditorBlockUpdate[]): void {
    const command = { updates } satisfies { updates: readonly BlockUpdate[] };
    this.editor.commands.execute("block.update-many", command);
  }

  /** Deletes list-property keys from one block. */
  deleteListProps(id: string, keys: readonly string[]): boolean {
    return this.document.blocks.deleteListProps(id, keys);
  }

  /** Deletes list-property keys from several blocks in one batch. */
  deleteListPropsBatch(updates: readonly { id: string; keys: readonly string[] }[]): void {
    this.editor.history.batchUpdates(() => this.document.blocks.deleteListPropsBatch(updates));
  }

  /**
   * Clears content and descendants while preserving one block's identity.
   *
   * @param id - Block identifier to retain and clear.
   * @returns No value.
   */
  clearBlock(id: string): void {
    this.editor.commands.execute("block.clear", { id });
  }

  /**
   * Converts one block to another registered native type.
   *
   * @param id - Block identifier to convert.
   * @param type - Registered destination type.
   * @returns No value.
   */
  setBlockType(id: string, type: string): void {
    this.editor.commands.execute("block.type.set", { id, type });
  }

  /**
   * Removes one block subtree.
   *
   * @param id - Block identifier to remove.
   * @returns No value.
   */
  removeBlock(id: string): void {
    this.editor.commands.execute("block.remove", { id });
  }

  /**
   * Removes several block subtrees as one command and undo item.
   *
   * @param ids - Block identifiers to remove.
   * @returns No value.
   */
  removeBlocks(ids: string[]): void {
    this.editor.commands.execute("block.remove-many", { ids });
  }

  /**
   * Appends a source block's content and children into a surviving target.
   *
   * @param targetId - Block that remains after the merge.
   * @param sourceId - Block transferred and removed by the merge.
   * @returns Target content offset where source content begins.
   */
  mergeBlocks(targetId: string, sourceId: string): number {
    return this.editor.commands.execute("block.merge", { targetId, sourceId }) as number;
  }

  /**
   * Moves one block relative to a destination.
   *
   * @param id - Block identifier to move.
   * @param targetId - Destination, or null for the sibling-list start.
   * @param position - Placement before, after, or inside the destination.
   * @returns No value.
   */
  moveBlock(
    id: string,
    targetId: string | null,
    position: "before" | "after" | "inside" = "after",
  ): void {
    this.editor.commands.execute("block.move", { id, targetId, position });
  }

  /**
   * Moves several sibling subtree roots as one command and undo item.
   *
   * Descendant IDs of other supplied roots are dropped and remaining roots must
   * share a parent. Document storage `moveBlocks` is the lower-level placement
   * batch and does not apply those grouping rules.
   *
   * @param ids - Ordered block identifiers to move together.
   * @param targetId - Destination, or null for the sibling-list start.
   * @param position - Placement before, after, or inside the destination.
   * @returns No value.
   */
  moveBlocks(
    ids: string[],
    targetId: string | null,
    position: "before" | "after" | "inside" = "after",
  ): void {
    this.editor.commands.execute("block.move-many", { ids, targetId, position });
  }

  /**
   * Nests one block under its previous sibling.
   *
   * @param id - Block identifier to indent.
   * @returns No value.
   */
  indentBlock(id: string): void {
    this.indentBlocks([id]);
  }

  /**
   * Nests a consecutive outline range under its first root's previous sibling.
   *
   * @param ids - Block identifiers to indent together, including any nested
   *   descendants the caller also listed.
   * @returns No value.
   */
  indentBlocks(ids: string[]): void {
    this.editor.commands.execute("block.indent", { ids });
  }

  /**
   * Moves one block out of its parent and adopts following siblings.
   *
   * @param id - Block identifier to outdent.
   * @returns No value.
   */
  outdentBlock(id: string): void {
    this.outdentBlocks([id]);
  }

  /**
   * Outdents a consecutive outline range and adopts trailing siblings into its
   * last moved root.
   *
   * @param ids - Block identifiers to outdent together, including any nested
   *   descendants the caller also listed.
   * @returns No value.
   */
  outdentBlocks(ids: string[]): void {
    this.editor.commands.execute("block.outdent", { ids });
  }

  /**
   * Sets or removes one validated native block property.
   *
   * @param id - Owning block identifier.
   * @param key - Native property key.
   * @param value - Portable value, or undefined to remove the property.
   * @returns No value.
   */
  setBlockProp(id: string, key: string, value: unknown): void {
    this.editor.commands.execute("block.prop.set", { id, key, value });
  }

  /**
   * Sets or removes one block plugin-data namespace.
   *
   * @param id - Owning block identifier.
   * @param pluginId - Stable plugin namespace.
   * @param value - Portable value, or undefined to remove the namespace.
   * @returns No value.
   */
  setBlockPluginData(id: string, pluginId: string, value: unknown): void {
    this.editor.commands.execute("block.pluginData.set", { id, pluginId, value });
  }

  /**
   * Releases the built-in block processors and command registrations.
   *
   * @returns No value.
   */
  destroy(): void {
    this.subscriptions.forEach((subscription) => subscription.dispose());
    this.subscriptions.clear();
    this.processors.forEach((registration) => registration.dispose());
    this.processors.clear();
    this.registrations.splice(0).reverse().forEach((registration) => registration.dispose());
  }

  /**
   * Retains one subscription across document replacements.
   * @param listener - Callback refreshed after a replacement or matching mutation.
   * @param bind - Document-specific subscription factory.
   * @returns Function that permanently removes the retained subscription.
   */
  private subscribe(listener: () => void, bind: BlockSubscription["bind"]): () => void {
    const subscription: BlockSubscription = {
      listener,
      bind,
      dispose: this.currentDocument ? bind(this.currentDocument) : () => undefined,
    };
    this.subscriptions.add(subscription);
    return () => {
      if (!this.subscriptions.delete(subscription)) return;
      subscription.dispose();
    };
  }

  /** @returns The active document or throws while the editor is unbound. */
  private get document(): DocumentModel {
    if (!this.currentDocument) throw new Error("Document is not set");
    return this.currentDocument;
  }

  /**
   * Installs the invariant processors required by every editor block mutation.
   *
   * @returns No value.
   */
  private registerRequiredProcessors(): void {
    this.registerProcessor(createBlockPropsProcessor((type, props) =>
      this.editor.blocksRegistry.validate(type, props)));
  }

  /**
   * Registers every block command required by the public manager API.
   *
   * Document mutations execute through the editor's batching boundary so each
   * command has one CRDT transaction and undo item unless an outer batch exists.
   *
   * @returns No value.
   */
  private registerRequiredCommands(): void {
    const documentCommand = (handler: CommandHandler): CommandHandler => (value) =>
      this.editor.history.batchUpdates(() => handler(value));
    const register = (name: string, handler: CommandHandler): void => {
      this.registrations.push(this.editor.commands.register(name, handler));
    };

    register("block.insert", documentCommand((value) => {
      const data = commandPayload(value) as unknown as { block: BlockInput; afterId?: string | null };
      const block = commandPayload(data.block) as unknown as BlockInput;
      if (typeof block.type !== "string") throw new Error("block.type must be a string");
      const definition = this.editor.blocksRegistry.get(block.type);
      if (!definition) throw new Error(`Block type ${block.type} is unavailable in ${this.editor.mode.get()} mode`);
      const afterId = data.afterId === undefined
        ? undefined
        : data.afterId === null ? null : commandString(data.afterId, "afterId");
      return this.document.blocks.insertBlock(
        this.processForest(this.editor.blocksRegistry.prepare(block)),
        afterId,
      );
    }));
    register("block.update", (value) => {
      const data = commandPayload(value) as unknown as { id: string; patch: BlockPatch };
      const [update] = this.processUpdates([{
        id: commandString(data.id, "id"),
        patch: commandPayload(data.patch) as BlockPatch,
      }]);
      this.document.blocks.updateBlock(update!.id, update!.patch);
    });
    register("block.update-many", documentCommand((value) => {
      const data = commandPayload(value) as unknown as { updates: readonly BlockUpdate[] };
      if (!Array.isArray(data.updates)) throw new Error("updates must be an array");
      const updates = data.updates.map((item) => {
        const update = commandPayload(item);
        return {
          id: commandString(update.id, "id"),
          patch: commandPayload(update.patch) as BlockPatch,
        };
      });
      this.document.blocks.updateBlocks(this.processUpdates(updates));
    }));
    register("block.clear", documentCommand((value) => {
      const data = commandPayload(value) as unknown as { id: string };
      const id = commandString(data.id, "id");
      this.editor.history.batchUpdates(() => {
        this.document.blocks.updateBlock(id, { content: "" });
        this.document.blocks.getChildIds(id).forEach((childId) => this.document.blocks.removeBlock(childId));
      });
    }));
    register("block.type.set", documentCommand((value) => {
      const data = commandPayload(value) as unknown as { id: string; type: string };
      const id = commandString(data.id, "id");
      const type = commandString(data.type, "type");
      const current = this.getBlock(id);
      if (!current) throw new Error(`Block ${id} not found`);
      const props = this.editor.blocksRegistry.prepareTypeChange(type, current.props);
      const processed = this.processBlock({ ...current, type, props, children: undefined });
      this.document.blocks.setBlockType(id, type, processed.props);
    }));
    register("block.remove", documentCommand((value) => {
      const data = commandPayload(value) as unknown as { id: string };
      this.document.blocks.removeBlock(commandString(data.id, "id"));
    }));
    register("block.remove-many", documentCommand((value) => {
      const data = commandPayload(value) as unknown as { ids: string[] };
      const ids = this.requireIds(data.ids);
      this.editor.history.batchUpdates(() => {
        ids.forEach((id) => this.document.blocks.removeBlock(id));
      });
    }));
    register("block.merge", documentCommand((value) => {
      const data = commandPayload(value) as unknown as { targetId: string; sourceId: string };
      return this.mergeBlockContent(
        commandString(data.targetId, "targetId"),
        commandString(data.sourceId, "sourceId"),
      );
    }));
    register("block.move", documentCommand((value) => {
      const data = commandPayload(value) as unknown as {
        id: string;
        targetId?: string | null;
        afterId?: string | null;
        position?: "before" | "after" | "inside";
      };
      const rawTarget = "targetId" in data ? data.targetId : data.afterId;
      const id = commandString(data.id, "id");
      const targetId = rawTarget === null ? null : commandString(rawTarget, "targetId");
      const position = data.position === "before" || data.position === "inside" ? data.position : "after";
      this.document.blocks.moveBlock(id, targetId, position);
    }));
    register("block.move-many", documentCommand((value) => {
      const data = commandPayload(value) as unknown as {
        ids: string[];
        targetId: string | null;
        position?: "before" | "after" | "inside";
      };
      const targetId = data.targetId === null ? null : commandString(data.targetId, "targetId");
      const position = data.position === "before" || data.position === "inside" ? data.position : "after";
      this.moveGroupedBlocks(this.requireIds(data.ids), targetId, position);
    }));
    register("block.indent", documentCommand((value) => {
      const data = commandPayload(value) as unknown as { ids: string[] };
      this.applyIndent(this.requireIds(data.ids));
    }));
    register("block.outdent", documentCommand((value) => {
      const data = commandPayload(value) as unknown as { ids: string[] };
      this.applyOutdent(this.requireIds(data.ids));
    }));
    register("block.prop.set", documentCommand((value) => {
      const data = commandPayload(value) as unknown as { id: string; key: string; value: unknown };
      const id = commandString(data.id, "id");
      const key = commandString(data.key, "key");
      const [update] = this.processUpdates([{ id, patch: { props: { [key]: data.value } } }]);
      this.document.blocks.setBlockProp(id, key, update!.patch.props?.[key]);
    }));
    register("block.pluginData.set", documentCommand((value) => {
      const data = commandPayload(value) as unknown as { id: string; pluginId: string; value: unknown };
      this.document.blocks.setPluginData(
        commandString(data.id, "id"),
        commandString(data.pluginId, "pluginId"),
        data.value,
      );
    }));
  }

  /**
   * Merges text and adopts children while retaining the target's other fields.
   * @param targetId - Surviving placed block.
   * @param sourceId - Placed block to consume.
   * @returns Original target text length for caret restoration.
   */
  private mergeBlockContent(targetId: string, sourceId: string): number {
    if (targetId === sourceId) throw new Error("Cannot merge a block into itself");
    const target = this.getBlock(targetId);
    const source = this.getBlock(sourceId);
    if (!source) throw new Error(`Block ${sourceId} not found`);
    if (!target) throw new Error(`Block ${targetId} not found`);
    if (this.collectTreeIds(sourceId).includes(targetId)) {
      throw new Error(`Cannot merge block ${sourceId} into its descendant ${targetId}`);
    }
    const blocks = this.document.blocks;
    blocks.moveBlocks(source.children.map(({ id }) => ({ id, targetId, position: "inside" })));
    if (source.content) blocks.insertText(targetId, target.content.length, source.content);
    blocks.removeBlock(sourceId);
    return target.content.length;
  }

  /**
   * Moves grouped sibling roots in visible order, carrying descendants once.
   * @param ids - Candidate block identifiers in arbitrary order.
   * @param targetId - Destination anchor, or null for sibling-list start.
   * @param position - Placement relative to the anchor.
   * @returns No value.
   */
  private moveGroupedBlocks(ids: string[], targetId: string | null, position: "before" | "after" | "inside"): void {
    const roots = this.topLevelRoots(ids);
    if (!roots.length) return;
    const parentId = this.getParentId(roots[0]!);
    if (roots.some((id) => this.getParentId(id) !== parentId)) {
      throw new Error("Moved blocks must share the same parent");
    }
    if (targetId !== null && roots.some((id) => this.collectTreeIds(id).includes(targetId))) {
      throw new Error(`Cannot move blocks relative to their descendant ${targetId}`);
    }
    // Inserting repeatedly after the same anchor reverses order unless the
    // grouped roots are processed backwards. Prepending has the same rule.
    const ordered = targetId === null || position === "after" ? [...roots].reverse() : roots;
    this.document.blocks.moveBlocks(ordered.map((id) => ({ id, targetId, position })));
  }

  /**
   * Nests a consecutive outline range under its first root's previous sibling.
   * @param ids - Identifiers to indent, including any listed descendants.
   * @returns No value; an ineligible range is unchanged.
   */
  private applyIndent(ids: string[]): void {
    const roots = this.topLevelRoots(ids);
    if (!this.isConsecutiveRange(roots)) return;
    const siblings = this.siblingIds(roots[0]!);
    const index = siblings.indexOf(roots[0]!);
    if (index <= 0) return;
    const targetId = siblings[index - 1]!;
    this.document.blocks.moveBlocks(roots.map((id) => ({ id, targetId, position: "inside" })));
  }

  /**
   * Outdents a consecutive range and adopts trailing siblings into its last root.
   *
   * Lifting a nested range after its parent would otherwise leave later siblings
   * at the old depth, which visually "breaks out" from under the outdented
   * outline. Those following siblings are therefore reparented as children of
   * the last moved root. `inside` appends, so they follow any children that root
   * already had.
   *
   * @param ids - Identifiers to outdent, including any listed descendants.
   * @returns No value; a root-level or nonconsecutive range is unchanged.
   */
  private applyOutdent(ids: string[]): void {
    const roots = this.topLevelRoots(ids);
    if (!this.isConsecutiveRange(roots)) return;
    const parentId = this.getParentId(roots[0]!);
    if (!parentId) return;
    const destinationParent = this.getParentId(parentId);
    // A range may continue at the destination depth; those blocks stay put.
    const firstDestinationLevel = roots.findIndex((id) => this.getParentId(id) === destinationParent);
    const moving = firstDestinationLevel < 0 ? roots : roots.slice(0, firstDestinationLevel);
    if (!moving.length) return;
    const lastId = moving.at(-1)!;
    // Siblings below the last moved root stay nested under it after the lift.
    const siblings = this.siblingIds(lastId);
    const following = siblings.slice(siblings.indexOf(lastId) + 1);
    this.document.blocks.moveBlocks([
      // Repeated "after parent" inserts reverse order unless roots go last-first.
      ...[...moving].reverse().map((id) => ({ id, targetId: parentId, position: "after" as const })),
      ...following.map((id) => ({ id, targetId: lastId, position: "inside" as const })),
    ]);
  }

  /**
   * Processes every record in an inserted forest.
   * @param block - Root block input.
   * @returns Processed forest retaining nested structure.
   */
  private processForest(block: BlockInput): BlockInput {
    const processed = this.pipe.process(block);
    return {
      ...processed,
      children: processed.children?.map((child) => this.processForest(child)),
    };
  }

  /**
   * Processes one stored or incoming block without its recursive children.
   * @param block - Complete node-level block input.
   * @returns Processed node-level input.
   */
  private processBlock(block: BlockInput): BlockInput {
    return this.pipe.process(block);
  }

  /**
   * Applies editor processors to ordered block patches before document mutation.
   * Duplicate IDs observe earlier processed patches from the same batch.
   *
   * @param updates - Ordered portable block patches.
   * @returns Patches containing processor-normalized property values.
   */
  private processUpdates(updates: readonly BlockUpdate[]): BlockUpdate[] {
    const simulated = new Map<string, BlockInput>();
    return updates.map(({ id, patch }) => {
      const stored = this.getBlock(id);
      if (!stored) throw new Error(`Block ${id} not found`);
      const current = simulated.get(id) ?? stored;
      const candidate: BlockInput = {
        ...current,
        children: undefined,
        listProps: patch.listProps ? { ...current.listProps, ...patch.listProps } : current.listProps,
        props: patch.props ? { ...current.props, ...patch.props } : current.props,
        pluginData: patch.pluginData ? { ...current.pluginData, ...patch.pluginData } : current.pluginData,
        content: patch.content ?? current.content,
      };
      const processed = patch.props ? this.processBlock(candidate) : candidate;
      simulated.set(id, processed);
      const processedProps = patch.props
        ? Object.fromEntries(Object.keys(patch.props).map((key) => [key, processed.props?.[key]]))
        : undefined;
      return {
        id,
        patch: processedProps ? { ...patch, props: processedProps } : patch,
      };
    });
  }

  /**
   * Reads a block's ordered siblings without materializing their contents.
   * @param id - Placed block whose sibling list is needed.
   * @returns Sibling identifiers in document order.
   */
  private siblingIds(id: string): string[] {
    const parentId = this.getParentId(id);
    return parentId == null ? this.getRootIds() : this.getChildIds(parentId);
  }

  /**
   * Filters identifiers to independently movable roots in document order.
   * @param ids - Candidate identifiers.
   * @returns Roots excluding descendants of other listed blocks.
   */
  private topLevelRoots(ids: string[]): string[] {
    const listed = new Set(ids);
    return this.getRootIds().flatMap((id) => this.collectTreeIds(id)).filter((id) => {
      if (!listed.has(id)) return false;
      let parentId = this.getParentId(id);
      while (parentId) {
        if (listed.has(parentId)) return false;
        parentId = this.getParentId(parentId);
      }
      return true;
    });
  }

  /**
   * Checks whether complete listed subtrees cover an uninterrupted outline range.
   * @param roots - Subtree roots in document order.
   * @returns Whether every block between the first and last subtree is covered.
   */
  private isConsecutiveRange(roots: string[]): boolean {
    if (!roots.length) return false;
    const visible = this.getRootIds().flatMap((id) => this.collectTreeIds(id));
    const covered = new Set(roots.flatMap((id) => this.collectTreeIds(id)));
    const first = visible.indexOf(roots[0]!);
    const last = visible.indexOf(this.collectTreeIds(roots.at(-1)!).at(-1)!);
    return first >= 0 && last >= first && visible.slice(first, last + 1).every((id) => covered.has(id));
  }

  /**
   * Collects a subtree's identifiers, including collapsed descendants.
   * @param id - Root identifier to walk.
   * @param visited - Identifiers already traversed to stop malformed cycles.
   * @returns Root and descendants in depth-first document order.
   */
  private collectTreeIds(id: string, visited = new Set<string>()): string[] {
    if (visited.has(id)) return [];
    visited.add(id);
    return [id, ...this.getChildIds(id).flatMap((child) => this.collectTreeIds(child, visited))];
  }

  /**
   * Validates a command field as a list of block identifiers.
   *
   * @param value - Unknown `ids` field from a command payload.
   * @returns The validated identifier list.
   */
  private requireIds(value: unknown): string[] {
    if (!Array.isArray(value) || value.some((id) => typeof id !== "string")) {
      throw new Error("ids must be an array of strings");
    }
    return value;
  }
}
