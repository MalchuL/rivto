import * as Y from 'yjs';
import { YjsArray } from '../array';
import { YjsMap } from '../map';
import { BasicType } from '../../../types';

describe('YjsArray wrapper', () => {
    let doc: Y.Doc;
    let yArray: Y.Array<any>;
    let wrapper: YjsArray;

    beforeEach(() => {
        doc = new Y.Doc();
        yArray = doc.getArray('test-array');
        wrapper = new YjsArray(yArray);
    });

    describe('when detached (no doc)', () => {
        test('insert/push/delete work without doc and values survive attach', () => {
            const detached = new YjsArray();
            // @ts-ignore
            expect(detached.yjsObj.doc).toBeNull();

            expect(detached.push('a')).toBe(undefined);
            detached.insert(1, 'b', 'c');
            expect(() => detached.length).toThrow();
            expect(() => detached.get(0)).toThrow();

            detached.delete(1, 1);
            expect(() => detached.length).toThrow();
            expect(() => detached.get(1)).toThrow();
            
            

            // Attach later to a doc and verify values survive
            const attachDoc = new Y.Doc();
            const attachMap = new YjsMap(attachDoc.getMap('attach'));
            attachMap.set('detachedArray', detached);

            // More ops while detached (should not throw)
            expect(() => detached.insert(0, 'x')).not.toThrow();
            expect(() => detached.push('y', { z: 3 })).not.toThrow();

            const stored = attachMap.get('detachedArray') as YjsArray;
            // @ts-ignore
            expect(stored.yjsObj.doc).toBe(attachDoc);
            expect(stored.toArray()).toEqual(['x', 'a', 'c', 'y', { z: 3 }]);
        });
    });

    describe('when attached to Y.Doc', () => {
        test('is associated with the doc and updates propagate', () => {
            // @ts-ignore
            expect(wrapper.yjsObj.doc).toBe(doc);

            expect(wrapper.push('hello')).toBe(undefined);
            expect(doc.getArray('test-array').get(0)).toBe('hello');

            wrapper.delete(0, 1);
            expect(doc.getArray('test-array').length).toBe(0);
        });
    });

    test('handles basic push and get operations', () => {
        expect(wrapper.push('item1', 'item2')).toBe(undefined);
        expect(wrapper.length).toBe(2);
        expect(wrapper.get(0)).toBe('item1');
        expect(wrapper.get(1)).toBe('item2');
    });

    test('handles insert and delete operations', () => {
        wrapper.push('A', 'C');
        wrapper.insert(1, 'B');

        expect(wrapper.get(0)).toBe('A');
        expect(wrapper.get(1)).toBe('B');
        expect(wrapper.get(2)).toBe('C');
        expect(wrapper.length).toBe(3);

        wrapper.delete(1, 1);
        expect(wrapper.get(1)).toBe('C');
        expect(wrapper.length).toBe(2);
    });

    test('handles nested YjsMap inside Array', () => {
        const nestedMap = new YjsMap();
        nestedMap.set('key', 'val');

        wrapper.push(nestedMap);

        const retrieved = wrapper.get(0);
        expect(retrieved).toBeInstanceOf(YjsMap);
        expect((retrieved as YjsMap).get('key')).toBe('val');

        const nestedBasicMap = new Map<string, BasicType>();
        nestedBasicMap.set('key', 'val');
        expect(() => wrapper.push(nestedBasicMap)).toThrow();
    });

    test("handles plain record inside Array", () => {
        const plainRecord: Record<string, BasicType> = {
            key: 'val',
            nested: {
                key: 'val',
                array: [1, 2, 3],
            },
        };
        // Must works fine
        wrapper.push(plainRecord)
        expect(wrapper.get(0)).toBe(plainRecord);
    });

    test("Throws error when pushing a Map inside Array", () => {
        const plainRecord: Record<string, BasicType> = {
            key: 'val',
            nested: {
                key: 'val',
                array: [1, 2, 3],
                map: new Map<string, BasicType>(),
            },
        };
        expect(() => wrapper.push(plainRecord)).toThrow();
    });

    test('handles nested YjsArray inside Array', () => {
        const nestedArray = new YjsArray();
        expect(nestedArray.push(1, 2)).toBe(undefined);

        expect(wrapper.push(nestedArray)).toBe(undefined);

        const retrieved = wrapper.get(0);
        expect(retrieved).toBeInstanceOf(YjsArray);
        expect((retrieved as YjsArray).length).toBe(2);
        expect((retrieved as YjsArray).get(1)).toBe(2);
    });

    test('toJSON and toArray', () => {
        expect(wrapper.push('a', 1)).toBe(undefined);
        const nested = new YjsArray();
        expect(nested.push('inner')).toBe(undefined);
        expect(wrapper.push(nested)).toBe(undefined);

        const arr = wrapper.toArray();
        expect(arr).toEqual(['a', 1, ['inner']]);

        const json = wrapper.toJSON();
        expect(json).toEqual(['a', 1, ['inner']]);
    });
});

