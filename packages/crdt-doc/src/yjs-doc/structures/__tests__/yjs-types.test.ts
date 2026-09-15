import * as Y from 'yjs';
import { YjsMap } from '../map';
import { YjsArray } from '../array';
import { YjsText } from '../text';

describe('Yjs Types Wrapper Tests', () => {
    let doc: Y.Doc;

    beforeEach(() => {
        doc = new Y.Doc();
    });

    describe('YjsMap', () => {
        let yMap: Y.Map<any>;
        let wrapper: YjsMap;

        beforeEach(() => {
            yMap = doc.getMap('test-map');
            wrapper = new YjsMap(yMap);
        });

        test('should handle basic set and get operations', () => {
            wrapper.set('key1', 'value1');
            expect(wrapper.get('key1')).toBe('value1');
            expect(wrapper.has('key1')).toBe(true);
            expect(wrapper.length).toBe(1);

            wrapper.set('key2', 123);
            expect(wrapper.get('key2')).toBe(123);
            expect(wrapper.length).toBe(2);
        });

        test('should handle delete and clear operations', () => {
            wrapper.set('key1', 'value1');
            wrapper.set('key2', 'value2');

            wrapper.delete('key1');
            expect(wrapper.has('key1')).toBe(false);
            expect(wrapper.get('key1')).toBeUndefined();
            expect(wrapper.length).toBe(1);

            wrapper.clear();
            expect(wrapper.length).toBe(0);
            expect(wrapper.has('key2')).toBe(false);
        });

        test('should list keys, values, and entries', () => {
            wrapper.set('a', 1);
            wrapper.set('b', 2);

            const keys = Array.from(wrapper.keys());
            expect(keys).toContain('a');
            expect(keys).toContain('b');
            expect(keys.length).toBe(2);

            const values = Array.from(wrapper.values());
            expect(values).toContain(1);
            expect(values).toContain(2);
            expect(values.length).toBe(2);

            const entries = Array.from(wrapper.entries());
            expect(entries).toHaveLength(2);
            const entryMap = new Map(entries);
            expect(entryMap.get('a')).toBe(1);
            expect(entryMap.get('b')).toBe(2);
        });

        test('should handle nested YjsMap', () => {
            const nestedMap = new YjsMap();
            // We need to insert the nested map's underlying Y type or the wrapper itself depending on implementation.
            // Looking at wrap.ts unwrap(), if we pass YjsMap, it returns yMap.
            // And map.ts set() calls unwrap(). So we can pass YjsMap.
            
            // Pre-populate nested map to verify it persists
            nestedMap.set('nestedKey', 'nestedValue');
            
            wrapper.set('subMap', nestedMap);
            
            const retrieved = wrapper.get('subMap');
            expect(retrieved).toBeInstanceOf(YjsMap);
            expect((retrieved as YjsMap).get('nestedKey')).toBe('nestedValue');
            
            // Verify it is indeed connected to the doc
            const retrievedYMap = (retrieved as any).yjsObj;
            expect(retrievedYMap.doc).toBe(doc);
        });

        test('should handle nested YjsArray inside Map', () => {
            const nestedArray = new YjsArray();
            nestedArray.push('item1');
            
            wrapper.set('subArray', nestedArray);
            
            const retrieved = wrapper.get('subArray');
            expect(retrieved).toBeInstanceOf(YjsArray);
            expect((retrieved as YjsArray).get(0)).toBe('item1');
            expect((retrieved as YjsArray).length).toBe(1);
        });

        test('toJSON and toObject', () => {
            wrapper.set('str', 'hello');
            wrapper.set('num', 42);
            
            // Nested structures for JSON test
            const nested = new YjsMap();
            nested.set('inner', 'world');
            wrapper.set('nested', nested);

            const obj = wrapper.toObject();
            expect(obj).toEqual({
                str: 'hello',
                num: 42,
                nested: { inner: 'world' }
            });

            const json = wrapper.toJSON();
            expect(json).toEqual({
                str: 'hello',
                num: 42,
                nested: { inner: 'world' }
            });
        });
        
        test('forEach iteration', () => {
             wrapper.set('a', 1);
             wrapper.set('b', 2);
             
             const result = new Map<string, any>();
             wrapper.forEach((val, key) => {
                 result.set(key, val);
             });
             
             expect(result.get('a')).toBe(1);
             expect(result.get('b')).toBe(2);
             expect(result.size).toBe(2);
        });
    });

    describe('YjsArray', () => {
        let yArray: Y.Array<any>;
        let wrapper: YjsArray;

        beforeEach(() => {
            yArray = doc.getArray('test-array');
            wrapper = new YjsArray(yArray);
        });

        test('should handle basic push and get operations', () => {
            wrapper.push('item1', 'item2');
            expect(wrapper.length).toBe(2);
            expect(wrapper.get(0)).toBe('item1');
            expect(wrapper.get(1)).toBe('item2');
        });

        test('should handle insert and delete operations', () => {
            wrapper.push('A', 'C');
            wrapper.insert(1, 'B'); // A, B, C
            
            expect(wrapper.get(0)).toBe('A');
            expect(wrapper.get(1)).toBe('B');
            expect(wrapper.get(2)).toBe('C');
            expect(wrapper.length).toBe(3);

            wrapper.delete(1, 1); // Remove B -> A, C
            expect(wrapper.get(1)).toBe('C');
            expect(wrapper.length).toBe(2);
        });

        test('should handle nested YjsMap inside Array', () => {
            const nestedMap = new YjsMap();
            nestedMap.set('key', 'val');
            
            wrapper.push(nestedMap);
            
            const retrieved = wrapper.get(0);
            expect(retrieved).toBeInstanceOf(YjsMap);
            expect((retrieved as YjsMap).get('key')).toBe('val');
        });

        test('should handle nested YjsArray inside Array', () => {
            const nestedArray = new YjsArray();
            nestedArray.push(1, 2);
            
            wrapper.push(nestedArray);
            
            const retrieved = wrapper.get(0);
            expect(retrieved).toBeInstanceOf(YjsArray);
            expect((retrieved as YjsArray).length).toBe(2);
            expect((retrieved as YjsArray).get(1)).toBe(2);
        });

        test('toJSON and toArray', () => {
            wrapper.push('a', 1);
            const nested = new YjsArray();
            nested.push('inner');
            wrapper.push(nested);

            const arr = wrapper.toArray();
            expect(arr).toEqual(['a', 1, ['inner']]);

            const json = wrapper.toJSON();
            expect(json).toEqual(['a', 1, ['inner']]);
        });
    });

    describe('YjsText', () => {
        let yText: Y.Text;
        let wrapper: YjsText;

        beforeEach(() => {
            yText = doc.getText('test-text');
            wrapper = new YjsText(yText);
        });

        test('should handle insert and delete', () => {
            wrapper.insert(0, 'Hello');
            expect(wrapper.toString()).toBe('Hello');
            expect(wrapper.length).toBe(5);

            wrapper.insert(5, ' World');
            expect(wrapper.toString()).toBe('Hello World');

            wrapper.delete(5, 6); // Delete " World"
            expect(wrapper.toString()).toBe('Hello');
        });

        test('toJSON should return string', () => {
            wrapper.insert(0, 'test content');
            expect(wrapper.toJSON()).toBe('test content');
        });
    });
});

