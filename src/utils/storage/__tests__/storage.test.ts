import { Storage } from '../storage';

describe('Storage', () => {
  let storage: Storage<string>;

  beforeEach(() => {
    storage = new Storage<string>();
  });

  describe('setItem & getItem', () => {
    it('should store and retrieve an item', () => {
      storage.setItem('key1', 'value1');
      expect(storage.getItem('key1')).toBe('value1');
    });

    it('should overwrite an existing item', () => {
      storage.setItem('key1', 'value1');
      storage.setItem('key1', 'value2');
      expect(storage.getItem('key1')).toBe('value2');
    });

    it('should throw error if item does not exist', () => {
      expect(() => storage.getItem('non-existent')).toThrow('Item with key non-existent not found');
    });
  });

  describe('removeItem', () => {
    it('should remove an existing item', () => {
      storage.setItem('key1', 'value1');
      storage.removeItem('key1');
      expect(storage.hasItem('key1')).toBe(false);
    });

    it('should throw error if trying to remove non-existent item', () => {
      expect(() => storage.removeItem('non-existent')).toThrow('Item with key non-existent not found');
    });
  });

  describe('hasItem & has', () => {
    it('should return true if item exists', () => {
      storage.setItem('key1', 'value1');
      expect(storage.hasItem('key1')).toBe(true);
      expect(storage.has('key1')).toBe(true);
    });

    it('should return false if item does not exist', () => {
      expect(storage.hasItem('key1')).toBe(false);
      expect(storage.has('key1')).toBe(false);
    });
  });

  describe('getOne', () => {
    it('should return the single item in storage', () => {
      storage.setItem('key1', 'value1');
      expect(storage.getOne()).toBe('value1');
    });

    it('should throw error if storage is empty', () => {
      expect(() => storage.getOne()).toThrow('Storage is empty');
    });

    it('should throw error if storage has multiple items', () => {
      storage.setItem('key1', 'value1');
      storage.setItem('key2', 'value2');
      expect(() => storage.getOne()).toThrow('Storage has multiple items');
    });
  });

  describe('length', () => {
    it('should return the correct number of items', () => {
      expect(storage.length).toBe(0);
      storage.setItem('key1', 'value1');
      expect(storage.length).toBe(1);
      storage.setItem('key2', 'value2');
      expect(storage.length).toBe(2);
      storage.removeItem('key1');
      expect(storage.length).toBe(1);
    });
  });

  describe('clear', () => {
    it('should remove all items', () => {
      storage.setItem('key1', 'value1');
      storage.setItem('key2', 'value2');
      storage.clear();
      expect(storage.length).toBe(0);
      expect(storage.hasItem('key1')).toBe(false);
    });
  });

  describe('iteration methods', () => {
    beforeEach(() => {
      storage.setItem('key1', 'value1');
      storage.setItem('key2', 'value2');
    });

    it('keys() should return all keys', () => {
      const keys = storage.keys();
      expect(keys).toContain('key1');
      expect(keys).toContain('key2');
      expect(keys.length).toBe(2);
    });

    it('values() should return all values', () => {
      const values = storage.values();
      expect(values).toContain('value1');
      expect(values).toContain('value2');
      expect(values.length).toBe(2);
    });

    it('entries() should return all entries', () => {
      const entries = storage.entries();
      expect(entries).toHaveLength(2);
      expect(entries).toEqual(expect.arrayContaining([
        ['key1', 'value1'],
        ['key2', 'value2']
      ]));
    });

    it('forEach() should iterate over all items', () => {
      const mockCallback = jest.fn();
      storage.forEach(mockCallback);
      expect(mockCallback).toHaveBeenCalledTimes(2);
      expect(mockCallback).toHaveBeenCalledWith('value1', 'key1', expect.any(Map));
      expect(mockCallback).toHaveBeenCalledWith('value2', 'key2', expect.any(Map));
    });
  });
});

