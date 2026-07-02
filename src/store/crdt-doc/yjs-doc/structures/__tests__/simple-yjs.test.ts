import * as Y from 'yjs';


describe('Y.Map test', () => {
    let doc: Y.Doc;
    let yMap: Y.Map<any>;
    let yArray: Y.Array<any>;
    let yText: Y.Text;
    describe('When Y.Map is detached (no doc)', () => {
        beforeEach(() => {
            doc = new Y.Doc();
            yMap = new Y.Map();
        });
        test('should create a new map', () => {
            const detached = new Y.Map();
            expect(detached).toBeInstanceOf(Y.Map);
        });

        test('should set a value in the map but it is undefined until attached to a doc', () => {
            const detached = yMap;
            const result = detached.set('key', 'value');
            // !NOTE untill item is attached to a doc, everything is undefined
            expect(detached.get('key')).toBe(undefined);
            
            // !NOTE after attaching to a doc, the item is defined
            doc.getMap('test-map').set('map', detached);
            const attached = detached;
            expect(attached.get('key')).toBe('value');
        });

        test("shouldn't have size until attached to a doc", () => {
            const detached = yMap;
            expect(detached.size).toBe(0);
            const result = detached.set('key', 'value');
            // !NOTE size is still 0 because the item is not attached to a doc
            expect(detached.size).toBe(0);
            doc.getMap('test-map').set('map', detached);
            // !NOTE size is now 1 because the item is attached to a doc
            const attached = detached;
            expect(attached.size).toBe(1);
        });

        test("shouldn't have keys until attached to a doc", () => {
            const detached = yMap;
            expect(Array.from(detached.keys())).toEqual([]);
            const result = detached.set('key', 'value');
            // !NOTE keys is still empty because the item is not attached to a doc
            expect(Array.from(detached.keys())).toEqual([]);
            doc.getMap('test-map').set('map', detached);
            const attached = detached;
            expect(Array.from(attached.keys())).toEqual(['key']);
        });

        test("shouldn't have values until attached to a doc", () => {
            const detached = yMap;
            expect(Array.from(detached.values())).toEqual([]);
            const result = detached.set('key', 'value');
            // !NOTE values is still empty because the item is not attached to a doc
            expect(Array.from(detached.values())).toEqual([]);
            doc.getMap('test-map').set('map', detached);
            const attached = detached;
            expect(Array.from(attached.values())).toEqual(['value']);
        });

        test("shouldn't have entries until attached to a doc", () => {
            
            const detached = yMap;
            expect(Array.from(detached.entries())).toEqual([]);
            const result = detached.set('key', 'value');
            // !NOTE entries is still empty because the item is not attached to a doc
            expect(Array.from(detached.entries())).toEqual([]);
            doc.getMap('test-map').set('map', detached);
            const attached = detached;
            expect(Array.from(attached.entries())).toEqual([['key', 'value']]);
        });

        test("shouldn't have has until attached to a doc", () => {
            const detached = yMap;
            expect(detached.has('key')).toBe(false);
            const result = detached.set('key', 'value');
            // !NOTE has is still false because the item is not attached to a doc
            expect(detached.has('key')).toBe(false);
            doc.getMap('test-map').set('map', detached);
            const attached = detached;
            expect(attached.has('key')).toBe(true);
        });

        test("shouldn't have delete until attached to a doc", () => {
            const detached = yMap;
            // Nothing happens, no error is thrown
            detached.delete('key')
            // Set a new key1
            const result = detached.set('key1', 'value1');
            // Delete the new key1
            detached.delete('key1')
            detached.set('key2', 'value2');
            doc.getMap('test-map').set('map', detached);
            const attached = detached;
            // !NOTE: key1 is deleted, key2 is still there, all operations are local until attached to a doc
            expect(attached.get('key1')).toBe(undefined);
            expect(attached.get('key2')).toBe('value2');

        });

        test("shouldn't have clear until attached to a doc", () => {
            const detached = yMap;
            // Set a new key
            detached.set('key1', 'value1');
            // Clear the map
            detached.clear();
            // Set a new key2
            detached.set('key2', 'value2');
            // Attach the map to a doc
            // Nothing happens, no error is thrown
            doc.getMap('test-map').set('map', detached);
            const attached = detached;
            expect(attached.get('key1')).toBe(undefined);
            expect(attached.get('key2')).toBe('value2');
        });

        test("shouldn't have forEach until attached to a doc", () => {
            const detached = yMap;
            // Set a new key
            detached.set('key1', 'value1');
            // Clear the map
            let count = 0;
            detached.forEach((value, key) => {
                expect(value).toBe('value1');
                expect(key).toBe('key1');
                count++;
            });
            expect(count).toBe(0);
            // Attach the map to a doc
            doc.getMap('test-map').set('map', detached);
            const attached = detached;
            expect(attached.get('key1')).toBe('value1');
        });

        test('supports storing plain objects and arrays', () => {
            const detached = yMap;
            const simpleObject = { foo: 'bar', nested: { count: 2 }, list: [1, 2] };
            const simpleArray = [{ id: 1 }, ['a', 'b']];

            detached.set('obj', simpleObject);
            detached.set('arr', simpleArray);

            doc.getMap('test-map').set('map', detached);
            const attached = detached;

            expect(attached.get('obj')).toEqual(simpleObject);
            expect(attached.get('arr')).toEqual(simpleArray);
        });
    });
    describe('When Y.Array is detached (no doc)', () => {
        beforeEach(() => {
            doc = new Y.Doc();
            yArray = new Y.Array();
        });
        test('should create a new array', () => {
            const detached = yArray;
            expect(detached).toBeInstanceOf(Y.Array);
        });
        test('should set a value in the array but it is undefined until attached to a doc', () => {
            const detached = yArray;
            const result = detached.push(['value1', 'value2']);
            // !NOTE untill item is attached to a doc, everything is undefined
            expect(detached.get(0)).toBe(undefined);
            const attached = detached;
            doc.getMap('test-array').set('array', attached);
            expect(attached.get(0)).toBe('value1');
            expect(attached.get(1)).toBe('value2');
        });
        test("shouldn't have length until attached to a doc", () => {
            const detached = yArray;
            expect(detached.length).toBe(0);
            const result = detached.push(['value1', 'value2']);
            expect(detached.length).toBe(0);
            doc.getMap('test-array').set('array', detached);
            const attached = detached;
            expect(attached.length).toBe(2);
        });
        test("shouldn't have insert until attached to a doc", () => {
            const detached = yArray;
            detached.insert(0, ['value2']);
            detached.insert(0, ['value1']);
            expect(detached.get(0)).toBe(undefined);
            doc.getMap('test-array').set('array', detached);
            const attached = detached;
            expect(attached.get(0)).toBe('value1');
            expect(attached.get(1)).toBe('value2');
            expect(attached.length).toBe(2);
        });
        test("shouldn't have delete until attached to a doc", () => {
            const detached = yArray;
            detached.delete(0, 1);
            expect(detached.get(0)).toBe(undefined);
            doc.getMap('test-array').set('array', detached);
            const attached = detached;
            expect(attached.get(0)).toBe(undefined);
            expect(attached.length).toBe(0);
        });

        test('supports storing plain objects and arrays', () => {
            const detached = yArray;
            const simpleObject = { foo: 'bar', nested: { count: 3 }, list: [1, 2, 3] };
            const simpleArray = ['a', { id: 2 }];

            detached.push([simpleObject, simpleArray]);

            doc.getMap('test-array').set('array', detached);
            const attached = detached;

            expect(attached.get(0)).toEqual(simpleObject);
            expect(attached.get(1)).toEqual(simpleArray);
            expect(attached.length).toBe(2);
            simpleArray[0] = 'b';
            expect(attached.get(1)[0]).toEqual('b');
            
        });

    });
    describe('When Y.Text is detached (no doc)', () => {

        beforeEach(() => {
            doc = new Y.Doc();
            yText = new Y.Text();
        });
        test('should create a new text', () => {
            const detached = yText;
            expect(detached).toBeInstanceOf(Y.Text);
        });

        test('should set a value in the text but it is undefined until attached to a doc', () => {
            const detached = yText;
            const result = detached.insert(0, 'value');
            // !NOTE untill item is attached to a doc, the text is empty
            expect(detached.toString()).toBe('');
            expect(detached.length).toBe(0);
            doc.getMap('test-text').set('text', detached);
            const attached = detached;
            expect(attached.toString()).toBe('value');
        });
        test("shouldn't have value until delete until attached to a doc", () => {
            const detached = yText;
            detached.insert(0, 'value');
            detached.delete(0, 1);
            expect(detached.toString()).toBe('');
            expect(detached.length).toBe(0);
            doc.getMap('test-text').set('text', detached);
            const attached = detached;
            // So operations are local until attached to a doc
            expect(attached.toString()).toBe('alue');
        });
        // test('should convert to JSON', () => {

        //     console.log(new Y.Text())
        //     console.log(new Y.Map())
        //     console.log(new Y.Array())
        // })

    });
    // beforeEach(() => {
    //     doc = new Y.Doc();
    //     yMap = doc.getMap('test-map');
    // });

    // test('should create a new map', () => {
    //     expect(yMap).toBeInstanceOf(Y.Map);
    // });

    // test('should set a value in the map', () => {
    //     const result = yMap.set('key', 'value');
    //     expect(result).toBe(undefined);
    //     expect(yMap.get('key')).toBe('value');
    // });

    // test('should get a value from the map', () => {
    //     yMap.set('key', 'value');
    //     expect(yMap.get('key')).toBe('value');
    // });

    // test('should delete a value from the map', () => {
    //     yMap.set('key', 'value');
    //     const result = yMap.delete('key');
    //     expect(result).toBe(true);
    //     expect(yMap.get('key')).toBeUndefined();
    // });

    // test('should clear the map', () => {
    //     yMap.set('key', 'value');
    //     yMap.clear();
    //     expect(yMap.get('key')).toBeUndefined();
    // });
});