import type { BlockPrepareErrorHandler, EditorBlock, EditorBlockInput, EditorBlockNode, EditorBlockPatch, EditorBlockUpdate } from "@chulane/rivto";

/** Document block operations exposed to React consumers without core lifecycle methods. */
export interface BlocksApi {
  /**
   * Delegates complete recursive creation preparation to the core block manager.
   *
   * Applies definitions, list policy, processors, and validation to a detached block-input tree.
   *
   * @param input - Block forest to prepare without mutating the document.
   * @returns Recursively copied forest ready for a React block operation.
   * @throws {Error} When any definition, processor, or persisted value is invalid.
   */
  prepareInput(
    input: readonly (EditorBlock | EditorBlockInput)[],
    onError?: BlockPrepareErrorHandler,
  ): EditorBlockInput[];
  /**
   * Inserts a recursively prepared and validated block through the core editor.
   *
   * Prepares and inserts a block, returning the complete persisted subtree.
   *
   * @param input - Block subtree to receive active defaults and validation.
   * @param afterId - Sibling after which to insert, `null` for first position, or
   * omitted for the end of the root list.
   * @returns The complete persisted root block.
   * @throws {Error} When list properties are invalid or core insertion fails.
   */
  insertBlock(input: EditorBlockInput, afterId?: string | null): EditorBlock;
  /**
   * Applies one patch after core-owned list-property validation.
   *
   * Applies one valid patch and returns updated fields without descendants, or throws.
   *
   * @param id - Identifier of the block to update.
   * @param patch - Partial block fields to pass to the core manager.
   * @returns Updated block fields without descendants.
   * @throws {Error} When the block is missing or the operation is invalid.
   */
  updateBlock(id: string, patch: EditorBlockPatch): EditorBlockNode;
  /**
   * Applies an ordered patch batch through core validation.
   * Applies an entire valid patch batch and returns updated fields without descendants in input order, or throws.
   *
   * @param updates - Ordered identified patches to validate and apply atomically.
   * @returns Updated block fields without descendants, in input order.
   * @throws {Error} When any block is missing or any operation is invalid.
   */
  updateBlocks(updates: readonly EditorBlockUpdate[]): EditorBlockNode[];
  /**
   * Deletes selected list-property keys after validating the resulting record.
   *
   * Deletes list-property keys and returns whether the mutation was applied.
   *
   * @param id - Identifier of the block to modify.
   * @param keys - Property names to remove.
   * @returns Whether any persisted property was deleted.
   * @throws {Error} When the block is missing or the operation is invalid.
   */
  deleteListProps(id: string, keys: readonly string[]): boolean;
  /**
   * Deletes list-property keys through core batch validation.
   * Deletes an entire valid key batch or throws.
   *
   * @param updates - Blocks and property names requested for deletion.
   * @returns No value after applying every deletion.
   * @throws {Error} When any block is missing or any operation is invalid.
   */
  deleteListPropsBatch(updates: readonly { id: string; keys: readonly string[] }[]): void;
  /** @returns Current core block revision.
   *
   * Current block revision used by React subscriptions.
   */
  readonly revision: number;
  /**
   * Checks whether the document contains a block with this identifier.
   * @param id - Stable block identifier to look up.
   * @returns Whether the block exists, including blocks nested under another block.
   */
  hasBlock(id: string): boolean;
  /** @returns One detached block, when present.
   *
   * @param id - Block identifier. @returns Detached subtree, or undefined when absent.
   */
  getBlock(id: string): EditorBlock | undefined;
  /** @returns Detached non-recursive block fields, when present.
   *
   * @param id - Block identifier. @returns Detached non-recursive block fields, or undefined when absent.
   */
  getBlockNode(id: string): EditorBlockNode | undefined;
  /**
   * Reads all root blocks together with their complete descendant trees.
   *
   * The returned forest is detached from the document; editing it does not persist changes.
   * @returns All root subtrees in document order, or an empty array for an empty document.
   */
  getBlocks(): EditorBlock[];
  /**
   * Reads the document's top-level block identifiers in their stored order.
   *
   * Nested blocks are not included; use getOrderedIds() to order a supplied set.
   * @returns Root block identifiers in document order, or an empty array for an empty document.
   */
  getRootIds(): string[];
  /** @param ids - Candidate IDs. @returns Unique placed IDs in document order, omitting missing records. */
  getOrderedIds(ids: Iterable<string>): string[];
  /**
   * Subscribes to changes affecting one block's complete recursive snapshot.
   *
   * Includes changes in descendants; use subscribeBlockNode() when only the block's
   * own fields and direct child identifiers are needed.
   * @param id - Block identifier to observe.
   * @param listener - Callback invoked after relevant changes.
   * @returns Function that removes the subscription.
   */
  subscribeBlock(id: string, listener: () => void): () => void;
  /**
   * Subscribes to one block's own fields and ordered direct child identifiers.
   *
   * Changes only to a descendant's content do not require a recursive snapshot here.
   * @param id - Block identifier to observe.
   * @param listener - Callback invoked after relevant changes to this block node.
   * @returns Function that removes the subscription.
   */
  subscribeBlockNode(id: string, listener: () => void): () => void;
  /** Subscribes to ordered root identifiers.
   *
   * Subscribes to ordered root identifier changes.
   * @param listener - Callback invoked after root changes.
   * @returns Function that removes the subscription.
   */
  subscribeRootIds(listener: () => void): () => void;
  /** Subscribes to hierarchy changes.
   *
   * Subscribes to hierarchy changes.
   * @param listener - Callback invoked after hierarchy changes.
   * @returns Function that removes the subscription.
   */
  subscribeStructure(listener: () => void): () => void;
  /** @returns True when the block has at least one child.
   *
   * @param id - Parent block identifier. @returns True when the block has at least one child.
   */
  hasChildren(id: string): boolean;
  /** @returns A block's parent, root marker, or missing marker.
   *
   * @param id - Block identifier. @returns Parent ID, null at root, or undefined when absent.
   */
  getParentId(id: string): string | null | undefined;
  /** @returns True when the block exists and has no parent.
   *
   * @param id - Block identifier. @returns True when the block exists and has no parent.
   */
  isRootBlock(id: string): boolean;
  /** Imports a detached block forest with collision remapping.
   *
   * Imports a detached forest and reports its destination identities.
   * @param blocks - Complete copied roots or creation inputs to import.
   * @param afterId - Existing sibling to follow, null to prepend, or undefined to append.
   * @param onError - Optional one-shot replacement for a failed block.
   * @returns Complete persisted roots and source-to-destination ID mapping.
   */
  importForest(
    blocks: readonly (EditorBlock | EditorBlockInput)[],
    afterId?: string | null,
    onError?: BlockPrepareErrorHandler,
  ): { roots: EditorBlock[]; idMap: ReadonlyMap<string, string> };
  /** Clears one block while preserving its identity.
   *
   * @param id - Block identifier to clear. @returns No value.
   */
  clearBlock(id: string): void;
  /** Converts one block to a registered type.
   *
   * @param id - Block identifier. @param type - Destination block type. @returns No value.
   */
  setBlockType(id: string, type: string): void;
  /** Removes one block subtree.
   *
   * @param id - Block identifier to remove. @returns No value.
   */
  removeBlock(id: string): void;
  /** Removes several block subtrees atomically.
   *
   * @param ids - Block subtree roots to remove. @returns No value.
   */
  removeBlocks(ids: readonly string[]): void;
  /** Merges source content and children into the target.
   *
   * Merges a source block into a target.
   * @param targetId - Destination block identifier.
   * @param sourceId - Source block identifier.
   * @returns Resulting caret offset in the target.
   */
  mergeBlocks(targetId: string, sourceId: string): number;
  /** Moves one block relative to a target.
   *
   * Moves one block relative to a destination.
   * @param id - Block identifier to move.
   * @param targetId - Destination block, or null for the list start.
   * @param position - Relationship to the destination.
   * @returns No value.
   */
  moveBlock(id: string, targetId: string | null, position?: "before" | "after" | "inside"): void;
  /** Moves several block roots as one group.
   *
   * Moves several block roots relative to one destination.
   * @param ids - Ordered block roots to move.
   * @param targetId - Destination block, or null for the list start.
   * @param position - Relationship to the destination.
   * @returns No value.
   */
  moveBlocks(ids: readonly string[], targetId: string | null, position?: "before" | "after" | "inside"): void;
  /** Indents one block when eligible.
   *
   * @param id - Block identifier to indent. @returns No value.
   */
  indentBlock(id: string): void;
  /** Indents a block range when eligible.
   *
   * @param ids - Ordered block roots to indent. @returns No value.
   */
  indentBlocks(ids: readonly string[]): void;
  /** Outdents one block when eligible.
   *
   * @param id - Block identifier to outdent. @returns No value.
   */
  outdentBlock(id: string): void;
  /** Outdents a block range when eligible.
   *
   * @param ids - Ordered block roots to outdent. @returns No value.
   */
  outdentBlocks(ids: readonly string[]): void;
  /** Sets one opaque block property.
   *
   * Sets or removes one native block property.
   * @param id - Block identifier.
   * @param key - Native property name.
   * @param value - Portable value, or undefined to remove it.
   * @returns No value.
   */
  setBlockProp(id: string, key: string, value: unknown): void;
  /** Sets namespaced block plugin data.
   *
   * Sets or removes one namespaced block plugin value.
   * @param id - Block identifier.
   * @param pluginId - Stable plugin namespace.
   * @param value - Portable value, or undefined to remove it.
   * @returns No value.
   */
  setBlockPluginData(id: string, pluginId: string, value: unknown): void;
}
