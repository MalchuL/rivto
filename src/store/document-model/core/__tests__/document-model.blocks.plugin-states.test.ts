import * as Y from 'yjs';
import { DocumentModelImpl } from '@/store/document-model';
import { YjsDoc } from '@/store/crdt-doc';
import type { Unsubscribe } from '@/store/crdt-doc';
import type { BlockCore } from '@/store/document-model';

const makeBlock = (id: string, type = 'block', order = 0): BlockCore =>
  ({
    id,
    type,
    order,
    meta: undefined,
  }) as any;

const deepClone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const toPlain = (value: any) => JSON.parse(JSON.stringify(value));
const policyTextValueToString = (value: any): string | undefined => {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'string') return value;
  if (typeof value?.toString === 'function') return value.toString();
  return undefined;
};

/**
 * Connect two Yjs documents by exchanging incremental updates.
 * Uses origin tags to prevent echo loops.
 */
const connectDocs = (a: YjsDoc, b: YjsDoc): Unsubscribe => {
  const ORIGIN_A = 'sync:a';
  const ORIGIN_B = 'sync:b';

  const onA = (update: Uint8Array, origin: any) => {
    if (origin === ORIGIN_B) return;
    Y.applyUpdate(b.doc, update, ORIGIN_A);
  };
  const onB = (update: Uint8Array, origin: any) => {
    if (origin === ORIGIN_A) return;
    Y.applyUpdate(a.doc, update, ORIGIN_B);
  };

  a.doc.on('update', onA);
  b.doc.on('update', onB);

  return () => {
    a.doc.off('update', onA);
    b.doc.off('update', onB);
  };
};

