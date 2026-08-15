import { YjsDoc } from '../yjs-doc';
import * as Y from 'yjs';
import { Provider } from '../../types';
import { YjsArray, YjsMap, YjsText } from '../structures';
import { YjsInstantiator } from '../utils/instantiator';

describe('YjsDoc', () => {
  let yjsDoc: YjsDoc;
  const docId = 'test-doc-id';

  beforeEach(() => {
    // Instantiate YjsDoc
    yjsDoc = new YjsDoc(docId);
  });

  afterEach(() => {
    yjsDoc.destroy();
  });

  it('should initialize with correct ID', () => {
    expect(yjsDoc.id).toBe(docId);
  });

  it('should expose instantiator', () => {
    expect(yjsDoc.instantiator).toBeInstanceOf(YjsInstantiator);
  });

  it('should use provided Y.Doc if passed in constructor', () => {
    const customDoc = new Y.Doc();
    const doc = new YjsDoc(docId, customDoc);
    // @ts-ignore - accessing private property for test
    expect(doc['doc']).toBe(customDoc);
    doc.destroy();
  });

  describe('Provider management', () => {
    const mockProvider: Provider = {
      id: 'provider-1',
      connect: jest.fn(),
      disconnect: jest.fn(),
    };

    it('attachProvider should store provider, connect, and return cleanup', async () => {
      const cleanup = await yjsDoc.attachProvider(mockProvider);
      
      expect(mockProvider.connect).toHaveBeenCalledWith(yjsDoc);
      await cleanup();
      expect(mockProvider.disconnect).toHaveBeenCalledWith(yjsDoc);

      // Cleanup belongs to one exact attachment and is safe to call again.
      await expect(cleanup()).resolves.toBeUndefined();
    });

    it('detachProvider should infer the provider when exactly one is attached', async () => {
      await yjsDoc.attachProvider(mockProvider);
      await yjsDoc.detachProvider();
      
      expect(mockProvider.disconnect).toHaveBeenCalledWith(yjsDoc);
      await expect(yjsDoc.detachProvider()).rejects.toThrow();
    });

    it('detachProvider should select one of multiple providers by ID', async () => {
      const otherProvider: Provider = {
        id: 'provider-2',
        connect: jest.fn(),
        disconnect: jest.fn(),
      };
      await yjsDoc.attachProvider(mockProvider);
      await yjsDoc.attachProvider(otherProvider);

      await expect(yjsDoc.detachProvider()).rejects.toThrow('multiple items');
      await yjsDoc.detachProvider(mockProvider.id);

      expect(mockProvider.disconnect).toHaveBeenCalledWith(yjsDoc);
      expect(otherProvider.disconnect).not.toHaveBeenCalled();
      await yjsDoc.detachProvider(otherProvider.id);
    });

    it('attachProvider should reject duplicate IDs', async () => {
      const duplicateProvider: Provider = {
        id: mockProvider.id,
        connect: jest.fn(),
        disconnect: jest.fn(),
      };
      await yjsDoc.attachProvider(mockProvider);

      await expect(yjsDoc.attachProvider(duplicateProvider)).rejects.toThrow('already attached');
      expect(duplicateProvider.connect).not.toHaveBeenCalled();
    });

    it('attachProvider should release the ID when connecting fails', async () => {
      const error = new Error('connect failed');
      const failingProvider: Provider = {
        id: 'failing-provider',
        connect: jest.fn().mockRejectedValue(error),
        disconnect: jest.fn(),
      };
      const replacementProvider: Provider = {
        id: failingProvider.id,
        connect: jest.fn(),
        disconnect: jest.fn(),
      };

      await expect(yjsDoc.attachProvider(failingProvider)).rejects.toBe(error);
      await expect(yjsDoc.attachProvider(replacementProvider)).resolves.toEqual(expect.any(Function));
    });
  });

  describe('Data structure access', () => {
    it('getArray should return YjsArray', () => {
      const array = yjsDoc.getArray('test-array');
      expect(array).toBeInstanceOf(YjsArray);
      // Verify it's connected to the underlying doc
      // push takes ...items, so push('item') appends 'item'.
      array.push('item');
      
      // Verify with raw Y.Doc
      // @ts-ignore
      const rawArray = yjsDoc['doc'].getArray('test-array');
      expect(rawArray.get(0)).toBe('item');
    });

    it('getMap should return YjsMap', () => {
      const map = yjsDoc.getMap('test-map');
      expect(map).toBeInstanceOf(YjsMap);
      
      map.set('key', 'value');
      
      // Verify with raw Y.Doc
      // @ts-ignore
      const rawMap = yjsDoc['doc'].getMap('test-map');
      expect(rawMap.get('key')).toBe('value');
    });

    it('getText should return YjsText', () => {
      const text = yjsDoc.getText('test-text');
      expect(text).toBeInstanceOf(YjsText);
      
      text.insert(0, 'hello');
      
      // Verify with raw Y.Doc
      // @ts-ignore
      const rawText = yjsDoc['doc'].getText('test-text');
      expect(rawText.toString()).toBe('hello');
    });
  });

  describe('Transactions', () => {
    it('transact should execute transaction', () => {
      const callback = jest.fn();
      yjsDoc.transact(callback);
      expect(callback).toHaveBeenCalled();
    });

    it('transact should batch updates', () => {
      let eventCount = 0;
      yjsDoc.on('update', () => {
        eventCount++;
      });

      yjsDoc.transact(() => {
        yjsDoc.getMap('map').set('a', 1);
        yjsDoc.getMap('map').set('b', 2);
      });

      // YJS emits one update event per transaction
      expect(eventCount).toBe(1);
    });
  });

  describe('Events', () => {
    it('on should register handler and return unsubscribe function', () => {
      const handler = jest.fn();
      const event = 'update';
      
      const unsubscribe = yjsDoc.on(event, handler);
      
      // Trigger an update
      yjsDoc.getMap('map').set('key', 'value');
      
      expect(handler).toHaveBeenCalled();
      
      const callCount = handler.mock.calls.length;
      
      unsubscribe();
      
      // Trigger another update
      yjsDoc.getMap('map').set('key', 'value2');
      
      expect(handler).toHaveBeenCalledTimes(callCount);
    });
  });

  describe('Lifecycle', () => {
    it('destroy should clean up resources', () => {
      // We can't easily check internal state of Y.Doc after destroy without mocking,
      // but we can ensure it doesn't throw
      yjsDoc.destroy();
    });
  });
  describe('Snapshot', () => {
    beforeEach(() => {
      yjsDoc.getMap('map').set('key', 'value');
    });
    it('getSnapshot should return snapshot', () => {
      const snapshot = yjsDoc.getSnapshot();
      expect(snapshot).toBeDefined();
    });
    it('applySnapshot should apply snapshot', () => {
      const snapshot = yjsDoc.getSnapshot();
      yjsDoc.applySnapshot(snapshot);
      expect(yjsDoc.getMap('map').get('key')).toBe('value');
    });
  });
  describe('Serialization', () => {
    it('toJSON should serialize shared types to plain object', () => {
      const root = yjsDoc.getMap('root') as YjsMap;
      root.set('title', 'Hello');
      root.set('count', 2);

      const items = yjsDoc.instantiator.createArray();
      items.push('first');
      root.set('items', items);

      const json = yjsDoc.toJSON();
      expect(json).toEqual({
        root: {
          title: 'Hello',
          count: 2,
          items: ['first'],
        },
      });
    });

    it('fromJSON should restore document state', () => {
      const mapRoot = new Map<string, any>([
        ['title', 'FromMapRoot'],
        ['numbers', [1, 2]],
        ['innerMap', new Map<string, any>([['enabled', true]])],
      ]);

      const payload = {
        root: {
          title: 'Restored',
          items: ['a', 'b'],
          nested: { done: true, count: 5 },
        },
        mapRoot,
        arrayRoot: [{ deep: ['x', { nested: 'obj' }] }, 'tail'],
      };

      yjsDoc.fromJSON(payload, { string2crdttext: false });

      const root = yjsDoc.getMap('root') as YjsMap;
      const title = root.get('title');
      expect(title).toBe('Restored');

      const items = root.get('items') as YjsArray;
      expect(items.length).toBe(2);
      expect(items.get(0)).toBe('a');

      const nested = root.get('nested') as YjsMap;
      expect(nested.get('done')).toBe(true);
      expect(nested.get('count')).toBe(5);

      const restoredMapRoot = yjsDoc.getMap('mapRoot') as YjsMap;
      expect(restoredMapRoot.get('title')).toBe('FromMapRoot');
      const restoredNumbers = restoredMapRoot.get('numbers') as YjsArray;
      expect(restoredNumbers.toArray()).toEqual([1, 2]);
      const inner = restoredMapRoot.get('innerMap') as YjsMap;
      expect(inner.get('enabled')).toBe(true);

      const restoredArrayRoot = yjsDoc.getArray('arrayRoot') as YjsArray;
      expect(restoredArrayRoot.length).toBe(2);
      const firstEntry = restoredArrayRoot.get(0) as YjsMap;
      expect((firstEntry.get('deep') as YjsArray).get(0)).toEqual('x');
      expect(((firstEntry.get('deep') as YjsArray).get(1) as YjsMap).toObject()).toEqual({ nested: 'obj' });
      expect(restoredArrayRoot.get(1)).toBe('tail');
    });
  });

  describe('Nested structures via CRDTInstantiator', () => {
    let rootMap: YjsMap;

    beforeEach(() => {
      rootMap = yjsDoc.getMap('root') as YjsMap;
    });

    it('should support Map inside Map', () => {
      const nestedMap = yjsDoc.instantiator.createMap();
      rootMap.set('nested', nestedMap);

      // Verify via retrieval
      const retrieved = rootMap.get('nested') as YjsMap;
      expect(retrieved).toBeInstanceOf(YjsMap);

      const crdtmap = yjsDoc.instantiator.createMap();
      const crdtarray = yjsDoc.instantiator.createArray();
      const crdttext = yjsDoc.instantiator.createText();
      const text = 'hello';
      const number = 1;
      const boolean = true;
      const nullValue = null;
      const array = [1, 2, { nested: { inner: 1 } }];
      const object = { key: 'value', nested: { inner: 1 } };
      const undefinedValue = undefined;
      const functionValue = () => {};
      
      retrieved.set('crdtmap', crdtmap);
      retrieved.set('crdtarray', crdtarray);
      retrieved.set('crdttext', crdttext);
      retrieved.set('text', text);
      retrieved.set('number', number);
      retrieved.set('boolean', boolean);
      retrieved.set('nullValue', nullValue);
      retrieved.set('array', array);
      retrieved.set('object', object);
      // @ts-ignore
      expect(() => retrieved.set('undefinedValue', undefinedValue)).toThrow();
      // @ts-ignore
      expect(() => retrieved.set('functionValue', functionValue)).toThrow();
      
      // must successfuly serialize the nested structures
      retrieved.toJSON();
      expect(retrieved.get('crdtmap')).toBeInstanceOf(YjsMap);
      expect(retrieved.get('crdtarray')).toBeInstanceOf(YjsArray);
      expect(retrieved.get('crdttext')).toBeInstanceOf(YjsText);
      expect(retrieved.get('text')).toBe(text);
      expect(retrieved.get('number')).toBe(number);
      expect(retrieved.get('boolean')).toBe(boolean);
      expect(retrieved.get('nullValue')).toBe(nullValue);
      expect(retrieved.get('array')).toBe(array);
      expect(retrieved.get('object')).toBe(object);

      // Modify nested map
      (retrieved as YjsMap).set('key', 'value');
      
      // Verify via original reference (should be same underlying Y.Map)
      expect((nestedMap as YjsMap).get('key')).toBe('value');

    });

    it('should support Array inside Map', () => {
      const nestedArray = yjsDoc.instantiator.createArray();
      rootMap.set('list', nestedArray);

      const retrieved = rootMap.get('list');
      expect(retrieved).toBeInstanceOf(YjsArray);

      (retrieved as YjsArray).push('item');
      expect((nestedArray as YjsArray).get(0)).toBe('item');
    });

    it('should support Text inside Map', () => {
      const nestedText = yjsDoc.instantiator.createText();
      rootMap.set('content', nestedText);

      const retrieved = rootMap.get('content');
      expect(retrieved).toBeInstanceOf(YjsText);

      (retrieved as YjsText).insert(0, 'hello');
      expect((nestedText as YjsText).toString()).toBe('hello');
    });

    it('should support complex nesting', () => {
      // Map -> Array -> Map -> Text
      const array = yjsDoc.instantiator.createArray();
      rootMap.set('array', array);

      const mapInArray = yjsDoc.instantiator.createMap();
      (array as YjsArray).push(mapInArray);

      const textInMap = yjsDoc.instantiator.createText();
      (mapInArray as YjsMap).set('text', textInMap);

      // Verify structure
      const retrievedArray = rootMap.get('array') as YjsArray;
      const retrievedMap = retrievedArray.get(0) as YjsMap;
      const retrievedText = retrievedMap.get('text') as YjsText;

      retrievedText.insert(0, 'deeply nested');
      
      expect((textInMap as YjsText).toString()).toBe('deeply nested');
    });

    it('should support setting pre-populated structures', () => {
      const array = yjsDoc.instantiator.createArray();
      array.push('pre-existing');
      
      rootMap.set('populated-array', array);
      
      const retrieved = rootMap.get('populated-array') as YjsArray;
      expect(retrieved.get(0)).toBe('pre-existing');
      expect(retrieved.length).toBe(1);
    });

    it('should handle overwriting existing keys with new instances', () => {
      const map1 = yjsDoc.instantiator.createMap();
      map1.set('id', '1');
      rootMap.set('child', map1);

      expect((rootMap.get('child') as YjsMap).get('id')).toBe('1');

      const map2 = yjsDoc.instantiator.createMap();
      map2.set('id', '2');
      rootMap.set('child', map2);

      expect((rootMap.get('child') as YjsMap).get('id')).toBe('2');
    });
  });
});
