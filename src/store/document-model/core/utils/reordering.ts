import { BlockCore } from '../../types/block-core';
import { ID } from '../../types/id';

/**
 * Utility class to keep block orders contiguous (0..N).
 * `afterId` semantics:
 * - `null`   -> place at the beginning (order 0)
 * - `id`     -> place right after the given block
 * - `undefined` -> append to the end (used by insert)
 */
export class OrderingStrategy {

    private sort(blocks: BlockCore[]): BlockCore[] {
        return [...blocks].sort((a, b) => {
            const aOrder = a.order!;
            const bOrder = b.order!;
            return aOrder - bOrder;
        });
    }

    private resolveInsertIndex(sortedBlocks: BlockCore[], afterId: ID | null): number {
        if (afterId === null) {
            return 0;
        }
        const index = sortedBlocks.findIndex((block) => block.id === afterId);
        if (index === -1) {
            throw new Error(`Block with id ${afterId} not found`);
        }
        return index + 1;
    }

    private reindex(blocks: BlockCore[]): void {
        blocks.forEach((block, index) => {
            block.order = index;
        });
    }

    /**
     * Inserts a block into the list.
     * @param blocks - The list of blocks.
     * @param blockToInsert - The block to insert.
     * @param afterId - The id of the block to insert after. 
     * If null, the block will be inserted at the beginning. 
     * If undefined, the block will be appended to the end.
     */
    insert(blocks: BlockCore[], blockToInsert: BlockCore, afterId?: ID | null): void {
        const ordered = this.sort(blocks);
        if (afterId === undefined) {
            // If afterId is undefined, append to the end
            const insertIndex = ordered.length;
            blockToInsert.order = insertIndex;
            return;
        }
        const insertIndex = this.resolveInsertIndex(ordered, afterId);
        ordered.splice(insertIndex, 0, blockToInsert);
        this.reindex(ordered);
    }

    move(blocks: BlockCore[], blockId: ID, afterId: ID | null): void {
        const ordered = this.sort(blocks);
        const currentIndex = ordered.findIndex((block) => block.id === blockId);
        if (currentIndex === -1) {
            throw new Error(`Block with id ${blockId} not found`);
        }

        const [blockToMove] = ordered.splice(currentIndex, 1);
        const insertIndex = this.resolveInsertIndex(ordered, afterId);
        ordered.splice(insertIndex, 0, blockToMove);
        this.reindex(ordered);
    }
    /**
     * Change order property of a block that looks like item is removed.
     * Example:
     * [{id: 'a', order: 0},
     *  {id: 'b', order: 1},
     *  {id: 'c', order: 2}] -> 
     * [{id: 'a', order: 0},
     *  {id: 'c', order: 1}]
     * But actually list is and all items the same
     * [{id: 'a', order: 0}, 
     * {id: 'b', order: 1},
     * {id: 'c', order: 1}]  // Order not changed
     * @param blocks - The list of blocks.
     * @param blockId - The id of the block to remove.
     * @throws An error if the block is not found.
     */
    remove(blocks: BlockCore[], blockId: ID): void {
        const ordered = this.sort(blocks);
        const removeIndex = ordered.findIndex((block) => block.id === blockId);
        if (removeIndex === -1) {
            throw new Error(`Block with id ${blockId} not found`);
        }
        ordered.splice(removeIndex, 1);
        this.reindex(ordered);
    }
}