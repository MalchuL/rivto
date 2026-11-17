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
  type BlockListProps,
  type BlockDestination,
  type BlockUpdate,
  type DocumentModel,
} from "@chulane/document-model";
import { createBlockPropsProcessor, type BlockProcessor } from "./block-pipe";
import type {
  EditorBlock,
  EditorBlockInput,
  EditorBlockNode,
  EditorBlockPatch,
  EditorBlockUpdate,
} from "../../editor/model";
import type { BlockMoveRequest } from "../../block-behaviors/types";
import type { DocumentCommandsEditor } from "../../editor/types";
import type { BlockManagerApi, BlockPreparationRegistry, ImportedBlockForest } from "../types";
import type { BlockImportOptions, BlockPrepareErrorHandler } from "./types";
import { Pipe } from "../../utils/pipe";
import type { BlockRegistryManager } from "../block-registry-manager/block-registry-manager";
import { BlockStructuralBehaviorStrategy } from "./structural-behavior/block-structural-behavior-strategy";

interface BlockProcessorRegistration {
  readonly processor: BlockProcessor;
  dispose: () => void;
}

/** Editor capabilities required by block operations and their validation pipeline. */
export interface BlockManagerEditor extends DocumentCommandsEditor {
  /** Definitions and validation required by creation and conversion. */
  readonly blockRegistry: BlockPreparationRegistry;
  /** Semantic validation of list-property updates. */
  readonly blockListProps: {
    /**
     * Applies the registered list defaults and validates the candidate record.
     *
     * @param candidate - Supplied list properties, omitted for defaults alone.
     * @returns Detached properties accepted by every registered policy.
     * @throws If any registered policy rejects the properties.
     */
    prepare(candidate?: BlockListProps): BlockListProps;
  };
}

/**
 * Owns typed editor block operations.
 *
 * Collaborative block state remains in DocumentModel.
 * Block definitions remain in the editor's separate `.blockRegistry`
 * manager. This manager validates command payloads and applies outline
 * grouping to the identifiers the caller supplied.
 */
export class BlockManager<
  Editor extends BlockManagerEditor = BlockManagerEditor,
