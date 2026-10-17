import type { EditorBlockInput, EditorBlockNode } from "@chulane/rivto";
import { DEFAULT_WRITING_BLOCK_TYPE } from "./extensions/built-ins/page/default-writing-block/constants";
import { createIsEmptyDefaultBlock } from "./extensions/built-ins/page/default-writing-block/utils";
import { SEPARATOR_BLOCK_TYPE } from "./extensions/built-ins/separator/constants";

/** Creates detached block inputs and recognizes a block role and its semantic emptiness. */
export interface BlockFactory {
  /**
   * Creates a fresh input without writing to a document or allocating a persisted ID.
   * @returns Detached creation fields, including any host-owned initial properties and children.
   */
  createEmptyBlock(): EditorBlockInput;
  /**
   * Recognizes a block represented by this factory without reading its descendants.
   * @param block - Persisted native type of the candidate block.
   * @returns Whether the candidate belongs to this factory's block role.
   */
  isBlock(block: Pick<EditorBlockNode, "type">): boolean;
  /**
   * Checks semantic emptiness without mutating the detached snapshot.
   * @param block - Current flat snapshot, including properties, plugin data, and child IDs.
   * @returns Whether the host considers this block empty; this does not imply permission to delete or reset it.
   */
  isEmptyBlock(block: EditorBlockNode): boolean;
}

/**
 * Creates a factory whose default emptiness policy checks native type and empty text.
 * Properties, plugin data, and children do not affect this default policy.
 * @param type - Persisted native type to create and recognize.
 * @returns Stateless factory returning a fresh input for each creation.
 */
export function createBlockFactory(type: string): BlockFactory {
  const isBlock = (block: Pick<EditorBlockNode, "type">): boolean => block.type === type;
  return {
    /** @inheritdoc BlockFactory.createEmptyBlock */
    createEmptyBlock: () => ({ type, content: "" }),
    /** @inheritdoc BlockFactory.isBlock */
    isBlock,
    /** @inheritdoc BlockFactory.isEmptyBlock */
    isEmptyBlock: createIsEmptyDefaultBlock(type),
  };
}

/** Pure built-in paragraph contract usable by seed builders without a React runtime. */
export const paragraphBlockFactory = createBlockFactory(DEFAULT_WRITING_BLOCK_TYPE);

/** Pure built-in separator contract usable by seed builders without a React runtime. */
export const separatorBlockFactory = createBlockFactory(SEPARATOR_BLOCK_TYPE);
