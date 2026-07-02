import { CRDTArray, CRDTMap, CRDTText, Instantiator } from '@/store/crdt-doc';

/**
 * CRDT-backed record/array proxies.
 *
 * This module provides a lightweight JS `Proxy` layer for working with CRDT data structures
 * using familiar JavaScript object/array syntax, while persisting everything into the
 * underlying `CRDTMap` / `CRDTArray`.
 *
 * ## Key behaviors
 * - **Plain objects** assigned into a record become **CRDT maps** (recursively).
 * - **Arrays** assigned into a record become **CRDT arrays** (recursively).
 * - **CRDTText** values are preserved as-is (so collaborative text editing works).
 * - **Functions/undefined** are rejected (Yjs cannot store them).
 *
 * ## Marker symbols
 * The proxies expose a hidden symbol property pointing at their underlying CRDT type,
 * so setters can safely unwrap proxies back into `CRDTMap` / `CRDTArray`.
 */
export const RECORD_PROXY_MARKER = Symbol.for('rivto.recordProxy');
export const RECORD_PROXY_UNDERLYING = Symbol.for('rivto.recordUnderlying');

/**
 * Marker symbol stored on proxy objects/arrays.
 * Used to detect that a value is a record/array proxy.
 */
// (re-exported constant; documented here for discoverability)

/**
 * Symbol stored on proxy objects/arrays that returns the underlying CRDT value:
 * - record proxy -> `CRDTMap`
 * - array proxy  -> `CRDTArray`
 */
// (re-exported constant; documented here for discoverability)

function isNumericProp(prop: PropertyKey): prop is string {
  return typeof prop === 'string' && prop !== '' && String(Number(prop)) === prop;
}

function isCRDTArrayLike(value: any): value is CRDTArray {
  return value && typeof value === 'object' && typeof value.insert === 'function' && typeof value.delete === 'function' && typeof value.get === 'function';
}

function isCRDTMapLike(value: any): value is CRDTMap {
  return value && typeof value === 'object' && typeof value.set === 'function' && typeof value.get === 'function' && typeof value.keys === 'function';
}

function isCRDTTextLike(value: any): value is CRDTText {
  return value && typeof value === 'object' && typeof value.insert === 'function' && typeof value.delete === 'function' && typeof value.toString === 'function';
}

function wrapRecordValue(value: any, instantiator: Instantiator): any {
  if (value && typeof value === 'object') {
    if (isCRDTArrayLike(value)) return createArrayProxy(value, instantiator);
    if (isCRDTMapLike(value)) return createRecordProxy(value, instantiator);
    if (isCRDTTextLike(value)) return value as CRDTText;
  }
  return value;
}

