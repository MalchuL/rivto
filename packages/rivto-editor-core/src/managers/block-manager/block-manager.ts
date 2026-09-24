/**
 * Implements editor block features and invariant processors.
 * Owns outline indentation, outdent adoption, grouped moves, and merge
 * policy. Callers pass the block IDs to mutate; this manager does not read
 * editor selection. Mutations use document storage primitives inside the
 * document-model transaction boundary so each mutation retains stable IDs and
 * atomic storage updates. History batches remain only for compound editor
 * operations and tested undo breakpoints.
 */
import {
  validateBlockForest,
  type BlockInput,
  type BlockUpdate,
  type DocumentModel,
} from "@chulane/document-model";
import {
  createBlockPropsProcessor,
  type BlockProcessor,
} from "./block-pipe";
import type {
  EditorBlock,
  EditorBlockInput,
  EditorBlockNode,
  EditorBlockPatch,
  EditorBlockUpdate,
} from "../../editor/model";
import type { RivtoEditorApi } from "../../editor/types";
import type { BlockManagerApi, ImportedBlockForest } from "../types";
import type { BlockPrepareErrorHandler } from "./types";
import { Pipe } from "../../utils/pipe";

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
 * Owns typed editor block operations.
 *
 * Collaborative block state remains in DocumentModel.
 * Block definitions remain in the editor's separate `.blockRegistry`
 * manager. This manager validates command payloads and applies outline
 * grouping to the identifiers the caller supplied.
 */
