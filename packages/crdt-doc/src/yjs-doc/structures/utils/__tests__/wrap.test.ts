import * as Y from 'yjs';
import { unwrapCRDTtoYJS, wrapBasicTypeToCRDTType, wrapYJStoCRDT } from '../wrap';
import { YjsArray, YjsMap, YjsText } from '../../';

function containsYjsTypes(value: unknown): boolean {
  let result: boolean;
  if (value instanceof YjsMap || value instanceof YjsArray || value instanceof YjsText) {
    result = true;
  } else if (value instanceof Y.Map || value instanceof Y.Array || value instanceof Y.Text) {
    result = true;
  } else if (Array.isArray(value)) {
    result = value.some(containsYjsTypes);
  } else if (value && typeof value === 'object') {
    result = Object.values(value as Record<string, unknown>).some(containsYjsTypes);
  } else {
    result = false;
  }
  return result;
}

describe('wrap/unwrap utils', () => {
  describe('wrapYJStoCRDT', () => {
    it('wraps Y.Map / Y.Array / Y.Text to CRDT wrappers', () => {
      const yMap = new Y.Map();
      const yArr = new Y.Array();
      const yText = new Y.Text('hello');

      expect(wrapYJStoCRDT(yMap)).toBeInstanceOf(YjsMap);
      expect(wrapYJStoCRDT(yArr)).toBeInstanceOf(YjsArray);
      expect(wrapYJStoCRDT(yText)).toBeInstanceOf(YjsText);
    });

    it('returns primitives and deep plain records as-is', () => {
      const plain = { a: 1, nested: { b: 'x', arr: [1, 2, { c: true }] } };
      const arr = [1, { ok: true }, ['x']] as any[];

      expect(wrapYJStoCRDT(1)).toBe(1);
      expect(wrapYJStoCRDT('x')).toBe('x');
      expect(wrapYJStoCRDT(true)).toBe(true);
      expect(wrapYJStoCRDT(null)).toBeNull();
      expect(wrapYJStoCRDT(plain as any)).toBe(plain);
      expect(wrapYJStoCRDT(arr as any)).toBe(arr);
    });

    it('throws when given wrapper instances (must be unwrapped first)', () => {
      expect(() => wrapYJStoCRDT(new YjsMap() as any)).toThrow(/must be unwrapped/i);
      expect(() => wrapYJStoCRDT(new YjsArray() as any)).toThrow(/must be unwrapped/i);
      expect(() => wrapYJStoCRDT(new YjsText() as any)).toThrow(/must be unwrapped/i);
    });
  });

  describe('unwrapCRDTtoYJS', () => {
    it('unwraps wrappers to Yjs primitives (Y.Map / Y.Array / Y.Text)', () => {
      const wrapperMap = new YjsMap();
      const wrapperArr = new YjsArray();
      const wrapperText = new YjsText();

      const unwrappedMap = unwrapCRDTtoYJS(wrapperMap as any);
      const unwrappedArr = unwrapCRDTtoYJS(wrapperArr as any);
      const unwrappedText = unwrapCRDTtoYJS(wrapperText as any);

      expect(unwrappedMap).toBeInstanceOf(Y.Map);
      expect(unwrappedArr).toBeInstanceOf(Y.Array);
      expect(unwrappedText).toBeInstanceOf(Y.Text);
    });

    it('passes primitives and deep plain records through', () => {
      const plain = { a: 1, nested: { b: 'x', arr: [1, 2, { c: true }] } };
      const arr = [1, { ok: true }] as any[];

      expect(unwrapCRDTtoYJS(1)).toBe(1);
      expect(unwrapCRDTtoYJS('x')).toBe('x');
      expect(unwrapCRDTtoYJS(true)).toBe(true);
      expect(unwrapCRDTtoYJS(null)).toBeNull();
      expect(unwrapCRDTtoYJS(plain as any)).toBe(plain);
      expect(unwrapCRDTtoYJS(arr as any)).toBe(arr);
    });

    it('throws on unsupported inputs (undefined, native Map, raw Yjs types)', () => {
      // @ts-expect-error
      expect(() => unwrapCRDTtoYJS(undefined)).toThrow(/undefined/i);
      expect(() => unwrapCRDTtoYJS(new Map([['k', 'v']]) as any)).toThrow(/Map/i);
      expect(() => unwrapCRDTtoYJS(new Y.Map() as any)).toThrow(/must be wrapped/i);
      expect(() => unwrapCRDTtoYJS(new Y.Array() as any)).toThrow(/must be wrapped/i);
      expect(() => unwrapCRDTtoYJS(new Y.Text() as any)).toThrow(/must be wrapped/i);
    });
  });

  describe('wrapBasicTypeToCRDTType (options + nesting)', () => {
    it('wraps string to YjsText by default (and can be attached later)', () => {
      const crdt = wrapBasicTypeToCRDTType('hello');
      expect(crdt).toBeInstanceOf(YjsText);

      // Unattached text cannot be read; once attached it becomes readable.
      expect(() => (crdt as YjsText).toString()).toThrow();

      const doc = new Y.Doc();
      const root = new YjsMap(doc.getMap('root'));
      root.set('t', crdt);

      const stored = root.get('t') as YjsText;
      expect(stored.toString()).toBe('hello');
    });

    it('does not wrap string when string2crdttext=false', () => {
      const crdt = wrapBasicTypeToCRDTType('hello', { string2crdttext: false });
      expect(crdt).toBe('hello');
    });

    it('returns a deep plain object when object2crdtmap=false (no nested CRDT wrappers)', () => {
      const input = { a: 'x', nested: { b: 'y', arr: [1, { c: 'z' }] } };
      const out = wrapBasicTypeToCRDTType(input, { object2crdtmap: false });

      expect(out).toEqual(input);
      expect(containsYjsTypes(out)).toBe(false);
    });

    it('converts native Map to plain object when map2crdtmap=false (and disables nested CRDT conversion)', () => {
      const input = new Map<string, any>([
        ['a', 1],
        ['nested', { b: 'x' }],
      ]);
      const out = wrapBasicTypeToCRDTType(input as any, { map2crdtmap: false });

      expect(out).toEqual({ a: 1, nested: { b: 'x' } });
      expect(containsYjsTypes(out)).toBe(false);
    });

    it('returns a deep plain array when array2crdtarray=false (and disables nested CRDT conversion)', () => {
      const input = ['a', { nested: 'b' }, [1, { c: 'd' }]];
      const out = wrapBasicTypeToCRDTType(input as any, { array2crdtarray: false });

      expect(out).toEqual(input);
      expect(Array.isArray(out)).toBe(true);
      expect(containsYjsTypes(out)).toBe(false);
    });
  });
});
