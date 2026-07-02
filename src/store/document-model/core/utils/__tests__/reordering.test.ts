import { OrderingStrategy } from '../reordering';
import type { BlockCore } from '../../../types/block-core';

const makeBlock = (id: string, order: number): BlockCore => ({
    id,
    type: 'test',
    order,
    meta: undefined,
    pluginStates: undefined,
});

const orderIds = (blocks: BlockCore[]): string[] =>
    [...blocks].sort((a, b) => (a.order! - b.order!)).map((b) => b.id);

describe('OrderingStrategy', () => {
    let strategy: OrderingStrategy;

    beforeEach(() => {
        strategy = new OrderingStrategy();
    });

    it('places a new block at the beginning when afterId is null', () => {
        const blocks = [makeBlock('a', 0), makeBlock('b', 1)];
        const newBlock = makeBlock('c', 99);

        strategy.insert(blocks, newBlock, null);

        expect(orderIds([...blocks, newBlock])).toEqual(['c', 'a', 'b']);
        expect(newBlock.order).toBe(0);
        expect(blocks[0].order).toBe(1);
        expect(blocks[1].order).toBe(2);
    });

    it('inserts a block after the specified block id', () => {
        const blocks = [makeBlock('a', 0), makeBlock('b', 1), makeBlock('c', 2)];
        const newBlock = makeBlock('d', 99);

        strategy.insert(blocks, newBlock, 'a');

        expect(orderIds([...blocks, newBlock])).toEqual(['a', 'd', 'b', 'c']);
        expect(newBlock.order).toBe(1);
    });

    it('appends a block when afterId is undefined', () => {
        const blocks = [makeBlock('a', 0), makeBlock('b', 1)];
        const newBlock = makeBlock('c', 99);

        strategy.insert(blocks, newBlock);

        expect(newBlock.order).toBe(2);
        expect(orderIds([...blocks, newBlock])).toEqual(['a', 'b', 'c']);
        expect(blocks[0].order).toBe(0);
        expect(blocks[1].order).toBe(1);
    });

    it('moves a block to the beginning when afterId is null', () => {
        const blocks = [makeBlock('a', 0), makeBlock('b', 1), makeBlock('c', 2)];

        strategy.move(blocks, 'c', null);

        expect(orderIds(blocks)).toEqual(['c', 'a', 'b']);
        expect(blocks.find((b) => b.id === 'c')?.order).toBe(0);
    });

    it('moves a block after a specific block', () => {
        const blocks = [makeBlock('a', 0), makeBlock('b', 1), makeBlock('c', 2)];

        strategy.move(blocks, 'a', 'c');

        expect(orderIds(blocks)).toEqual(['b', 'c', 'a']);
        expect(blocks.find((b) => b.id === 'a')?.order).toBe(2);
    });

    it('removes a block and reindexes the remaining blocks', () => {
        const blocks = [makeBlock('a', 0), makeBlock('b', 1), makeBlock('c', 2)];

        strategy.remove(blocks, 'b');

        expect(orderIds(blocks)).toEqual(['a', 'b', 'c']);
        expect(blocks[0].order).toBe(0);
        expect(blocks[2].order).toBe(1);
    });

    it('throws when inserting after a non-existent id', () => {
        const blocks = [makeBlock('a', 0)];
        const newBlock = makeBlock('b', 99);

        expect(() => strategy.insert(blocks, newBlock, 'missing')).toThrow(/not found/);
    });

    it('throws when moving a non-existent block', () => {
        const blocks = [makeBlock('a', 0)];

        expect(() => strategy.move(blocks, 'missing', null)).toThrow(/not found/);
    });

    it('throws when removing a non-existent block', () => {
        const blocks = [makeBlock('a', 0)];

        expect(() => strategy.remove(blocks, 'missing')).toThrow(/not found/);
    });
});