function isPlainObject(value: any): value is Record<string, any> {
  if (!value || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function toCRDTValue(value: any, instantiator: Instantiator): any {
  if (value === undefined) throw new Error('Unsupported value: undefined');
  if (typeof value === 'function') throw new Error('Unsupported value: function');

  if (value && typeof value === 'object') {
    // Unwrap our own proxies back to CRDT types.
    try {
      const underlying = (value as any)[RECORD_PROXY_UNDERLYING];
      if (underlying) return underlying;
    } catch {
      // ignore
    }

    if (isCRDTMapLike(value) || isCRDTArrayLike(value) || isCRDTTextLike(value)) return value;

    if (Array.isArray(value)) {
      const arr = instantiator.createArray();
      arr.insert(0, ...(value as any[]).map((v) => toCRDTValue(v, instantiator)));
      return arr;
    }

    if (value instanceof Map) {
      const map = instantiator.createMap();
      for (const [k, v] of Array.from(value.entries())) {
        if (typeof k !== 'string') throw new Error('Unsupported Map key type (expected string)');
        map.set(k, toCRDTValue(v, instantiator));
      }
      return map;
    }

    // Convert plain objects into CRDT maps even if they contain CRDT values.
    if (isPlainObject(value)) {
      const map = instantiator.createMap();
      for (const [k, v] of Object.entries(value)) {
        map.set(k, toCRDTValue(v, instantiator));
      }
      return map;
    }

    // Fallback: keep as-is (for already-supported non-plain objects)
    return value;
  }

  return value;
}

/**
 * Creates a JS object-like proxy around a `CRDTMap`.
 *
 * Supported patterns:
 * - property access: `record.foo`
 * - property set: `record.foo = 123`
 * - property delete: `delete record.foo`
 * - map-style calls: `record.get('foo')`, `record.set('foo', 123)`, etc.
 *
 * Returned values are automatically wrapped:
 * - nested CRDT maps -> record proxies
 * - nested CRDT arrays -> array proxies
 * - CRDT text -> returned directly
 */
export function createRecordProxy(model: CRDTMap, instantiator: Instantiator): Record<string, any> {
  const handler: ProxyHandler<any> = {
    get(_target, prop) {
      if (prop === RECORD_PROXY_MARKER) return true;
      if (prop === RECORD_PROXY_UNDERLYING) return model;

      // methods
      if (prop === 'get') return (key: string) => wrapRecordValue(model.get(key), instantiator);
      if (prop === 'set') {
        return (key: string, val: any) => {
          model.set(key, toCRDTValue(val, instantiator));
          return proxy;
        };
      }
      if (prop === 'delete') return (key: string) => model.delete(key);
      if (prop === 'clear') return () => model.clear();
      if (prop === 'keys') return () => model.keys();
      if (prop === 'values') return () => model.values();
      if (prop === 'entries') return () => model.entries();
      if (prop === 'forEach') return (cb: any) => model.forEach((v, k, m) => cb(wrapRecordValue(v, instantiator), k, m));
      if (prop === 'size') return model.size;
      if (prop === 'toJSON') return () => model.toJSON();
      if (prop === 'fromJSON') return (json: Record<string, any> | undefined) => assignRecordToCRDTMap(model, instantiator, json);

      if (prop === Symbol.iterator) {
        return function* () {
          for (const [k, v] of Array.from(model.entries())) yield [k, wrapRecordValue(v, instantiator)];
        };
      }

      // property access => map key
      if (typeof prop === 'string') return wrapRecordValue(model.get(prop), instantiator);
      return undefined;
    },
    set(_target, prop, value) {
      if (typeof prop !== 'string') return false;
      model.set(prop, toCRDTValue(value, instantiator));
      return true;
    },
    deleteProperty(_target, prop) {
      if (typeof prop !== 'string') return false;
      model.delete(prop);
      return true;
    },
    ownKeys() {
      try {
        return Array.from(model.keys());
      } catch {
        return [];
      }
    },
    getOwnPropertyDescriptor(_target, prop) {
      if (typeof prop !== 'string') return undefined;
      return { enumerable: true, configurable: true };
    },
  };

  const proxy = new Proxy({}, handler) as any;
  return proxy as Record<string, any>;
}

/**
 * Creates a JS array-like proxy around a `CRDTArray`.
 *
 * Supported patterns:
 * - index access: `arr[0]`
 * - assignment: `arr[1] = value` (implemented as delete+insert)
 * - `splice()` for inserts/removals (implemented via CRDT ops)
 * - `push`, `insert`, `delete`, `forEach`
 *
 * Returned nested values are automatically wrapped the same way as `createRecordProxy`.
 */
export function createArrayProxy(model: CRDTArray, instantiator: Instantiator): any[] {
  const handler: ProxyHandler<any> = {
    get(_target, prop) {
      if (prop === RECORD_PROXY_MARKER) return true;
      if (prop === RECORD_PROXY_UNDERLYING) return model;

      if (prop === 'length') return model.length;
      if (prop === 'get') return (idx: number) => wrapRecordValue(model.get(idx), instantiator);
      if (prop === 'insert') return (idx: number, ...items: any[]) => model.insert(idx, ...items.map((i) => toCRDTValue(i, instantiator)));
      if (prop === 'push') return (...items: any[]) => model.push(...items.map((i) => toCRDTValue(i, instantiator)));
      if (prop === 'delete') return (idx: number, count?: number) => model.delete(idx, count);
      if (prop === 'forEach') return (cb: any) => model.forEach((v, i, a) => cb(wrapRecordValue(v, instantiator), i, a));
      if (prop === 'toJSON') return () => (model as any).toJSON?.() ?? (model as any).toArray?.();
      if (prop === 'splice') {
        return (start: number, deleteCount?: number, ...items: any[]) => {
          const len = model.length;
          const normalizedStart = start < 0 ? Math.max(len + start, 0) : Math.min(start, len);
          const dc = deleteCount === undefined ? len - normalizedStart : Math.max(0, Math.min(deleteCount, len - normalizedStart));

          const removed: any[] = [];
          for (let i = 0; i < dc; i++) removed.push(wrapRecordValue(model.get(normalizedStart + i), instantiator));
          if (dc > 0) model.delete(normalizedStart, dc);
          if (items.length > 0) model.insert(normalizedStart, ...items.map((i) => toCRDTValue(i, instantiator)));
          return removed;
        };
      }
      if (prop === Symbol.iterator) {
        return function* () {
          for (let i = 0; i < model.length; i++) yield wrapRecordValue(model.get(i), instantiator);
        };
      }
      if (isNumericProp(prop)) return wrapRecordValue(model.get(Number(prop)), instantiator);
      return undefined;
    },
    set(_target, prop, value) {
      if (!isNumericProp(prop)) return false;
      const idx = Number(prop);
      model.delete(idx, 1);
      model.insert(idx, toCRDTValue(value, instantiator));
      return true;
    },
    ownKeys() {
      // IMPORTANT: since the proxy target is a real Array (`[]`), we must include
      // the non-configurable `length` property to satisfy Proxy invariants.
      return ['length', ...Array.from({ length: model.length }, (_, i) => String(i))];
    },
    getOwnPropertyDescriptor(_target, prop) {
      if (prop === 'length') {
        return {
          value: model.length,
          writable: true,
          enumerable: false,
          configurable: false,
        };
      }
      if (isNumericProp(prop)) return { enumerable: true, configurable: true };
      return undefined;
    },
  };

  const proxy = new Proxy([], handler) as any;
  return proxy as any[];
}

/**
 * Clears `model` and assigns all key/value pairs from a plain JS record into it.
 *
 * - Nested plain objects become CRDT maps
 * - Nested arrays become CRDT arrays
 * - CRDT types (map/array/text) are preserved
 */
export function assignRecordToCRDTMap(model: CRDTMap, instantiator: Instantiator, value: Record<string, any> | undefined): void {
  model.clear();
  if (value === undefined || value === null) return;
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Expected object when assigning record to CRDTMap');
  }
  const entries = value instanceof Map ? Array.from(value.entries()) : Object.entries(value);
  for (const [k, v] of entries) model.set(k, toCRDTValue(v, instantiator));
}

