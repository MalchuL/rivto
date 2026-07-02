import * as Y from 'yjs';

function sync(from: Y.Doc, to: Y.Doc): Uint8Array {
  const stateVector = Y.encodeStateVector(to);
  const update = Y.encodeStateAsUpdate(from, stateVector);
  Y.applyUpdate(to, update);
  return update;
}

describe('Yjs behavior: basic (non-Yjs) types stored in Y.Map', () => {
  test('console: Y.Map.toJSON() output for basic stored values', () => {
    const doc = new Y.Doc();
    const root = doc.getMap('root');

    root.set('obj', { foo: 'bar', nested: { count: 1 } });
    root.set('arr', [1, { id: 'a' }, ['x', 'y']]);
    const yMap = new Y.Map<any>();
    yMap.set('k1', 'v1');
    yMap.set('k2', { deep: true });
    root.set('yMap', yMap);

    const yArr = new Y.Array<any>();
    yArr.push(['a', { id: 1 }]);
    root.set('yArr', yArr);

    try {
      root.set(
        'jsMap',
        new Map<any, any>([
          ['k1', 'v1'],
          ['k2', { deep: true }],
        ]),
      );
    } catch (err) {
      // eslint-disable-next-line no-console
      console.log('Setting a native JS Map throws:', err);
    }

    const json = root.toJSON();
    // Intentionally no assertions: meant for manual inspection.
    // eslint-disable-next-line no-console
    console.log('Y.Map.toJSON()', json);
    // eslint-disable-next-line no-console
    console.log('JSON.stringify(Y.Map.toJSON())', JSON.stringify(json));

    expect(true).toBe(true);
  });

  test('plain object/array values replicate on set()', () => {
    const doc1 = new Y.Doc();
    const doc2 = new Y.Doc();
    const root1 = doc1.getMap('root');
    const root2 = doc2.getMap('root');

    const obj = { foo: 'bar', nested: { count: 1 } };
    const arr = [1, { id: 'a' }, ['x', 'y']] as any[];

    root1.set('obj', obj);
    root1.set('arr', arr);

    sync(doc1, doc2);

    expect(root2.get('obj')).toEqual(obj);
    expect(root2.get('arr')).toEqual(arr);
  });

  test('native JS Map cannot be stored in Y.Map (throws)', () => {
    const doc = new Y.Doc();
    const root = doc.getMap('root');

    expect(() => root.set('jsMap', new Map([['k', 'v']]))).toThrow(
      /Unexpected content type/i,
    );
  });

  test('nested Y.Map and Y.Array replicate and stay CRDT-aware', () => {
    const doc1 = new Y.Doc();
    const doc2 = new Y.Doc();
    const root1 = doc1.getMap('root');
    const root2 = doc2.getMap('root');

    const nestedMap = new Y.Map<any>();
    nestedMap.set('k', 'v');
    const nestedArr = new Y.Array<any>();
    nestedArr.push([1, 2]);

    root1.set('yMap', nestedMap);
    root1.set('yArr', nestedArr);
    sync(doc1, doc2);

    const yMap2 = root2.get('yMap') as Y.Map<any>;
    const yArr2 = root2.get('yArr') as Y.Array<any>;
    expect(yMap2).toBeInstanceOf(Y.Map);
    expect(yArr2).toBeInstanceOf(Y.Array);
    expect(yMap2.get('k')).toBe('v');
    expect(yArr2.toArray()).toEqual([1, 2]);

    // Mutations to nested Yjs types *are* tracked and replicate.
    nestedMap.set('k2', 'v2');
    nestedArr.push([3]);
    sync(doc1, doc2);

    expect((root2.get('yMap') as Y.Map<any>).get('k2')).toBe('v2');
    expect((root2.get('yArr') as Y.Array<any>).toArray()).toEqual([1, 2, 3]);
  });

  test('mutating a stored plain object/array does not create Yjs updates', () => {
    const doc1 = new Y.Doc();
    const doc2 = new Y.Doc();
    const root1 = doc1.getMap('root');
    const root2 = doc2.getMap('root');

    root1.set('obj', { nested: { count: 1 } });
    root1.set('arr', [1, 2]);
    sync(doc1, doc2);

    let observed = 0;
    root1.observe(() => {
      observed += 1;
    });

    // Mutate the retrieved values *outside* a Yjs transaction.
    (root1.get('obj') as any).nested.count = 999;
    (root1.get('arr') as any[]).push(3);

    // No Yjs event is emitted because the Y.Map itself didn't change.
    expect(observed).toBe(0);

    // And doc2 will not see these mutations because no Yjs update was produced.
    sync(doc1, doc2);

    expect((root2.get('obj') as any).nested.count).toBe(1);
    expect(root2.get('arr')).toEqual([1, 2]);
  });

  test('to propagate changes to basic values, you must set() again', () => {
    const doc1 = new Y.Doc();
    const doc2 = new Y.Doc();
    const root1 = doc1.getMap('root');
    const root2 = doc2.getMap('root');

    root1.set('obj', { nested: { count: 1 } });
    root1.set('arr', [1, 2]);
    sync(doc1, doc2);

    const obj = root1.get('obj') as any;
    const arr = root1.get('arr') as any[];

    obj.nested.count = 2;
    arr.push(3);

    // Still no replication yet…
    sync(doc1, doc2);
    expect((root2.get('obj') as any).nested.count).toBe(1);
    expect(root2.get('arr')).toEqual([1, 2]);

    // Re-setting the value is what creates a Yjs update.
    root1.set('obj', obj);
    root1.set('arr', arr);
    sync(doc1, doc2);

    expect((root2.get('obj') as any).nested.count).toBe(2);
    expect(root2.get('arr')).toEqual([1, 2, 3]);
  });
});

