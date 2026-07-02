import * as Y from 'yjs';
import { YjsInstantiator } from '../instantiator';
import { YjsArray, YjsMap, YjsText } from '../../structures';

describe('YjsInstantiator', () => {
  let inst: YjsInstantiator;

  beforeEach(() => {
    inst = new YjsInstantiator();
  });

  test('createArray/createMap/createText return detached CRDT wrappers', () => {
    const a = inst.createArray();
    const m = inst.createMap();
    const t = inst.createText();

    expect(a).toBeInstanceOf(YjsArray);
    expect(m).toBeInstanceOf(YjsMap);
    expect(t).toBeInstanceOf(YjsText);

    // Detached: underlying Yjs objects have no doc.
    // @ts-ignore
    expect((a as YjsArray).yjsObj.doc).toBeNull();
    // @ts-ignore
    expect((m as YjsMap).yjsObj.doc).toBeNull();
    // @ts-ignore
    expect((t as YjsText).yjsObj.doc).toBeNull();
  });

  test('plainObjectToCRDT wraps values using the same rules/options as basicToCRDT', () => {
    const doc = new Y.Doc();
    const root = new YjsMap(doc.getMap('root'));

    const wrappedText = inst.plainObjectToCRDT('hello') as any;
    expect(wrappedText).toBeInstanceOf(YjsText);
    root.set('t', wrappedText);
    expect((root.get('t') as YjsText).toString()).toBe('hello');

    const wrappedMap = inst.plainObjectToCRDT({ a: 'x', nested: { b: 1 } }) as any;
    expect(wrappedMap).toBeInstanceOf(YjsMap);
    root.set('m', wrappedMap);
    const storedMap = root.get('m') as YjsMap;
    expect((storedMap.get('a') as YjsText).toString()).toBe('x');
    expect((storedMap.get('nested') as YjsMap).get('b')).toBe(1);

    const plain = inst.plainObjectToCRDT({ a: 'x' }, { object2crdtmap: false });
    expect(plain).toEqual({ a: 'x' });
  });

  test('isPlainRecord uses deep plain-record semantics', () => {
    expect(inst.isPlainRecord({ a: 1, nested: { b: 'x' }, arr: [1, { c: true }] } as any)).toBe(true);
    expect(inst.isPlainRecord([1, { a: 2 }] as any)).toBe(true);
    expect(inst.isPlainRecord(new Map([['k', 'v']]) as any)).toBe(false);
    expect(inst.isPlainRecord(new Y.Map() as any)).toBe(false);
    expect(inst.isPlainRecord(new Y.Array() as any)).toBe(false);
    expect(inst.isPlainRecord(new Y.Text() as any)).toBe(false);
  });
});

