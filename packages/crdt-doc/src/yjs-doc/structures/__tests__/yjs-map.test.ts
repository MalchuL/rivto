import * as Y from 'yjs';
import { YjsMap as YjsMapClass } from '../map';
import { YjsArray } from '../array';
import { YjsText } from '../text';
import { wrapBasicTypeToCRDTType } from '../utils';
import { isDeepPlainRecord } from '../utils/plain-check';



class YjsMap extends YjsMapClass {
    public get yjsObjPublic(): Y.Map<any> {
        return this.yjsObj;
    }
    public get docPublic(): Y.Doc | null {
        return this.doc;
    }
}


describe('YjsMap wrapper', () => {
    let doc: Y.Doc;
    let yMap: Y.Map<any>;
    let wrapper: YjsMap;

    describe("When attached to a document", () => {
        beforeEach(() => {
            doc = new Y.Doc();
            yMap = doc.getMap('test-map');
            wrapper = new YjsMap(yMap);
        });

        describe('when attached to Y.Doc', () => {
            test('is associated with the doc and updates propagate', () => {
                expect(wrapper.docPublic).toBe(doc);

                expect(wrapper.set('key', 'value')).toBe(wrapper);
                expect(doc.getMap('test-map').get('key')).toBe('value');

                expect(wrapper.delete('key')).toBe(undefined);
                expect(doc.getMap('test-map').has('key')).toBe(false);
            });
        });

        test('handles basic set and get operations', () => {
            expect(wrapper.set('key1', 'value1')).toBe(wrapper);
            expect(wrapper.get('key1')).toBe('value1');
            expect(wrapper.has('key1')).toBe(true);
            expect(wrapper.length).toBe(1);

            expect(wrapper.set('key2', 123)).toBe(wrapper);
            expect(wrapper.get('key2')).toBe(123);
            expect(wrapper.length).toBe(2);
        });

        test('handles delete and clear operations', () => {
            wrapper.set('key1', 'value1');
            wrapper.set('key2', 'value2');

            expect(wrapper.delete('key1')).toBe(undefined);
            expect(wrapper.has('key1')).toBe(false);
            expect(wrapper.get('key1')).toBeUndefined();
            expect(wrapper.length).toBe(1);

            wrapper.clear();
            expect(wrapper.length).toBe(0);
            expect(wrapper.has('key2')).toBe(false);
        });

        test('lists keys, values, and entries', () => {
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

        test('handles nested YjsMap', () => {
            const nestedMap = new YjsMap();
            expect(nestedMap.set('nestedKey', 'nestedValue')).toBe(nestedMap);

            expect(wrapper.set('subMap', nestedMap)).toBe(wrapper);

            // Inside nested map, we get the YjsMapClass instance.
            const retrieved = wrapper.get('subMap') as YjsMapClass;
            expect(retrieved).toBeInstanceOf(YjsMapClass);
            expect((retrieved as YjsMapClass).get('nestedKey')).toBe('nestedValue');

            // Outside nested map, we get the Y.Map instance.
            const retrievedYMap = (retrieved as any).yjsObj;
            expect(retrievedYMap.doc).toBe(doc);
        });

        test('handles nested YjsArray inside Map', () => {
            const nestedArray = new YjsArray();
            expect(nestedArray.push('item1')).toBe(undefined);

            expect(wrapper.set('subArray', nestedArray)).toBe(wrapper);

            const retrieved = wrapper.get('subArray');
            expect(retrieved).toBeInstanceOf(YjsArray);
            expect((retrieved as YjsArray).get(0)).toBe('item1');
            expect((retrieved as YjsArray).length).toBe(1);
        });

        test('toJSON and toObject', () => {
            wrapper.set('str', 'hello');
            wrapper.set('num', 42);

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

    describe("When detached (no doc)", () => {
        beforeEach(() => {
            doc = new Y.Doc();
            wrapper = new YjsMap(doc.getMap('test-map'));
        });

        test('set/delete/clear work without doc; getters throw until attached; values survive attach', () => {
            const detached = new YjsMap();
            expect(detached.docPublic).toBeNull();

            expect(detached.set('a', 1)).toBe(detached);
            expect(detached.set('b', 'two')).toBe(detached);
            // Attempting to get a value when detached should throw error
            expect(() => detached.get('a')).toThrow();
            expect(() => detached.length).toThrow();

            expect(detached.delete('a')).toBe(undefined);
            expect(() => detached.has('a')).toThrow();
            expect(() => detached.length).toThrow();

            detached.clear();
            expect(() => detached.length).toThrow();

            // Still can set values while detached
            expect(() => detached.set('foo', 'bar')).not.toThrow();
            expect(() => detached.set('count', 3)).not.toThrow();

            // Attach later to a doc and verify values survive
            const attachDoc = new Y.Doc();
            const attachMap = new YjsMap(attachDoc.getMap('attach'));
            attachMap.set('detached', detached);
            const stored = attachMap.get('detached') as YjsMapClass;
            expect(stored.toJSON()).toEqual({ foo: 'bar', count: 3 });
            expect(stored.get('foo')).toBe('bar');
            expect(stored.get('count')).toBe(3);
        });
        test('Created nested strucures before attaching to document', () => {
            const nestedMap = new YjsMap();
            nestedMap.set('nestedKey', 'nestedValue');
            const nestedArray = new YjsArray();
            nestedArray.push('item1');
            nestedMap.set('subArray', nestedArray);
            expect(() => nestedArray.length).toThrow();
            wrapper.set('subMap', nestedMap);
            // @ts-ignore
            expect(wrapper.get('subMap').get('nestedKey')).toBe('nestedValue');
            // @ts-ignore
            expect(wrapper.get('subMap').get('subArray').length).toBe(1);
            expect(nestedArray.length).toBe(1);
        });
        test('Storing plain objects and arrays', () => {
            const plainObject = { foo: 'bar', count: 3 };
            const plainArray = [1, 2, 3];
            wrapper.set('plainObject', plainObject);
            wrapper.set('plainArray', plainArray);
            expect(wrapper.get('plainObject')).toEqual(plainObject);
            expect(wrapper.get('plainArray')).toEqual(plainArray);
        });

        test('Restoring complex structures', () => {
            const complexObject = { foo: 'bar', count: 3, nested: { foo: 'bar', count: 3 } };
            const complexArray = [1, 2, 3, { foo: 'bar', count: 3 }];
            wrapper.set('complexObject', complexObject);
            wrapper.set('complexArray', complexArray);
            wrapper.toJSON()
            expect(() => wrapper.set('complexObject', { foo: 'bar', count: 3, nested: { foo: 'bar', count: 3, map: new Map<string, any>() } })).toThrow();
        });

        test("Complex structures is converted to plain objects and arrays", () => {
            const complexArray = [1, 2, 3, { foo: 'bar', count: 3 }];
            const complexObject = { foo: 'bar', count: 3, nested: { foo: 'bar', count: 3, complexArray } };

            const convertedComplexObject = wrapBasicTypeToCRDTType(complexObject, { array2crdtarray: false });
            wrapper.set('complexObject', convertedComplexObject);
            expect((convertedComplexObject as YjsMapClass).get("foo")).toBeInstanceOf(YjsText);
            expect((convertedComplexObject as YjsMapClass).get("count")).toBe(3);
            // @ts-ignore
            expect((convertedComplexObject as YjsMapClass).get("nested").get("foo")).toBeInstanceOf(YjsText);
            // @ts-ignore
            expect(convertedComplexObject.get("nested").get("complexArray")).toEqual(complexArray);
            // @ts-ignore
            expect(convertedComplexObject.get("nested").get("complexArray")).not.toBeInstanceOf(YjsArray);
            // @ts-ignore
            expect(isDeepPlainRecord(convertedComplexObject.get("nested").get("complexArray"))).toBe(true);
        });
    });
});
