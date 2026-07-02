import * as Y from 'yjs';
import { convertBasicTypeToYJS, convertYJSTypeToBasic } from '../yjs-converters';

describe('property utils', () => {
  describe('convertProperty', () => {
    it('should convert primitives correctly', () => {
      expect(convertBasicTypeToYJS(123)).toBe(123);
      expect(convertBasicTypeToYJS('hello', { string2crdttext: false })).toBe('hello');
      expect(convertBasicTypeToYJS(true)).toBe(true);
      expect(convertBasicTypeToYJS(null)).toBe(null);
    });

    it('should convert arrays to Y.Array', () => {
      const input = [1, 'two', true];
      const result = convertBasicTypeToYJS(input, { string2crdttext: false }) as Y.Array<any>;
      // We always need to add arrays to a document to be able to test them.
      const doc = new Y.Doc();
      doc.getMap('test').set('array', result);
      
      expect(result).toBeInstanceOf(Y.Array);
      expect(result.length).toBe(3);
      expect(result.get(0)).toBe(1);
      expect(result.get(1)).toBe('two');
      expect(result.get(2)).toBe(true);
    });

    it('should convert nested arrays', () => {
      const input = [[1, 2]];
      const result = convertBasicTypeToYJS(input) as Y.Array<any>;
      // We always need to add arrays to a document to be able to test them.
      const doc = new Y.Doc();
      doc.getMap('test').set('array', result);
      
      expect(result).toBeInstanceOf(Y.Array);
      const inner = result.get(0) as Y.Array<any>;
      expect(inner).toBeInstanceOf(Y.Array);
      expect(inner.get(0)).toBe(1);
      expect(inner.get(1)).toBe(2);
    });

    it('should convert Maps to Y.Map', () => {
      const input = new Map<string, any>([['key', 'value']]);
      const result = convertBasicTypeToYJS(input, { string2crdttext: false }) as Y.Map<any>;

      // We always need to add maps to a document to be able to test them.
      const doc = new Y.Doc();
      doc.getMap('test').set('map', result);

      expect(result).toBeInstanceOf(Y.Map);
      expect(result.get('key')).toBe('value');
    });

    it('should convert objects to Y.Map', () => {
      const input = { key: 'value', nested: { inner: 1 } };
      const result = convertBasicTypeToYJS(input, { string2crdttext: false }) as Y.Map<any>;

      // We always need to add maps to a document to be able to test them.
      const doc = new Y.Doc();
      doc.getMap('test').set('map', result);

      expect(result).toBeInstanceOf(Y.Map);
      expect(result.get('key')).toBe('value');
      
      const nested = result.get('nested') as Y.Map<any>;
      expect(nested).toBeInstanceOf(Y.Map);
      expect(nested.get('inner')).toBe(1);
    });

    it('should convert string to Y.Text when text2string is false', () => {
      const input = 'hello';
      const result = convertBasicTypeToYJS(input, { string2crdttext: true });
      
      // We need to add Y.Text to a document to be able to read its content
      const doc = new Y.Doc();
      doc.getMap('test').set('text', result as Y.Text);

      expect(result).toBeInstanceOf(Y.Text);
      expect((result as Y.Text).toString()).toBe('hello');
    });

    it('should throw error for unsupported types', () => {
        // @ts-ignore
      expect(() => convertBasicTypeToYJS(undefined)).toThrow('Unsupported property type: undefined');
       // @ts-ignore
      expect(() => convertBasicTypeToYJS(() => {})).toThrow('Unsupported property type: function');
    });
  });

  describe('convertDocumentProperty', () => {
    it('should convert primitives correctly', () => {
      expect(convertYJSTypeToBasic(123)).toBe(123);
      expect(convertYJSTypeToBasic('hello')).toBe('hello');
      expect(convertYJSTypeToBasic(true)).toBe(true);
      expect(convertYJSTypeToBasic(null)).toBe(null);
    });

    it('should convert Y.Array to array', () => {
      const doc = new Y.Doc();
      const yArray = doc.getArray('test');
      yArray.insert(0, [1, 'two', true]);
      
      const result = convertYJSTypeToBasic(yArray);
      expect(result).toEqual([1, 'two', true]);
    });

    it('should convert Y.Map to Map by default', () => {
      const doc = new Y.Doc();
      const yMap = doc.getMap('test');
      yMap.set('key', 'value');
      
      const result = convertYJSTypeToBasic(yMap, { crdtmap2map: true });
      expect(result).toBeInstanceOf(Map);
      expect((result as Map<string, any>).get('key')).toBe('value');
    });

    it('should convert Y.Map to object when map2object is true', () => {
      const doc = new Y.Doc();
      const yMap = doc.getMap('test');
      yMap.set('key', 'value');
      
      const result = convertYJSTypeToBasic(yMap, { crdtmap2map: false });
      expect(result).toEqual({ key: 'value' });
    });

    it('should handle nested structures (Y.Array inside Y.Map)', () => {
        const doc = new Y.Doc();
        const yMap = doc.getMap('test');
        const yArray = new Y.Array();
        yArray.insert(0, [1, 2]);
        yMap.set('arr', yArray);

        const result = convertYJSTypeToBasic(yMap, { crdtmap2map: true });
        expect(result).toBeInstanceOf(Map);
        const arr = (result as Map<string, any>).get('arr');
        expect(arr).toEqual([1, 2]);
    });

    it('should handle nested structures (Y.Map inside Y.Array)', () => {
        const doc = new Y.Doc();
        const yArray = doc.getArray('test');
        const yMap = new Y.Map();
        yMap.set('k', 'v');
        yArray.insert(0, [yMap]);

        const result = convertYJSTypeToBasic(yArray, { crdtmap2map: true });
        expect(result).toBeInstanceOf(Array);
        expect((result as any[])[0]).toBeInstanceOf(Map);
        expect((result as any[])[0].get('k')).toBe('v');
    });

     it('should recursively convert Y.Map to object when map2object is true', () => {
        const doc = new Y.Doc();
        const yMap = doc.getMap('test');
        const innerMap = new Y.Map();
        innerMap.set('innerKey', 'innerValue');
        yMap.set('outerKey', innerMap);

        const result = convertYJSTypeToBasic(yMap, { crdtmap2map: false });
        expect(result).toEqual({ outerKey: { innerKey: 'innerValue' } });
    });

    it('should convert Y.Array of Y.Maps to array of objects when map2object is true', () => {
      const doc = new Y.Doc();
      const yArray = doc.getArray('test');
      const yMap = new Y.Map();
      yMap.set('key', 'value');
      yArray.insert(0, [yMap]);
      
      const result = convertYJSTypeToBasic(yArray, { crdtmap2map: false });
      expect(result).toEqual([{ key: 'value' }]);
    });

    it('should throw error for unsupported document types', () => {
        // @ts-ignore
       expect(() => convertYJSTypeToBasic(undefined)).toThrow('Unsupported document property type: undefined');
    });
  });
});