describe('DocumentModelImpl block pluginStates', () => {
  it('supports setting pluginStates via plain object (nested structures) and exports them in bundle', async () => {
    const doc = new YjsDoc('plugin-states-plain-object');
    const model = new DocumentModelImpl('model', doc);

    await model.insertBlock(makeBlock('a', 'alpha', 0), undefined);

    const nested = {
      enabled: true,
      version: 3,
      config: {
        mode: 'fast',
        flags: [true, false, null, 'x', 1.5],
        matrix: [
          [1, 2],
          [3, 4],
        ],
        deep: { a: { b: { c: { d: 'end' } } } },
        items: [
          { id: 'i1', data: { tags: ['a', 'b'], extra: { emptyObj: {}, emptyArr: [] } } },
          { id: 'i2', data: { tags: [] } },
        ],
      },
    };

    const blockA = (await model.getBlock('a'))!;
    blockA.pluginStates = { 'plugin.alpha': nested } as any;

    const bundle = await model.toBundle();
    expect(() => JSON.stringify(bundle)).not.toThrow();

    const bundledBlockA = (bundle.blocks as any[]).find((b) => b.id === 'a');
    expect(bundledBlockA).toBeDefined();
    expect(bundledBlockA.pluginStates).toEqual({
      'plugin.alpha': nested,
    });

    const reread = (await model.getBlock('a'))!;
    expect((reread.pluginStates as any)['plugin.alpha'].config.matrix[0][1]).toBe(2);
    doc.destroy();
  });

  it('supports setting multiple pluginStates entries and exports nested structure', async () => {
    const doc = new YjsDoc('plugin-states-tojson-wrapper');
    const model = new DocumentModelImpl('model', doc);

    await model.insertBlock(makeBlock('a', 'alpha', 0), undefined);

    const nestedA = { ok: true, deep: { score: 1, list: ['x', { inner: 2 }] } };
    const nestedB = { ok: false, deep: { score: 0, list: [] } };

    const blockA = (await model.getBlock('a'))!;
    blockA.pluginStates = { 'plugin.a': nestedA, 'plugin.b': nestedB } as any;

    const bundle = await model.toBundle();
    expect(() => JSON.stringify(bundle)).not.toThrow();

    const bundledBlockA = (bundle.blocks as any[]).find((b) => b.id === 'a');
    expect(bundledBlockA.pluginStates).toEqual({
      'plugin.a': nestedA,
      'plugin.b': nestedB,
    });

    doc.destroy();
  });

  it('supports per-plugin mutations by replacing a plugin record', async () => {
    const doc = new YjsDoc('plugin-states-proxy-set');
    const model = new DocumentModelImpl('model', doc);

    await model.insertBlock(makeBlock('a', 'alpha', 0), undefined);

    const blockA = (await model.getBlock('a'))!;

    const nestedObj = { mode: 'object', deep: { a: { b: [1, 2, { c: 'd' }] } } };
    (blockA.pluginStates as any)['plugin.object'] = nestedObj;

    const replaced = { mode: 'replaced', deep: { list: [{ x: 1 }, { x: 2 }] } };
    (blockA.pluginStates as any)['plugin.object'] = replaced;
    expect(toPlain((blockA.pluginStates as any)['plugin.object'])).toEqual(replaced);

    const bundle = await model.toBundle();
    const bundledBlockA = (bundle.blocks as any[]).find((b) => b.id === 'a');
    expect(bundledBlockA.pluginStates).toEqual({
      'plugin.object': replaced,
    });

    doc.destroy();
  });

  it('roundtrips deeply-nested pluginStates through bundle loadFromBundle', async () => {
    const doc1 = new YjsDoc('plugin-states-bundle-1');
    const model1 = new DocumentModelImpl('model', doc1);

    await model1.insertBlock(makeBlock('a', 'alpha', 0), undefined);

    const nested = {
      enabled: true,
      config: {
        deep: { a: { b: { c: { d: { e: 'z' } } } } },
        arr: [
          { id: 'x', values: [1, 2, 3] },
          { id: 'y', values: [0, null, false, 's'] },
        ],
      },
    };

    const blockA = (await model1.getBlock('a'))!;
    blockA.pluginStates = { 'plugin.deep': nested } as any;

    // Mutate by replacing the plugin record to ensure nested updates are persisted.
    const pluginDeep = (blockA.pluginStates as any)['plugin.deep'];
    const updated = deepClone(toPlain(pluginDeep));
    updated.config.deep.a.b.c.d.e = 'changed';
    updated.config.arr[1].values[3] = 'changed-too';
    (blockA.pluginStates as any)['plugin.deep'] = updated;

    const bundle1 = await model1.toBundle();
    expect(() => JSON.stringify(bundle1)).not.toThrow();

    const doc2 = new YjsDoc('plugin-states-bundle-2');
    const model2 = new DocumentModelImpl('model', doc2);
    await model2.loadFromBundle(bundle1);

    const bundle2 = await model2.toBundle();
    expect(bundle2).toEqual(bundle1);

    doc1.destroy();
    doc2.destroy();
  });

  it('supports initialize() for block meta + plugin state with nested CRDTText, and exports bundle as plain JSON', async () => {
    const doc = new YjsDoc('plugin-states-meta-init-text');
    const model = new DocumentModelImpl('model', doc);

    await model.insertBlock(makeBlock('a', 'alpha', 0), undefined);

    // Ensure meta exists so we can call initialize() (block meta starts undefined).
    await model.updateBlock('a', { meta: {} });

    const blockA = (await model.getBlock('a'))!;
    expect(blockA.meta).toBeDefined();

    // Create nested CRDTText explicitly via doc instantiator (strings stay plain strings).
    const metaText = doc.instantiator.createText();
    metaText.insert(0, 'hello-meta');
    (blockA.meta as any).node = { content: metaText };

    (blockA.pluginStates as any)['plugin.text'] = {};
    const pluginText = doc.instantiator.createText();
    pluginText.insert(0, 'hello-plugin');
    (blockA.pluginStates as any)['plugin.text'].node = { content: pluginText };

    expect(policyTextValueToString((blockA.meta as any).node.content)).toBe('hello-meta');
    expect(policyTextValueToString((blockA.pluginStates as any)['plugin.text'].node.content)).toBe('hello-plugin');

    const bundle = await model.toBundle();
    expect(() => JSON.stringify(bundle)).not.toThrow();

    const bundledBlockA = (bundle.blocks as any[]).find((b) => b.id === 'a');
    expect(bundledBlockA?.meta).toEqual({ node: { content: 'hello-meta' } });
    expect(bundledBlockA?.pluginStates).toEqual({ 'plugin.text': { node: { content: 'hello-plugin' } } });

    doc.destroy();
  });

  it('supports initialize() for meta + plugin state with nested CRDTText, then loadFromBundle restores same bundle payload', async () => {
    const doc1 = new YjsDoc('plugin-states-meta-init-text-bundle-1');
    const model1 = new DocumentModelImpl('model', doc1);

    await model1.insertBlock(makeBlock('a', 'alpha', 0), undefined);
    await model1.updateBlock('a', { meta: {} });

    const blockA1 = (await model1.getBlock('a'))!;
    const metaText1 = doc1.instantiator.createText();
    metaText1.insert(0, 'hello-meta');
    (blockA1.meta as any).node = { content: metaText1 };

    (blockA1.pluginStates as any)['plugin.text'] = {};
    const pluginText1 = doc1.instantiator.createText();
    pluginText1.insert(0, 'hello-plugin');
    (blockA1.pluginStates as any)['plugin.text'].node = { content: pluginText1 };

    const bundle1 = await model1.toBundle();

    const doc2 = new YjsDoc('plugin-states-meta-init-text-bundle-2');
    const model2 = new DocumentModelImpl('model', doc2);
    await model2.loadFromBundle(bundle1);

    const bundle2 = await model2.toBundle();
    expect(bundle2).toEqual(bundle1);

    // After loadFromBundle, the text may roundtrip as plain strings; ensure values still read correctly.
    const blockA2 = (await model2.getBlock('a'))!;
    expect(policyTextValueToString((blockA2.meta as any)?.node?.content)).toBe('hello-meta');
    expect(policyTextValueToString((blockA2.pluginStates as any)['plugin.text']?.node?.content)).toBe('hello-plugin');

    doc1.destroy();
    doc2.destroy();
  });

  it('syncs CRDTText edits (insert/delete) in meta + plugin state between two connected clients', async () => {
    const docA = new YjsDoc('plugin-states-meta-text-sync-a');
    const docB = new YjsDoc('plugin-states-meta-text-sync-b');
    const disconnect = connectDocs(docA, docB);

    const modelA = new DocumentModelImpl('model', docA);
    const modelB = new DocumentModelImpl('model', docB);

    await modelA.insertBlock(makeBlock('a', 'alpha', 0), undefined);
    await modelA.updateBlock('a', { meta: {} });

    const blockA0 = (await modelA.getBlock('a'))!;
    const metaText0 = docA.instantiator.createText();
    metaText0.insert(0, 'hello');
    (blockA0.meta as any).node = { content: metaText0 };

    (blockA0.pluginStates as any)['plugin.text'] = {};
    const pluginText0 = docA.instantiator.createText();
    pluginText0.insert(0, 'world');
    (blockA0.pluginStates as any)['plugin.text'].node = { content: pluginText0 };

    // Ensure B has the block + nested structures.
    const blockB0 = (await modelB.getBlock('a'))!;
    expect(blockB0.meta).toBeDefined();
    expect((blockB0.pluginStates as any)['plugin.text']).toBeDefined();

    // Mutate text from client B: insert in the middle and delete a range.
    const metaTextB = (blockB0.meta as any).node.content as any;
    const pluginTextB = (blockB0.pluginStates as any)['plugin.text'].node.content as any;

    metaTextB.insert(2, 'XX'); // heXXllo
    metaTextB.delete(1, 3); // remove eXX -> hllo

    pluginTextB.insert(3, '-'); // wor-ld
    pluginTextB.delete(0, 2); // remove wo -> r-ld

    // Let the update handlers exchange incremental updates.
    await new Promise((r) => setTimeout(r, 0));

    const blockA1 = (await modelA.getBlock('a'))!;
    const blockB1 = (await modelB.getBlock('a'))!;

    const metaTextA = (blockA1.meta as any).node.content;
    const metaTextB1 = (blockB1.meta as any).node.content;
    expect(policyTextValueToString(metaTextA)).toBe('hllo');
    expect(policyTextValueToString(metaTextB1)).toBe('hllo');

    const pluginTextA = (blockA1.pluginStates as any)['plugin.text'].node.content;
    const pluginTextB2 = (blockB1.pluginStates as any)['plugin.text'].node.content;
    expect(policyTextValueToString(pluginTextA)).toBe('r-ld');
    expect(policyTextValueToString(pluginTextB2)).toBe('r-ld');

    disconnect();
    docA.destroy();
    docB.destroy();
  });

  it('syncs nested in-place edits (meta + pluginStates) between two connected clients', async () => {
    const docA = new YjsDoc('record-proxy-nested-sync-a');
    const docB = new YjsDoc('record-proxy-nested-sync-b');
    const disconnect = connectDocs(docA, docB);

    const modelA = new DocumentModelImpl('model', docA);
    const modelB = new DocumentModelImpl('model', docB);

    await modelA.insertBlock(makeBlock('a', 'alpha', 0), undefined);

    const blockA0 = (await modelA.getBlock('a'))!;

    // Seed meta + pluginStates (these should be stored as CRDT maps/arrays).
    blockA0.meta = {
      label: 'seed',
      nested: { deep: { score: 1 } },
      list: ['x', 2],
    };
    blockA0.pluginStates = {
      'plugin.alpha': { nested: { score: 10 }, list: ['p', 1] },
    } as any;

    // Let initial state replicate.
    await new Promise((r) => setTimeout(r, 0));

    const blockB0 = (await modelB.getBlock('a'))!;
    expect(JSON.parse(JSON.stringify(blockB0.meta))).toEqual(JSON.parse(JSON.stringify(blockA0.meta)));
    expect(JSON.parse(JSON.stringify((blockB0.pluginStates as any)['plugin.alpha']))).toEqual(
      JSON.parse(JSON.stringify((blockA0.pluginStates as any)['plugin.alpha'])),
    );

    // Perform nested in-place edits (no reassigning root objects).
    (blockA0.meta as any).nested.deep.score = 2;
    (blockA0.meta as any).list.splice(1, 1);
    (blockA0.meta as any).list.splice(1, 0, 3);

    (blockA0.pluginStates as any)['plugin.alpha'].nested.score = 11;
    (blockA0.pluginStates as any)['plugin.alpha'].list.splice(1, 1);
    (blockA0.pluginStates as any)['plugin.alpha'].list.splice(1, 0, 7);

    // Add + mutate additional nested values (record, list, text) and ensure they sync.
    (blockA0.meta as any).addedRecord = { inner: { flag: true } };
    (blockA0.meta as any).addedList = [1, 2];
    (blockA0.meta as any).addedList.push(3);

    const metaText = docA.instantiator.createText();
    metaText.insert(0, 'hello-meta');
    (blockA0.meta as any).addedText = metaText;
    metaText.insert(5, '-X'); // hello-X-meta

    (blockA0.pluginStates as any)['plugin.alpha'].addedRecord = { inner: { flag: true } };
    (blockA0.pluginStates as any)['plugin.alpha'].addedList = [10, 20];
    (blockA0.pluginStates as any)['plugin.alpha'].addedList.splice(1, 1, 99);

    const pluginText = docA.instantiator.createText();
    pluginText.insert(0, 'hello-plugin');
    (blockA0.pluginStates as any)['plugin.alpha'].addedText = pluginText;
    pluginText.delete(5, 1); // helloplugin -> remove '-'/space-like if present (here removes 'o')

    // Assert mutations actually applied locally (prevents false positives where nothing changed).
    expect((blockA0.meta as any).nested.deep.score).toBe(2);
    expect((blockA0.meta as any).list[1]).toBe(3);
    expect((blockA0.meta as any).addedRecord.inner.flag).toBe(true);
    expect((blockA0.meta as any).addedList).toEqual([1, 2, 3]);
    expect(policyTextValueToString((blockA0.meta as any).addedText)).toBe('hello-X-meta');

    expect((blockA0.pluginStates as any)['plugin.alpha'].nested.score).toBe(11);
    expect((blockA0.pluginStates as any)['plugin.alpha'].list[1]).toBe(7);
    expect((blockA0.pluginStates as any)['plugin.alpha'].addedRecord.inner.flag).toBe(true);
    expect((blockA0.pluginStates as any)['plugin.alpha'].addedList).toEqual([10, 99]);
    expect(policyTextValueToString((blockA0.pluginStates as any)['plugin.alpha'].addedText)).toBe('helloplugin');

    await new Promise((r) => setTimeout(r, 0));

    const blockB1 = (await modelB.getBlock('a'))!;
    expect(JSON.parse(JSON.stringify(blockB1.meta))).toEqual(JSON.parse(JSON.stringify(blockA0.meta)));
    expect(JSON.parse(JSON.stringify((blockB1.pluginStates as any)['plugin.alpha']))).toEqual(
      JSON.parse(JSON.stringify((blockA0.pluginStates as any)['plugin.alpha'])),
    );

    // Concrete property checks on receiver (ensure values are *actually* updated, not just equal-by-chance).
    expect((blockB1.meta as any).nested.deep.score).toBe(2);
    expect((blockB1.meta as any).list[1]).toBe(3);
    expect((blockB1.meta as any).addedRecord.inner.flag).toBe(true);
    expect((blockB1.meta as any).addedList).toEqual([1, 2, 3]);
    expect(policyTextValueToString((blockB1.meta as any).addedText)).toBe('hello-X-meta');

    expect((blockB1.pluginStates as any)['plugin.alpha'].nested.score).toBe(11);
    expect((blockB1.pluginStates as any)['plugin.alpha'].list[1]).toBe(7);
    expect((blockB1.pluginStates as any)['plugin.alpha'].addedRecord.inner.flag).toBe(true);
    expect((blockB1.pluginStates as any)['plugin.alpha'].addedList).toEqual([10, 99]);
    expect(policyTextValueToString((blockB1.pluginStates as any)['plugin.alpha'].addedText)).toBe('helloplugin');

    disconnect();
    docA.destroy();
    docB.destroy();
  });
});
