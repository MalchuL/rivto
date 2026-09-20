/**
 * React block facade combining guarded mutations and delegated core block
 * operations while consulting core-owned list-property policy.
 * Persisted state remains owned by the framework-neutral core manager.
 */
import type { BlocksCapability } from "../../capabilities";
import type {
  BlockManager as CoreBlockManager,
  EditorBlockInput,
  EditorBlockPatch,
  EditorBlockUpdate,
  RivtoEditorApi,
} from "@chulane/rivto";

/**
 * Delegates React block mutations to the validating core manager without
 * becoming another persisted block-data store.
 */
export class BlockManager implements BlocksCapability {
  /**
   * Creates the guarded block-operation facade.
   * @param editor - Core runtime providing block reads and mutations.
   */
  constructor(private readonly editor: RivtoEditorApi) {}

  /**
   * Delegates complete recursive creation preparation to the core block manager.
   *
   * @param input - Block forest to prepare without mutating the document.
   * @returns Recursively copied forest ready for a React block operation.
   * @throws {Error} When any definition, processor, or persisted value is invalid.
   */
  prepareInput(...args: Parameters<CoreBlockManager["prepareInput"]>): EditorBlockInput[] {
    return this.editor.blocks.prepareInput(...args);
  }

  /**
   * Inserts a recursively prepared and validated block through the core editor.
   *
   * @param input - Block subtree to receive active defaults and validation.
   * @param afterId - Sibling after which to insert, `null` for first position, or
   * omitted for the end of the root list.
   * @returns The complete persisted root block.
   * @throws {Error} When list properties are invalid or core insertion fails.
   */
  insertBlock(input: EditorBlockInput, afterId?: string | null): ReturnType<CoreBlockManager["insertBlock"]> {
    return this.editor.blocks.insertBlock(input, afterId);
  }

  /**
   * Applies one patch after core-owned list-property validation.
   *
   * @param id - Identifier of the block to update.
   * @param patch - Partial block fields to pass to the core manager.
   * @returns The lightweight persisted block identity.
   * @throws {Error} When the block is missing or the operation is invalid.
   */
  updateBlock(id: string, patch: EditorBlockPatch): ReturnType<CoreBlockManager["updateBlock"]> {
    return this.editor.blocks.updateBlock(id, patch);
  }

  /**
   * Applies an ordered patch batch through core validation.
   * @param updates - Ordered identified patches to validate and apply atomically.
   * @returns Lightweight persisted identities in input order.
   * @throws {Error} When any block is missing or any operation is invalid.
   */
  updateBlocks(updates: readonly EditorBlockUpdate[]): ReturnType<CoreBlockManager["updateBlocks"]> {
    return this.editor.blocks.updateBlocks(updates);
  }

  /**
   * Deletes selected list-property keys after validating the resulting record.
   *
   * @param id - Identifier of the block to modify.
   * @param keys - Property names to remove.
   * @returns Whether any persisted property was deleted.
   * @throws {Error} When the block is missing or the operation is invalid.
   */
  deleteListProps(id: string, keys: readonly string[]): boolean {
    return this.editor.blocks.deleteListProps(id, keys);
  }

  /**
   * Deletes list-property keys through core batch validation.
   * @param updates - Blocks and property names requested for deletion.
   * @returns No value after applying every deletion.
   * @throws {Error} When any block is missing or any operation is invalid.
   */
  deleteListPropsBatch(updates: readonly { id: string; keys: readonly string[] }[]): void {
    this.editor.blocks.deleteListPropsBatch(updates);
  }

  /** @returns Current core block revision. */
  get revision(): number { return this.editor.blocks.revision; }

  /** @param id - Block identifier. @returns Whether the block exists. */
  hasBlock(id: string): boolean { return this.editor.blocks.hasBlock(id); }

  /** @returns One detached block, when present. */
  getBlock(id: string): ReturnType<CoreBlockManager["getBlock"]> { return this.editor.blocks.getBlock(id); }

