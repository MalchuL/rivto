import { isDeepPlainRecord } from '../plain-check';
import * as Y from 'yjs';

describe('plain check', () => {
  describe('isDeepPlainRecord', () => {
    it('should return true for a deep plain record', () => {
      expect(isDeepPlainRecord({ a: 1, b: '2', c: true })).toBe(true);
      expect(isDeepPlainRecord({ a: 1, b: '2', c: ["a", "b", "c", { d: 4 }] })).toBe(true);
      expect(isDeepPlainRecord({ a: 1, b: '2', c: ["a", "b", "c", { d: new Map() }] })).toBe(false);
      expect(isDeepPlainRecord(new Map())).toBe(false);
      expect(isDeepPlainRecord(new Y.Array())).toBe(false);
      expect(isDeepPlainRecord(new Y.Text())).toBe(false);
      expect(isDeepPlainRecord(new Y.Map())).toBe(false);
      expect(isDeepPlainRecord(["a", "b", "c", { d: 4 }])).toBe(true);
    });
  });
});