export class BlockManager implements BlockManagerApi {
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
   * Creates the public block manager and installs its built-in processors.
   *
   * @param editor - Owning editor providing shared runtime capabilities.
   */
  constructor(
    private readonly editor: RivtoEditorApi,
  ) {
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
   * Reports whether the document contains one block record.
   *
   * @param id - Persisted block identifier to inspect.
   * @returns True when the block exists.
   */
  hasBlock(id: string): boolean {
    return this.document.blocks.hasBlock(id);
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
   * Resolves one placed block without recursively materializing descendants.
   *
   * @param id - Persisted block identifier to resolve.
   * @returns Detached non-recursive block fields, or undefined when absent.
   */
  getBlockNode(id: string): EditorBlockNode | undefined {
    return this.document.blocks.getBlockNode(id) satisfies EditorBlockNode | undefined;
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
   * Subscribes to one block's own fields and direct child IDs.
   * @param id - Block identifier to observe.
   * @param listener - Callback invoked after relevant changes.
   * @returns Function that removes the subscription.
   */
  subscribeBlockNode(id: string, listener: () => void): () => void {
    return this.subscribe(listener, (document) => document.blocks.subscribeBlockNode(id, listener));
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
   * Applies definitions, list-property policy, and registered processors to
   * every node, then validates the complete detached forest.
   *
   * @param input - Detached block forest to prepare atomically.
   * @param onError - Optional handler that supplies one replacement for a failed node.
   * @returns Recursively copied forest ready for insertion.
   */
  prepareInput(
    input: readonly (EditorBlock | EditorBlockInput)[],
    onError?: BlockPrepareErrorHandler,
  ): EditorBlockInput[] {
    // Validate before recursion so malformed children or a caller-provided cycle
    // fail deterministically instead of running factories/processors or overflowing
    // the preparation walk before the postcondition can be checked.
    validateBlockForest(input);
    // Use reference identity because creation nodes may not have IDs and cycles
    // belong to the in-memory object graph. Duplicate persisted IDs are a separate
    // forest invariant handled by validateBlockForest.
    const activeNodes = new Set<BlockInput>();
    /** Applies the complete creation policy recursively to one forest node. */
    const applyCreationPolicy = (
      block: EditorBlockInput,
      canRecover = true,
    ): EditorBlockInput => {
      if (activeNodes.has(block)) throw new Error("Block forest must be acyclic");
      activeNodes.add(block);
      let processed: BlockInput | undefined;
      try {
        try {
          if (!this.editor.blockRegistry.has(block.type)) {
            throw new Error(`Block type ${block.type} is unavailable in ${this.editor.mode.get()} mode`);
          }
          processed = this.runProcessors(this.editor.blockRegistry.prepare({
            ...block,
            listProps: this.editor.blockListProps.prepare(block.listProps),
          }));
          if (processed !== block) {
            if (activeNodes.has(processed)) throw new Error("Block forest must be acyclic");
            activeNodes.add(processed);
          }
        } catch (error) {
          if (!onError || !canRecover) throw error;
          const replacement = onError(block, error);
          // Preserve an assigned import identity and disable recovery so a bad
          // replacement cannot recurse through the callback indefinitely.
          return applyCreationPolicy({
            ...replacement,
            id: replacement.id ?? block.id,
            listProps: replacement.listProps ?? {},
            props: replacement.props ?? {},
            pluginData: replacement.pluginData ?? {},
            content: replacement.content ?? "",
            children: replacement.children ?? [],
          }, false);
        }
        return {
          ...processed,
          children: processed.children?.map((child) => applyCreationPolicy(child, canRecover)),
        };
      } finally {
        if (processed && processed !== block) activeNodes.delete(processed);
        activeNodes.delete(block);
      }
    };
    const prepared = input.map((block) => applyCreationPolicy(block));
    // Definitions and processors may change IDs, children, or portable values,
    // so their complete output needs the same forest invariants checked again.
    // The active-node guard above makes processor-created cycles fail before
    // recursion; this pass verifies all other complete-forest postconditions.
    validateBlockForest(prepared);
    return prepared;
  }

  /**
   * Reports whether one placed block currently has direct children.
   *
   * @param id - Parent block identifier to inspect.
   * @returns True when the block is placed and its child list is nonempty.
   */
  hasChildren(id: string): boolean {
    return this.document.blocks.hasChildren(id);
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
   * Reports whether a block is at the root level.
   *
   * @param id - Block identifier to check.
   * @returns True when the block exists and has no parent.
   */
  isRootBlock(id: string): boolean {
    return this.document.blocks.isRootBlock(id);
  }

  /**
   * Inserts a validated block through the typed manager path.
   * The batch separates creation from the next captured editor action.
   *
   * @param block - Native type and initial persisted values.
   * @param afterId - Sibling to follow, null to prepend, or undefined to append.
   * @returns Complete persisted block assembled during insertion.
   */
  insertBlock(block: EditorBlockInput, afterId?: string | null): EditorBlock {
    const prepared = this.prepareInput([block])[0]!;
    // Storage insertion is already transactional; this wrapper creates undo
    // capture breakpoints so the following action does not merge with creation.
    return this.editor.history.batchUpdates(() => this.document.blocks.insertBlock(prepared, afterId));
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
   * @param blocks - Complete copied roots or creation inputs to insert recursively.
   * @param afterId - Existing sibling after which roots are inserted.
   * @param onError - Optional handler that supplies one replacement for a failed node.
   * @returns Complete persisted roots and source mappings.
   */
  importForest(
    blocks: readonly (EditorBlock | EditorBlockInput)[],
    afterId?: string | null,
    onError?: BlockPrepareErrorHandler,
  ): ImportedBlockForest {
    const sourceIds: string[] = [];
    /** Collects stable source identities before destination remapping. */
    const collectIds = (block: EditorBlock | EditorBlockInput): void => {
      if (block.id !== undefined) sourceIds.push(block.id);
      block.children?.forEach(collectIds);
    };
    blocks.forEach(collectIds);
    // Map every descendant before insertion so clipboard extensions can use
    // the same destination IDs when rewriting stored references.
    const idMap = this.document.blocks.createImportIdMap(sourceIds);
    /** Rewrites one complete source subtree with its destination identities. */
    const remap = (block: EditorBlock | EditorBlockInput): EditorBlockInput => {
      const id = block.id === undefined ? undefined : idMap.get(block.id)!;
      return { ...block, id, children: block.children?.map(remap) };
    };
    const prepared = this.prepareInput(blocks.map(remap), onError);
    const roots: EditorBlock[] = [];
    this.editor.history.batchUpdates(() => {
      let previous = afterId;
      prepared.forEach((block) => {
        const inserted = this.document.blocks.insertBlock(block, previous);
        previous = inserted.id;
        roots.push(inserted);
      });
    });
    return { roots, idMap };
  }

  /**
   * Applies supplied mutable fields to one block.
   *
   * @param id - Block identifier to update.
   * @param patch - Mutable fields to validate and apply.
   * @returns Updated persisted fields without recursively materializing descendants.
   */
  updateBlock(id: string, patch: EditorBlockPatch): EditorBlockNode {
    const [update] = this.processUpdates([{ id, patch }]);
    return this.document.blocks.updateBlock(update!.id, update!.patch);
  }

  /**
   * Applies several identified block patches atomically.
   *
   * @param updates - Ordered block identifiers and patches.
   * @returns Updated persisted fields without descendants, in input order.
   */
  updateBlocks(updates: readonly EditorBlockUpdate[]): EditorBlockNode[] {
    const processed = this.processUpdates(updates);
    return this.editor.history.batchUpdates(() => this.document.blocks.updateBlocks(processed));
  }

  /** Deletes list-property keys from one block. */
  deleteListProps(id: string, keys: readonly string[]): boolean {
    const block = this.document.blocks.getBlockNode(id);
    if (!block) throw new Error(`Block ${id} not found`);
    this.validateListPropsDeletion(block.listProps, keys);
    return this.editor.history.batchUpdates(() => this.document.blocks.deleteListProps(id, keys));
  }

  /** Deletes list-property keys from several blocks atomically. */
  deleteListPropsBatch(updates: readonly { id: string; keys: readonly string[] }[]): void {
    const simulated = new Map<string, Record<string, unknown>>();
    updates.forEach(({ id, keys }) => {
      const block = this.document.blocks.getBlockNode(id);
      if (!block) throw new Error(`Block ${id} not found`);
      const next = this.validateListPropsDeletion(simulated.get(id) ?? block.listProps, keys);
      simulated.set(id, next);
    });
    this.editor.history.batchUpdates(() => this.document.blocks.deleteListPropsBatch(updates));
  }

  /**
   * Clears content and descendants while preserving one block's identity.
   *
   * @param id - Block identifier to retain and clear.
   * @returns No value.
   */
  clearBlock(id: string): void {
    this.editor.history.batchUpdates(() => {
      this.document.blocks.updateBlock(id, { content: "" });
      (this.document.blocks.getBlockNode(id)?.childIds ?? []).forEach((childId) => this.document.blocks.removeBlock(childId));
    });
  }

  /**
   * Converts one block to another registered native type.
   *
   * @param id - Block identifier to convert.
   * @param type - Registered destination type.
   * @returns No value.
   */
  setBlockType(id: string, type: string): void {
    const current = this.document.blocks.getBlockNode(id);
    if (!current) throw new Error(`Block ${id} not found`);
    const props = this.editor.blockRegistry.prepareTypeChange(type, current.props);
    const processed = this.runProcessors({ ...current, type, props, children: undefined });
    // Storage insertion is already transactional; this wrapper creates undo
    // capture breakpoints so the following action does not merge with creation.
    this.editor.history.batchUpdates(() => this.document.blocks.setBlockType(id, type, processed.props));
  }

  /**
   * Removes one block subtree.
   *
   * @param id - Block identifier to remove.
   * @returns No value.
   */
  removeBlock(id: string): void {
    this.editor.history.batchUpdates(() => this.document.blocks.removeBlock(id));
  }

  /**
   * Removes several block subtrees as one undo item.
   *
   * @param ids - Block identifiers to remove.
   * @returns No value.
   */
  removeBlocks(ids: string[]): void {
    this.editor.history.batchUpdates(() => {
      ids.forEach((id) => this.document.blocks.removeBlock(id));
    });
  }

  /**
   * Appends a source block's content and children into a surviving target.
   *
   * @param targetId - Block that remains after the merge.
   * @param sourceId - Block transferred and removed by the merge.
   * @returns Target content offset where source content begins.
   */
  mergeBlocks(targetId: string, sourceId: string): number {
    return this.editor.history.batchUpdates(() => this.mergeBlockContent(targetId, sourceId));
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
    this.editor.history.batchUpdates(() => this.document.blocks.moveBlock(id, targetId, position));
  }

  /**
   * Moves several sibling subtree roots as one undo item.
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
    // The document move is already atomic; this wrapper creates undo capture
    // breakpoints between consecutive structural moves.
    this.moveGroupedBlocks(ids, targetId, position);
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
    this.applyIndent(ids);
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
    this.applyOutdent(ids);
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
    const [update] = this.processUpdates([{ id, patch: { props: { [key]: value } } }]);
    this.document.blocks.setBlockProp(id, key, update!.patch.props?.[key]);
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
    this.document.blocks.setPluginData(id, pluginId, value);
  }

  /**
   * Releases the built-in block processors and subscriptions.
   *
   * @returns No value.
   */
  destroy(): void {
    this.subscriptions.forEach((subscription) => subscription.dispose());
    this.subscriptions.clear();
    this.processors.forEach((registration) => registration.dispose());
    this.processors.clear();
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
      this.editor.blockRegistry.validate(type, props)));
  }

  /**
   * Merges text and adopts children while retaining the target's other fields.
   * @param targetId - Surviving placed block.
   * @param sourceId - Placed block to consume.
   * @returns Original target text length for caret restoration.
   */
  private mergeBlockContent(targetId: string, sourceId: string): number {
    if (targetId === sourceId) throw new Error("Cannot merge a block into itself");
    const target = this.document.blocks.getBlockNode(targetId);
    const source = this.document.blocks.getBlockNode(sourceId);
    if (!source) throw new Error(`Block ${sourceId} not found`);
    if (!target) throw new Error(`Block ${targetId} not found`);
    if (this.collectTreeIds(sourceId).includes(targetId)) {
      throw new Error(`Cannot merge block ${sourceId} into its descendant ${targetId}`);
    }
    const blocks = this.document.blocks;
    blocks.moveBlocks(source.childIds.map((id) => ({ id, targetId, position: "inside" })));
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
    this.editor.history.batchUpdates(() => {
      this.document.blocks.moveBlocks(ordered.map((id) => ({ id, targetId, position })));
    });
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
    this.editor.history.batchUpdates(() => {
      this.document.blocks.moveBlocks(roots.map((id) => ({ id, targetId, position: "inside" })));
    });
  }

  /**
   * Outdents a consecutive range, keeping later outline items below it.
   *
   * Lifting a nested range after its parent would otherwise leave later siblings
   * at the old depth, which visually "breaks out" from under the outdented
   * outline. For P: [A, B, C], outdenting B makes [P, B] at the outer level,
   * with C appended to B's existing children. This preserves document order
   * and leaves C indented beneath B.
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
    // Adopt before lifting: afterwards lastId no longer shares P's child list,
    // so the old sibling tail cannot be found from its new location.
    this.editor.history.batchUpdates(() => {
      this.document.blocks.adoptFollowingSiblings(lastId);
      this.document.blocks.moveBlocks([
        // Repeated "after parent" inserts reverse order unless roots go last-first.
        ...[...moving].reverse().map((id) => ({ id, targetId: parentId, position: "after" as const })),
      ]);
    });
  }

  /**
   * Processes one stored or incoming block without its recursive children.
   * @param block - Complete node-level block input.
   * @returns Processed node-level input.
   */
  private runProcessors(block: BlockInput): BlockInput {
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
      const stored = this.document.blocks.getBlockNode(id);
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
      if (patch.listProps) this.editor.blockListProps.prepare(candidate.listProps ?? {});
      const processed = patch.props ? this.runProcessors(candidate) : candidate;
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
   * Validates list-property deletion against the complete resulting record.
   * @param current - Current or earlier simulated list properties.
   * @param keys - Property names to remove.
   * @returns Resulting detached record for later batch simulation.
   */
  private validateListPropsDeletion(
    current: Record<string, unknown>,
    keys: readonly string[],
  ): Record<string, unknown> {
    const next = { ...current };
    keys.forEach((key) => delete next[key]);
    this.editor.blockListProps.prepare(next);
    return next;
  }

  /**
   * Reads a block's ordered siblings without materializing their contents.
   * @param id - Placed block whose sibling list is needed.
   * @returns Sibling identifiers in document order.
   */
  private siblingIds(id: string): readonly string[] {
    const parentId = this.getParentId(id);
    return parentId == null ? this.getRootIds() : (this.getBlockNode(parentId)?.childIds ?? []);
  }

  /**
   * Filters identifiers to independently movable roots in document order.
   * @param ids - Candidate identifiers.
   * @returns Roots excluding descendants of other listed blocks.
   */
  private topLevelRoots(ids: string[]): string[] {
    // A single subtree is already an ordered root. Avoid walking every block
    // merely to rediscover its place in the document outline.
    if (ids.length === 1) return this.getBlockNode(ids[0]!) ? ids : [];
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
    if (roots.length === 1) return true;
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
    return [id, ...(this.getBlockNode(id)?.childIds ?? []).flatMap((child) => this.collectTreeIds(child, visited))];
  }

}