  /** @returns Detached non-recursive block fields, when present. */
  getBlockNode(id: string): ReturnType<CoreBlockManager["getBlockNode"]> { return this.editor.blocks.getBlockNode(id); }

  /** @returns The complete detached root forest. */
  getBlocks(): ReturnType<CoreBlockManager["getBlocks"]> { return this.editor.blocks.getBlocks(); }

  /** @returns Ordered root block identifiers. */
  getRootIds(): string[] { return this.editor.blocks.getRootIds(); }

  /** Subscribes to one recursive block snapshot. */
  subscribeBlock(id: string, listener: () => void): () => void { return this.editor.blocks.subscribeBlock(id, listener); }

  /** Subscribes to ordered root identifiers. */
  subscribeRootIds(listener: () => void): () => void { return this.editor.blocks.subscribeRootIds(listener); }

  /** Subscribes to hierarchy changes. */
  subscribeStructure(listener: () => void): () => void { return this.editor.blocks.subscribeStructure(listener); }

  /** @returns Direct child identifiers for a block. */
  getChildIds(id: string): string[] { return this.editor.blocks.getChildIds(id); }

  /** @returns True when the block has at least one child. */
  hasChildren(id: string): boolean { return this.editor.blocks.hasChildren(id); }

  /** @returns A block's parent, root marker, or missing marker. */
  getParentId(id: string): string | null | undefined { return this.editor.blocks.getParentId(id); }

  /** @returns True when the block exists and has no parent. */
  isRootBlock(id: string): boolean { return this.editor.blocks.isRootBlock(id); }

  /** Imports a detached block forest with collision remapping. */
  importForest(...args: Parameters<CoreBlockManager["importForest"]>): ReturnType<CoreBlockManager["importForest"]> {
    return this.editor.blocks.importForest(...args);
  }

  /** Clears one block while preserving its identity. */
  clearBlock(id: string): void { this.editor.blocks.clearBlock(id); }

  /** Converts one block to a registered type. */
  setBlockType(id: string, type: string): void { this.editor.blocks.setBlockType(id, type); }

  /** Removes one block subtree. */
  removeBlock(id: string): void { this.editor.blocks.removeBlock(id); }

  /** Removes several block subtrees atomically. */
  removeBlocks(ids: readonly string[]): void { this.editor.blocks.removeBlocks([...ids]); }

  /** Merges source content and children into the target. */
  mergeBlocks(targetId: string, sourceId: string): number { return this.editor.blocks.mergeBlocks(targetId, sourceId); }

  /** Moves one block relative to a target. */
  moveBlock(...args: Parameters<CoreBlockManager["moveBlock"]>): void { this.editor.blocks.moveBlock(...args); }

  /** Moves several block roots as one group. */
  moveBlocks(...args: Parameters<CoreBlockManager["moveBlocks"]>): void { this.editor.blocks.moveBlocks(...args); }

  /** Indents one block when eligible. */
  indentBlock(id: string): void { this.editor.blocks.indentBlock(id); }

  /** Indents a block range when eligible. */
  indentBlocks(ids: readonly string[]): void { this.editor.blocks.indentBlocks([...ids]); }

  /** Outdents one block when eligible. */
  outdentBlock(id: string): void { this.editor.blocks.outdentBlock(id); }

  /** Outdents a block range when eligible. */
  outdentBlocks(ids: readonly string[]): void { this.editor.blocks.outdentBlocks([...ids]); }

  /** Sets one opaque block property. */
  setBlockProp(id: string, key: string, value: unknown): void { this.editor.blocks.setBlockProp(id, key, value); }

  /** Sets namespaced block plugin data. */
  setBlockPluginData(id: string, pluginId: string, value: unknown): void {
    this.editor.blocks.setBlockPluginData(id, pluginId, value);
  }

}