> implements BlockManagerApi {
  /** The document manager has no protected boundary root. */
  readonly includeRoot: boolean = false;
  /**
   * Editor-owned block processing pipeline.
   *
   * It remains stable across operations on its permanently bound document, so
   * processors stay local to this editor without becoming shared document state.
   */
  private readonly pipe: Pipe<BlockInput>;
  private readonly processors: Set<BlockProcessorRegistration>;
  private readonly registry: Pick<BlockRegistryManager, "getBehaviorRegistrations">;
  /** Unbounded commands are required for transitions across panel boundaries. */
  private readonly documentBlocks: BlockManager;
  private readonly ownsProcessors: boolean;
  private readonly behaviorStrategy: BlockStructuralBehaviorStrategy;
  private readonly subscriptions = new Set<() => void>();

  /**
   * Creates block operations and binds them to an editor's processing pipeline.
   *
   * A registry creates the owning manager and installs its built-in processors.
   * A manager borrows its live pipeline and registrations without owning them.
   *
   * @param editor - Editor providing document and history capabilities.
   * @param registry - Behavior registry for an owner or manager to borrow from.
   */
  constructor(
    protected readonly editor: Editor,
    registry: Pick<BlockRegistryManager, "getBehaviorRegistrations"> | BlockManager,
  ) {
    const owner = registry instanceof BlockManager ? registry : undefined;
    this.registry = registry instanceof BlockManager ? registry.registry : registry;
    this.pipe = owner ? owner.pipe : new Pipe<BlockInput>();
    this.processors = owner ? owner.processors : new Set<BlockProcessorRegistration>();
    this.ownsProcessors = !owner;
    this.documentBlocks = owner ? owner.documentBlocks : this;
    this.behaviorStrategy = new BlockStructuralBehaviorStrategy(
      this,
      this.registry,
      this.documentBlocks,
    );
    if (!owner) {
      // Panels share these processors with their document manager. Install them once.
      this.registerProcessor(
        createBlockPropsProcessor((type, props) => this.editor.blockRegistry.validate(type, props)),
      );
    }
  }

  /** @returns Monotonic document block revision for derived read caches. */
  get revision(): number {
    return this.document.blocks.revision;
  }

  /** Registers an editor-owned block processor and returns its disposer. */
  registerProcessor(processor: BlockProcessor): () => void {
    const registration: BlockProcessorRegistration = {
      processor,
      dispose: this.pipe.register(processor),
    };
    this.processors.add(registration);
    return () => {
      if (!this.processors.delete(registration)) {
        return;
      }
      registration.dispose();
    };
  }

  /**
   * Evaluates editor-owned movement policies against sources and destination.
   *
   * Foreign source records are inspected directly, without resolving their IDs locally.
   *
   * @param request - Nonempty detached source roots and the destination location.
   * @returns False for a missing destination, invalid neighbor, or a behavior veto.
   */
  canMove(request: BlockMoveRequest): boolean {
    return this.behaviorStrategy.canMove(request);
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
  getRootIds(): readonly string[] {
    return this.document.blocks.getRootIds();
  }

  /**
   * Orders unique placed IDs without materializing unrelated subtrees.
   *
   * Each block's path contains its root position followed by child positions.
   * Comparing these paths puts siblings in order and parents before descendants.
   * Only selected blocks, their ancestors, and sibling ID lists are read.
   * Paths are cached within this call, so moves and undo need no invalidation.
   *
   * @param ids - Block identifiers; missing or detached records are omitted.
   * @returns IDs in depth-first document order, with ancestors before children.
   */
  getOrderedIds(ids: Iterable<string>): string[] {
    // A stored record may be detached from the tree, so check placement too.
    const placed = [...new Set(ids)].filter((id) => this.getBlockNode(id) !== undefined);
    if (placed.length < 2) {
      return placed;
    }
    const paths = new Map<string, number[]>();
    const siblings = new Map<string | null, Map<string, number>>();
    const pathOf = (id: string): number[] => {
      const cached = paths.get(id);
      if (cached) {
        return cached;
      }
      const parent = this.getParentId(id) ?? null;
      let positions = siblings.get(parent);
      if (!positions) {
        // Index each sibling list once, even when several selected blocks share it.
        const children = parent === null ? this.getRootIds() : this.getBlockNode(parent)!.childIds;
        positions = new Map(children.map((child, index) => [child, index]));
        siblings.set(parent, positions);
      }
      // For example, [2, 0] is the first child of the third root.
      const path = [...(parent === null ? [] : pathOf(parent)), positions.get(id)!];
      paths.set(id, path);
      return path;
    };
    return placed.sort((left, right) => {
      const a = pathOf(left);
      const b = pathOf(right);
      // The first differing position determines which branch comes first.
      for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
        if (a[index] !== b[index]) {
          return a[index]! - b[index]!;
        }
      }
      // A shared prefix puts the shorter path (the ancestor) first.
      return a.length - b.length;
    });
  }

  /**
   * Subscribes to changes affecting one recursive block snapshot.
   *
   * @param id - Block identifier to observe.
   * @param listener - Callback invoked when the snapshot changes.
   * Registrations stay bound to their source model when another view receives focus.
   * @returns Function that removes this exact listener.
   */
  subscribeBlock(id: string, listener: () => void): () => void {
    return this.retainSubscription(this.document.blocks.subscribeBlock(id, listener));
  }

  /**
   * Subscribes to one block's own fields and direct child IDs.
   * @param id - Block identifier to observe.
   * @param listener - Callback invoked after relevant changes.
   * @returns Function that removes the subscription.
   */
  subscribeBlockNode(id: string, listener: () => void): () => void {
    return this.retainSubscription(this.document.blocks.subscribeBlockNode(id, listener));
  }

  /**
   * Subscribes to ordered root identifier changes.
   *
   * @param listener - Callback invoked after root insertion, removal, or reorder.
   * Registrations stay bound to their source model when another view receives focus.
   * @returns Function that removes this exact listener.
   */
  subscribeRootIds(listener: () => void): () => void {
    return this.retainSubscription(this.document.blocks.subscribeRootIds(listener));
  }

  /**
   * Subscribes to any root or child hierarchy change.
   *
   * @param listener - Callback invoked after structure changes.
   * Registrations stay bound to their source model when another view receives focus.
   * @returns Function that removes this exact listener.
   */
  subscribeStructure(listener: () => void): () => void {
    return this.retainSubscription(this.document.blocks.subscribeStructure(listener));
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
    return this.prepareBlockInputs(input, onError, false);
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
   * Checks whether the document contains the block.
   *
   * @param id - Block identifier to inspect.
   * @returns True when the block exists.
   */
  canRemove(id: string): boolean {
    return this.hasBlock(id);
  }

  /**
   * Checks whether the block has a parent in this document.
   *
   * @param id - Block identifier to inspect.
   * @returns True when the block exists and has a parent.
   */
  canOutdent(id: string): boolean {
    return this.getParentId(id) != null;
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
   * @param destination - Actual parent and optional next sibling; omitted appends to document roots.
   * @returns Complete persisted block assembled during insertion.
   */
  insertBlock(block: EditorBlockInput, destination?: BlockDestination): EditorBlock {
    // Validate detached input and apply child-entry rules before starting the undo batch.
    const prepared = this.preparePlacementForest(this.prepareInput([block]), destination)[0]!;
    // Storage insertion is already transactional; this wrapper creates undo
    // capture breakpoints so the following action does not merge with creation.
    return this.editor.history.batchUpdates(() =>
      this.document.blocks.insertBlock(prepared, destination),
    );
  }

  /** @param parentId - Real parent identity. @returns Its direct child IDs or empty when absent. */
  getChildIds(parentId: string): readonly string[] {
    return this.document.blocks.getChildIds(parentId);
  }

  /** @param afterId - Sibling to follow, null to prepend, or omitted to append. @returns Real document placement. @throws For a missing sibling. */
  getInsertionDestinationAfter(afterId?: string | null): BlockDestination {
    return this.document.blocks.getInsertionDestinationAfter(afterId);
  }

  /**
   * Imports a detached forest while preserving every source identity that is
   * free under the destination document's identity allocation policy. Other documents
   * have independent namespaces and do not prevent reuse of these identities.
   *
   * Existing IDs indicate copy-and-paste and receive destination-generated
   * replacements. IDs removed by cut are restored when the application's identity
   * policy leaves them available; a database may retain their reservations. The result
   * exposes the complete mapping so clipboard extensions can update references
   * without inferring insertion results from selection state.
   *
   * @param blocks - Complete copied roots or creation inputs to insert recursively.
   * @param destination - Receiving parent and optional next sibling; omitted appends to roots.
   * Creation processors and validation still run during this import.
   * @param options - Optional recovery, preallocated identities, and identity requirements.
   * @param options.onError - Optional handler that supplies one replacement for a failed node.
   * @param options.ids - Optional source-to-destination IDs already allocated for clipboard references.
   * @param options.preserveIds - Whether to reject missing, conflicting, or changed source IDs.
   * @returns Complete persisted roots and source mappings.
   * @throws If preparation fails or the requested source identities cannot be preserved.
   */
  importForest(
    blocks: readonly (EditorBlock | EditorBlockInput)[],
    destination?: BlockDestination,
    options?: BlockImportOptions,
  ): ImportedBlockForest {
    const { onError, ids, preserveIds = false } = options ?? {};
    const sourceIds = validateBlockForest(blocks);
    if (preserveIds) {
      // Check every descendant before calling extension processors or writing any root.
      for (const id of sourceIds) {
        if (this.hasBlock(id)) {
          throw new Error(`Destination already contains block ${id}`);
        }
      }
    }
    // Map every descendant before insertion so clipboard extensions can use
    // the same destination IDs when rewriting stored references.
    const idMap =
      ids ??
      (preserveIds
        ? new Map(Array.from(sourceIds, (id) => [id, id]))
        : this.document.blocks.createImportIdMap([...sourceIds]));
    /**
     * Rewrites one complete source subtree with its destination identities.
     *
     * @param block - Source node whose descendants share the forest ID map.
     * @returns A detached creation input with mapped identities.
     * @throws If the map omits or changes a required identity.
     */
    const remap = (block: EditorBlock | EditorBlockInput): EditorBlockInput => {
      const id = block.id === undefined ? undefined : idMap.get(block.id);
      if (block.id !== undefined && !id) {
        throw new Error(`Missing imported block ID: ${block.id}`);
      }
      if (preserveIds && (!block.id || id !== block.id)) {
        throw new Error("Import must preserve block IDs");
      }
      return { ...block, id, children: block.children?.map(remap) ?? [] };
    };
    const prepared = this.preparePlacementForest(
      this.prepareBlockInputs(blocks.map(remap), onError, preserveIds),
      destination,
    );
    if (preserveIds) {
      // Entry rules can replace descendants. Verify the final forest before the first insertion.
      const preparedIds = new Set<string>();
      const pending = [...prepared];
      while (pending.length) {
        const block = pending.pop()!;
        if (!block.id) {
          throw new Error("Import must preserve block IDs");
        }
        preparedIds.add(block.id);
        pending.push(...(block.children ?? []));
      }
      if (
        sourceIds.size !== preparedIds.size ||
        [...sourceIds].some((id) => !preparedIds.has(id))
      ) {
        throw new Error("Import must preserve block IDs");
      }
    }
    const roots: EditorBlock[] = [];
    this.editor.history.batchUpdates(() => {
      prepared.forEach((block) => roots.push(this.document.blocks.insertBlock(block, destination)));
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
    if (!block) {
      throw new Error(`Block ${id} not found`);
    }
    this.validateListPropsDeletion(block.listProps, keys);
    return this.editor.history.batchUpdates(() => this.document.blocks.deleteListProps(id, keys));
  }

  /** Deletes list-property keys from several blocks atomically. */
  deleteListPropsBatch(updates: readonly { id: string; keys: readonly string[] }[]): void {
    const simulated = new Map<string, Record<string, unknown>>();
    updates.forEach(({ id, keys }) => {
      const block = this.document.blocks.getBlockNode(id);
      if (!block) {
        throw new Error(`Block ${id} not found`);
      }
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
    const childIds = this.document.blocks.getBlockNode(id)?.childIds ?? [];
    this.prepareRemoval(childIds);
    this.editor.history.batchUpdates(() => {
      this.document.blocks.updateBlock(id, { content: "" });
      childIds.forEach((childId) => this.document.blocks.removeBlock(childId));
    });
  }

  /**
   * Converts one block to another registered native type.
   *
   * Processor changes to list properties are validated and committed with the
   * type change; unrelated existing properties remain intact.
   *
   * @param id - Block identifier to convert.
   * @param type - Registered destination type.
   * @returns No value.
   */
  setBlockType(id: string, type: string): void {
    const current = this.document.blocks.getBlockNode(id);
    if (!current) {
      throw new Error(`Block ${id} not found`);
    }
    const props = this.editor.blockRegistry.prepareTypeChange(type, current.props);
    const processed = this.runProcessors({ ...current, type, props, children: undefined });
    const listProps = processed.listProps;
    const changedListProps = listProps !== current.listProps;
    if (changedListProps) {
      this.editor.blockListProps.prepare({ ...current.listProps, ...listProps });
    }
    // Storage insertion is already transactional; this wrapper creates undo
    // capture breakpoints so the following action does not merge with creation.
    // Type and its processor-supplied list properties belong to the same undo step.
    this.editor.history.batchUpdates(() => {
      this.document.blocks.setBlockType(id, type, processed.props);
      if (changedListProps && listProps) {
        this.document.blocks.updateBlock(id, { listProps });
      }
    });
  }

  /**
   * Removes one block subtree.
   *
   * @param id - Block identifier to remove.
   * @returns No value.
   */
  removeBlock(id: string): void {
    this.removeBlocks([id]);
  }

  /**
   * Removes several block subtrees as one undo item.
   *
   * @param ids - Block identifiers to remove.
   * @returns True when generic removal ran, or false when a behavior claimed the group.
   * @throws If a behavior or document mutation fails.
   */
  removeBlocks(ids: readonly string[]): boolean {
    return this.editor.history.batchUpdates(() => {
      if (this.behaviorStrategy.interceptDeletion(ids)) {
        return false;
      }
      this.prepareRemoval(ids);
      ids.forEach((id) => this.document.blocks.removeBlock(id));
      return true;
    });
  }

  /**
   * Replaces text across selected blocks while removing fully covered trailing blocks.
   *
   * Text selection is not a structural block deletion; child-exit transitions
   * still run for removed subtrees. The replacement and removals share one history batch.
   *
   * @param firstId - Surviving block receiving the combined text.
   * @param trailingIds - Selected trailing block IDs to remove.
   * @param content - Combined surviving text.
   * @returns After trailing blocks are removed and the survivor is updated.
   * @throws If transition hooks, validation, or document mutations fail.
   */
  replaceTextSelection(firstId: string, trailingIds: readonly string[], content: string): void {
    // Removing an ancestor would also delete the block that receives the replacement text.
    const removed = new Set(trailingIds);
    let ancestor: string | null | undefined = firstId;
    while (ancestor != null) {
      if (removed.has(ancestor)) {
        throw new Error("Trailing blocks cannot contain the surviving block");
      }
      ancestor = this.document.blocks.getParentId(ancestor);
    }
    this.editor.history.batchUpdates(() => {
      this.prepareRemoval(trailingIds);
      // History batches retain earlier writes on error. Update the survivor first so a stale
      // selection or rejected update leaves the trailing content available.
      this.updateBlock(firstId, { content });
      trailingIds.forEach((id) => this.document.blocks.removeBlock(id));
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
    return this.editor.history.batchUpdates(() => {
      if (targetId === sourceId) {
        throw new Error("Cannot merge a block into itself");
      }
      const target = this.document.blocks.getBlockNode(targetId);
      const source = this.document.blocks.getBlockNode(sourceId);
      if (!source) {
        throw new Error(`Block ${sourceId} not found`);
      }
      if (!target) {
        throw new Error(`Block ${targetId} not found`);
      }
      if (this.collectTreeIds(sourceId).includes(targetId)) {
        throw new Error(`Cannot merge block ${sourceId} into its descendant ${targetId}`);
      }
      // Resolve parent transitions before moving children or consuming the source.
      const updates = this.preparePlacementUpdates(source.childIds, targetId);
      const sourceParentId = this.getParentId(sourceId);
      if (this.behaviorStrategy.hasChildTransitionBehaviors() && sourceParentId) {
        const parent = this.getBlockNode(sourceParentId);
        if (parent) {
          this.behaviorStrategy.processChildTransition({
            child: source,
            previousParent: parent,
            nextParent: null,
          });
        }
      }
      const blocks = this.document.blocks;
      blocks.moveBlocks(source.childIds.map((id) => ({ id, targetId, position: "inside" })));
      if (updates.length) {
        blocks.updateBlocks(updates);
      }
      if (source.content) {
        blocks.insertText(targetId, target.content.length, source.content);
      }
      blocks.removeBlock(sourceId);
      return target.content.length;
    });
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
    if (id === targetId) {
      return;
    }
    for (
      let ancestor = targetId;
      ancestor !== null;
      ancestor = this.getParentId(ancestor) ?? null
    ) {
      if (ancestor === id) {
        throw new Error(`Cannot move block ${id} relative to its descendant ${targetId}`);
      }
    }
    this.moveGroupedBlocks([id], targetId, position);
  }

  /**
   * Moves several subtree roots, including roots from different parents, as one undo item.
   *
   * Every supplied ID must exist. Descendant IDs of other supplied roots are dropped
   * and remaining roots follow canonical document order, regardless of their parents.
   * Document storage `moveBlocks` is the lower-level placement batch and does not
   * apply those grouping rules. A null target retains each root's current parent
   * and prepends within that sibling list; it does not mean the document root.
   *
   * @param ids - Block identifiers to move together, in any order; duplicates are ignored.
   * @param targetId - Destination, or null for each source sibling-list start.
   * @param position - Placement before, after, or inside the destination; defaults to after.
   * @returns The validated roots have moved as one undoable update, or no change for an empty group.
   * @throws Before writes when any source or destination is missing or the destination lies in a selected subtree.
   */
  moveBlocks(
    ids: string[],
    targetId: string | null,
    position: "before" | "after" | "inside" = "after",
  ): void {
    // Resolve the range before opening the history transaction so reads can
    // reuse the document's placement index. The grouped move owns undo capture.
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
   * @returns True if the leading block exists within the scope, including handled no-ops.
   * @throws If a behavior or document operation fails.
   */
  indentBlocks(ids: string[]): boolean {
    const outcome = this.behaviorStrategy.interceptOutline("indent", ids);
    // A behavior may consume the command before the default outline operation.
    if (outcome !== "unhandled") {
      return outcome !== "missing";
    }
    if (ids.some((id) => !this.getBlockNode(id))) {
      return true;
    }
    const roots = this.topLevelRoots(ids);
    if (!this.isConsecutiveRange(roots)) {
      return true;
    }
    const parentId = this.getParentId(roots[0]!) ?? null;
    const siblings = parentId === null ? this.getRootIds() : this.getChildIds(parentId);
    const index = siblings.indexOf(roots[0]!);
    if (index <= 0) {
      return true;
    }
    const targetId = siblings[index - 1]!;
    if (!this.allowsOutlineMove(roots, { parentId: targetId })) {
      return true;
    }
    const updates = this.preparePlacementUpdates(roots, targetId);
    this.editor.history.batchUpdates(() => {
      this.document.blocks.moveBlocks(roots.map((id) => ({ id, targetId, position: "inside" })));
      if (updates.length) {
        this.document.blocks.updateBlocks(updates);
      }
    });
    return true;
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
   * Later siblings become children of the last lifted root to preserve reading order.
   * In a parent containing A, B, C, lifting B places B after the parent and C under B.
   * The tail moves first so it can still be found in the original sibling list.
   *
   * @param ids - Block identifiers to outdent together, including any nested
   *   descendants the caller also listed.
   * @returns True when the leading block exists in scope, including handled no-ops.
   * @throws If a behavior or document operation fails.
   */
  outdentBlocks(ids: string[]): boolean {
    const outcome = this.behaviorStrategy.interceptOutline("outdent", ids);
    // A behavior may consume the command before the default outline operation.
    if (outcome !== "unhandled") {
      return outcome !== "missing";
    }
    if (ids.some((id) => !this.getBlockNode(id))) {
      return true;
    }
    const roots = this.topLevelRoots(ids);
    if (!this.isConsecutiveRange(roots)) {
      return true;
    }
    const parentId = this.getParentId(roots[0]!);
    if (!parentId) {
      return true;
    }
    // Transition hooks and storage use document coordinates, including a panel's hidden root.
    const destination = this.documentBlocks.getInsertionDestinationAfter(parentId);
    const destinationParent = destination.parentId;
    // A range may continue at the destination depth; those blocks stay put.
    const firstDestinationLevel = roots.findIndex(
      (id) => this.documentBlocks.getParentId(id) === destinationParent,
    );
    const moving = firstDestinationLevel < 0 ? roots : roots.slice(0, firstDestinationLevel);
    if (!moving.length) {
      return true;
    }
    const lastId = moving.at(-1)!;
    const siblings = this.getChildIds(parentId);
    const following = siblings.slice(siblings.indexOf(lastId) + 1);
    if (
      !this.allowsOutlineMove(moving, destination) ||
      (following.length > 0 && !this.allowsOutlineMove(following, { parentId: lastId }))
    ) {
      return true;
    }
    const updates = [
      ...this.preparePlacementUpdates(following, lastId),
      ...this.preparePlacementUpdates(moving, destinationParent),
    ];
    // Move the tail before lifting: afterwards lastId no longer shares P's child list,
    // so the old sibling tail cannot be found from its new location.
    this.editor.history.batchUpdates(() => {
      this.document.blocks.moveFollowingSiblingsInside(lastId);
      this.document.blocks.moveBlocks([
        // Repeated "after parent" inserts reverse order unless roots go last-first.
        ...[...moving]
          .reverse()
          .map((id) => ({ id, targetId: parentId, position: "after" as const })),
      ]);
      if (updates.length) {
        this.document.blocks.updateBlocks(updates);
      }
    });
    return true;
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
    this.subscriptions.forEach((unsubscribe) => unsubscribe());
    this.subscriptions.clear();
    if (this.ownsProcessors) {
      this.processors.forEach((registration) => registration.dispose());
      this.processors.clear();
    }
  }

  /**
   * Reads the current shared model used by this manager's operations.
   *
   * @returns The document supplied by the editor at the time of the read.
   * @throws If the editor cannot supply a document.
   */
  private get document(): DocumentModel {
    return this.editor.getDocument();
  }

  /**
   * Retains an existing document subscription until explicitly removed or destroyed.
   * Its listener remains bound to the model where the subscription was created.
   * @param unsubscribe - Function that removes the existing document subscription.
   * @returns Function that permanently removes the retained subscription.
   */
  private retainSubscription(unsubscribe: () => void): () => void {
    this.subscriptions.add(unsubscribe);
    return () => {
      if (!this.subscriptions.delete(unsubscribe)) {
        return;
      }
      unsubscribe();
    };
  }

  /**
   * Moves grouped roots in canonical document order, carrying selected descendants once.
   *
   * Sources are checked before filtering so a stale selection cannot partially move.
   * Destination ancestry is checked without traversing each selected subtree.
   *
   * @param ids - Candidate block identifiers in arbitrary order and from any parents.
   * @param targetId - Destination anchor, or null for each source sibling-list start.
   * @param position - Placement relative to the anchor.
   * @returns The complete validated group has moved in one history batch.
   * @throws Before writes if a source is missing or the destination lies within a selected subtree.
   */
  private moveGroupedBlocks(
    ids: string[],
    targetId: string | null,
    position: "before" | "after" | "inside",
  ): void {
    for (const id of ids) {
      if (!this.getBlockNode(id)) {
        throw new Error(`Block ${id} not found`);
      }
    }
    const roots = this.topLevelRoots(ids);
    if (!roots.length) {
      return;
    }
    const selected = new Set(roots);
    for (
      let ancestor = targetId;
      ancestor !== null;
      ancestor = this.getParentId(ancestor) ?? null
    ) {
      if (selected.has(ancestor)) {
        throw new Error(`Cannot move blocks relative to their descendant ${targetId}`);
      }
    }
    // Inserting repeatedly after the same anchor reverses order unless the
    // grouped roots are processed backwards. Prepending has the same rule.
    const ordered = targetId === null || position === "after" ? [...roots].reverse() : roots;
    let nextParentId: string | null | undefined;
    if (targetId !== null) {
      nextParentId = position === "inside" ? targetId : this.getParentId(targetId);
    }
    if (targetId !== null && nextParentId === undefined) {
      throw new Error(`Target block ${targetId} not found`);
    }
    if (!this.behaviorStrategy.allowsGroupedMove(roots, targetId, position)) {
      return;
    }
    const updates = this.preparePlacementUpdates(roots, nextParentId);
    this.editor.history.batchUpdates(() => {
      this.document.blocks.moveBlocks(ordered.map((id) => ({ id, targetId, position })));
      if (updates.length) {
        this.document.blocks.updateBlocks(updates);
      }
    });
  }

  /**
   * Checks that every scoped root can move to the requested destination.
   *
   * @param ids - Independently moved root identifiers.
   * @param destination - Receiving parent and optional next sibling.
   * @returns False when a root is unavailable or an installed behavior vetoes the move.
   * @throws If a behavior or hierarchy read fails.
   */
  private allowsOutlineMove(ids: readonly string[], destination: BlockDestination): boolean {
    const sources = ids.flatMap((id) => {
      const block = this.getBlockNode(id);
      return block ? [block] : [];
    });
    return sources.length === ids.length && this.documentBlocks.canMove({ sources, destination });
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
      if (!stored) {
        throw new Error(`Block ${id} not found`);
      }
      const current = simulated.get(id) ?? stored;
      const candidate: BlockInput = {
        ...current,
        children: undefined,
        listProps: patch.listProps
          ? { ...current.listProps, ...patch.listProps }
          : current.listProps,
        props: patch.props ? { ...current.props, ...patch.props } : current.props,
        pluginData: patch.pluginData
          ? { ...current.pluginData, ...patch.pluginData }
          : current.pluginData,
        content: patch.content ?? current.content,
      };
      if (patch.listProps) {
        this.editor.blockListProps.prepare(candidate.listProps ?? {});
      }
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
   * Filters identifiers to independently movable roots in document order.
   * @param ids - Candidate identifiers.
   * @returns Roots excluding descendants of other listed blocks.
   */
  private topLevelRoots(ids: string[]): string[] {
    // A single subtree is already an ordered root. Avoid walking every block
    // merely to rediscover its place in the document outline.
    if (ids.length === 1) {
      return this.getBlockNode(ids[0]!) ? ids : [];
    }
    const listed = new Set(ids);
    return this.getOrderedIds(listed).filter((id) => {
      let parentId = this.getParentId(id);
      while (parentId) {
        if (listed.has(parentId)) {
          return false;
        }
        parentId = this.getParentId(parentId);
      }
      return true;
    });
  }

  /**
   * Checks whether complete listed subtrees cover an uninterrupted outline range.
   *
   * Each root must be followed immediately by the next root after its entire
   * subtree. Parent links and sibling lists come from the document's current
   * hierarchy indexes, so unrelated subtrees do not need to be materialized.
   *
   * @param roots - Subtree roots in document order.
   * @returns Whether every block between the first and last subtree is covered.
   */
  private isConsecutiveRange(roots: string[]): boolean {
    if (!roots.length) {
      return false;
    }
    // Reuse sibling indexes for this read only. Each selected subtree must end
    // immediately before the next root, even when the walk has to ascend several levels.
    const siblingIndexes = new Map<
      string | null,
      { ids: readonly string[]; positions: Map<string, number> }
    >();
    for (let rootIndex = 0; rootIndex + 1 < roots.length; rootIndex++) {
      let nextId: string | undefined;
      const visited = new Set<string>();
      let current = roots[rootIndex]!;
      while (!visited.has(current)) {
        visited.add(current);
        const parent = this.getParentId(current);
        if (parent === undefined) {
          break;
        }
        let siblings = siblingIndexes.get(parent);
        if (!siblings) {
          const ids = parent === null ? this.getRootIds() : this.getChildIds(parent);
          siblings = { ids, positions: new Map(ids.map((child, index) => [child, index])) };
          siblingIndexes.set(parent, siblings);
        }
        const index = siblings.positions.get(current);
        if (index === undefined) {
          break;
        }
        if (index + 1 < siblings.ids.length) {
          nextId = siblings.ids[index + 1];
          break;
        }
        if (parent === null) {
          break;
        }
        current = parent;
      }
      if (nextId !== roots[rootIndex + 1]) {
        return false;
      }
    }
    return true;
  }

  /**
   * Collects a subtree's identifiers, including collapsed descendants.
   * @param id - Root identifier to walk.
   * @param visited - Identifiers already traversed to stop malformed cycles.
   * @returns Root and descendants in depth-first document order.
   */
  private collectTreeIds(id: string, visited = new Set<string>()): string[] {
    if (visited.has(id)) {
      return [];
    }
    visited.add(id);
    return [
      id,
      ...(this.getBlockNode(id)?.childIds ?? []).flatMap((child) =>
        this.collectTreeIds(child, visited),
      ),
    ];
  }

  /**
   * Allocates creation identities and prepares all direct-child entries before insertion.
   *
   * @param forest - Already validated, editor-processed creation roots.
   * @param destination - Existing parent and insertion boundary, or document roots.
   * @returns Detached roots with each newly created parent-child relationship processed.
   * @throws If a destination or processor result is invalid.
   */
  private preparePlacementForest(
    forest: readonly EditorBlockInput[],
    destination?: BlockDestination,
  ): EditorBlockInput[] {
    if (!this.behaviorStrategy.hasChildTransitionBehaviors()) {
      return [...forest];
    }
    const allocated = new Set<string>();
    /**
     * Reserves explicitly supplied identities before allocating missing identities.
     *
     * @param block - Detached input whose descendants are also inspected.
     * @returns All explicit identities in this subtree have been recorded.
     */
    const reserve = (block: EditorBlockInput): void => {
      if (block.id) {
        allocated.add(block.id);
      }
      block.children?.forEach(reserve);
    };
    forest.forEach(reserve);
    /**
     * Assigns document-generated identities without mutating the supplied input.
     *
     * @param block - Detached input and its optional descendants.
     * @returns A copied subtree whose nodes have distinct identities.
     */
    const assign = (block: EditorBlockInput): EditorBlockInput => {
      let id = block.id;
      if (!id) {
        id = this.document.blocks.createBlockId();
        if (allocated.has(id)) {
          throw new Error(`Duplicate block ID: ${id}`);
        }
      }
      allocated.add(id);
      return { ...block, id, children: block.children?.map(assign) };
    };
    const parentId = destination?.parentId;
    const parent = parentId ? this.getBlockNode(parentId) : null;
    if (parentId && !parent) {
      throw new Error(`Parent block ${parentId} not found`);
    }
    /**
     * Applies entry transformations to a complete newly created subtree.
     *
     * @param block - Prepared child whose identity has already been allocated.
     * @param owner - Its receiving parent, or null for a document root.
     * @returns The transformed subtree with original hierarchy retained.
     */
    const visit = (block: EditorBlockInput, owner: BlockInput | null): EditorBlockInput => {
      const child = owner
        ? this.behaviorStrategy.processChildTransition({
            child: block,
            previousParent: null,
            nextParent: owner,
          })
        : block;
      return { ...child, children: child.children?.map((nested) => visit(nested, child)) };
    };
    const prepared = forest.map(assign).map((block) => visit(block, parent ?? null));
    validateBlockForest(prepared);
    return prepared;
  }

  /**
   * Prepares child patches for a group of direct-parent changes.
   *
   * @param ids - Existing independently moved roots.
   * @param nextParentId - Receiving parent, null for roots, or undefined to retain each parent.
   * @returns Validated patches to apply in the same batch as the move.
   * @throws If a processor or patch validation fails before the move.
   */
  private preparePlacementUpdates(
    ids: readonly string[],
    nextParentId: string | null | undefined,
  ): BlockUpdate[] {
    if (!this.behaviorStrategy.hasChildTransitionBehaviors() || nextParentId === undefined) {
      return [];
    }
    const nextParent = nextParentId ? this.documentBlocks.getBlockNode(nextParentId) : null;
    if (nextParentId && !nextParent) {
      throw new Error(`Parent block ${nextParentId} not found`);
    }
    const updates: BlockUpdate[] = [];
    for (const id of ids) {
      const child = this.getBlockNode(id);
      if (!child) {
        throw new Error(`Block ${id} not found`);
      }
      const previousParentId = this.documentBlocks.getParentId(id);
      if (previousParentId === nextParentId) {
        continue;
      }
      const previousParent = previousParentId
        ? this.documentBlocks.getBlockNode(previousParentId)
        : null;
      const next = this.behaviorStrategy.processChildTransition({
        child,
        previousParent: previousParent ?? null,
        nextParent: nextParent ?? null,
      });
      if (next === child) {
        continue;
      }
      const patch: EditorBlockPatch = {};
      if (next.listProps !== child.listProps) {
        patch.listProps = next.listProps;
      }
      if (next.pluginData !== child.pluginData) {
        patch.pluginData = next.pluginData;
      }
      if (next.props !== child.props) {
        patch.props = next.props;
      }
      if (next.content !== child.content) {
        patch.content = next.content;
      }
      updates.push({ id, patch });
    }
    return this.processUpdates(updates);
  }

  /**
   * Invokes exit transformations for every direct-child relationship being deleted.
   *
   * Returned child changes need not be written because those child records are removed.
   *
   * @param ids - Existing roots selected for removal.
   * @returns All relevant exit processors have completed before deletion begins.
   * @throws If a processor rejects a transition or produces invalid child data.
   */
  private prepareRemoval(ids: readonly string[]): void {
    if (!this.behaviorStrategy.hasChildTransitionBehaviors()) {
      return;
    }
    const seen = new Set<string>();
    for (const rootId of ids) {
      const parentId = this.documentBlocks.getParentId(rootId);
      const parent = parentId ? (this.documentBlocks.getBlockNode(parentId) ?? null) : null;
      const pending: Array<{ id: string; parent: BlockInput | null }> = [{ id: rootId, parent }];
      while (pending.length) {
        const current = pending.pop()!;
        if (seen.has(current.id)) {
          continue;
        }
        seen.add(current.id);
        const block = this.getBlockNode(current.id);
        if (!block) {
          continue;
        }
        if (current.parent) {
          this.behaviorStrategy.processChildTransition({
            child: block,
            previousParent: current.parent,
            nextParent: null,
          });
        }
        for (const id of block.childIds) {
          pending.push({ id, parent: block });
        }
      }
    }
  }

  /**
   * Runs creation and recovery for each node before validating the prepared forest.
   *
   * A preserved import checks each processor result against the ID of its input.
   * The final forest check alone cannot distinguish two processors swapping IDs.
   *
   * @param input - Detached roots to prepare in order.
   * @param onError - Optional replacement for a node rejected during preparation.
   * @param preserveIds - Whether each processed node must retain its source identity.
   * @returns Prepared roots with validated hierarchy and portable fields.
   * @throws If preparation, identity preservation, or forest validation fails.
   */
  private prepareBlockInputs(
    input: readonly EditorBlockInput[],
    onError: BlockPrepareErrorHandler | undefined,
    preserveIds: boolean,
  ): EditorBlockInput[] {
    // Validate before recursion so malformed children or a caller-provided cycle
    // fail deterministically instead of running factories/processors or overflowing
    // the preparation walk before the postcondition can be checked.
    validateBlockForest(input);
    // Use reference identity because creation nodes may not have IDs and cycles
    // belong to the in-memory object graph. Duplicate persisted IDs are a separate
    // forest invariant handled by validateBlockForest.
    const activeNodes = new Set<BlockInput>();
    const prepared = input.map((block) =>
      this.prepareBlockInput(block, activeNodes, onError, preserveIds),
    );
    // Definitions and processors may change IDs, children, or portable values,
    // so their complete output needs the same forest invariants checked again.
    // The active-node guard above makes processor-created cycles fail before
    // recursion; this pass verifies all other complete-forest postconditions.
    validateBlockForest(prepared);
    return prepared;
  }

  /**
   * Applies the complete creation policy recursively to a single block.
   *
   * Source and processor-returned objects both belong to the active recursion path.
   * Recovery retries the replacement subtree once with its own recovery disabled.
   *
   * @param block - Detached node to prepare.
   * @param activeNodes - Objects currently being prepared along this ancestor path.
   * @param onError - Optional replacement factory for a rejected node.
   * @param preserveIds - Whether processors must retain the input node's identity.
   * @returns The prepared block and its recursively prepared children.
   * @throws If input or processor output contains a cycle, or preparation or recovery fails.
   */
  private prepareBlockInput(
    block: EditorBlockInput,
    activeNodes: Set<BlockInput>,
    onError: BlockPrepareErrorHandler | undefined,
    preserveIds: boolean,
  ): EditorBlockInput {
    if (activeNodes.has(block)) {
      throw new Error("Block forest must be acyclic");
    }
    const sourceId = block.id;
    activeNodes.add(block);
    try {
      let processed: BlockInput;
      try {
        if (!this.editor.blockRegistry.has(block.type)) {
          throw new Error(`Block type ${block.type} is not registered`);
        }
        const listProps = this.editor.blockListProps.prepare(block.listProps);
        processed = this.runProcessors(this.editor.blockRegistry.prepare({ ...block, listProps }));
        if (processed !== block && activeNodes.has(processed)) {
          throw new Error("Block forest must be acyclic");
        }
      } catch (error) {
        if (!onError) {
          throw error;
        }
        const replacement = onError(block, error);
        if (preserveIds && replacement.id !== undefined && replacement.id !== sourceId) {
          throw new Error("Import must preserve block IDs");
        }
        // Keep the assigned identity and retry once with complete creation defaults.
        // Disabling recovery here lets failures in the replacement reach the caller.
        return this.prepareBlockInput(
          {
            ...replacement,
            id: replacement.id ?? sourceId,
            listProps: replacement.listProps ?? {},
            props: replacement.props ?? {},
            pluginData: replacement.pluginData ?? {},
            content: replacement.content ?? "",
            children: replacement.children ?? [],
          },
          activeNodes,
          undefined,
          preserveIds,
        );
      }
      if (preserveIds && processed.id !== sourceId) {
        throw new Error("Import must preserve block IDs");
      }
      activeNodes.add(processed);
      try {
        return {
          ...processed,
          children: processed.children?.map((child) =>
            this.prepareBlockInput(child, activeNodes, onError, preserveIds),
          ),
        };
      } finally {
        activeNodes.delete(processed);
      }
    } finally {
      activeNodes.delete(block);
    }
  }
}
