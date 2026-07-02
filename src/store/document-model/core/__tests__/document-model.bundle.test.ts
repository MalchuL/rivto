import * as Y from 'yjs';
import { DocumentModelImpl } from '@/store/document-model';
import { YjsDoc } from '@/store/crdt-doc';
import type { BlockCore, Link } from '@/store/document-model';
import type { Unsubscribe } from '@/store/crdt-doc';

const makeBlock = (id: string, type = 'block', order = 0): BlockCore =>
  ({
    id,
    type,
    order,
    meta: undefined,
  }) as any;

const makeLink = (id: string, fromId: string, toId: string): Link =>
  ({
    id,
    from: { blockId: fromId },
    to: { blockId: toId },
    meta: undefined,
  }) as any;

const assertNoYjsTypes = (value: any, path = '$') => {
  if (value === null || value === undefined) return;
  if (typeof value !== 'object') return;

  if (value instanceof Y.Map) throw new Error(`Found Y.Map at ${path}`);
  if (value instanceof Y.Array) throw new Error(`Found Y.Array at ${path}`);
  if (value instanceof Y.Text) throw new Error(`Found Y.Text at ${path}`);

  if (Array.isArray(value)) {
    value.forEach((v, i) => assertNoYjsTypes(v, `${path}[${i}]`));
    return;
  }

  Object.entries(value).forEach(([k, v]) => assertNoYjsTypes(v, `${path}.${k}`));
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

describe('DocumentModelImpl bundle roundtrip', () => {
  it('toBundle returns JSON-serializable data and loadFromBundle restores same state', async () => {
    const doc1 = new YjsDoc('bundle-doc-1');
    const model1 = new DocumentModelImpl('model', doc1);

    await model1.insertBlock(makeBlock('a', 'alpha', 0), undefined);
    await model1.insertBlock(makeBlock('b', 'beta', 1), undefined);

    await model1.updateBlock('a', {
      position: { x: 10, y: 20 },
      size: { width: 300, height: 200 },
      zIndex: 5,
      connectedWith: 'b',
      meta: {
        label: 'hello',
        nested: { score: 1, deep: { ok: true } },
        list: ['x', 2],
      },
    });

    // Plugin states (must roundtrip as pure JSON, no Yjs types in the bundle)
    const blockA = (await model1.getBlock('a'))!;
    (blockA as any).pluginStates = {
      'plugin.test': {
        enabled: true,
        config: { mode: 'fast', nested: { retries: 2 } },
      },
    };

    // Link with ports (must roundtrip)
    const linkWithPorts: Link = {
      ...makeLink('l1', 'a', 'b'),
      from: { blockId: 'a', port: 'out' },
      to: { blockId: 'b', port: 'in' },
    } as any;

    await model1.createLink(linkWithPorts);
    // Link meta (plain JSON)
    const links1 = await model1.getLinks();
    const link1 = links1.find((l) => l.id === 'l1')!;
    link1.meta =
      {
        kind: 'rel',
        nested: { ok: true },
      } as any;

    const bundle = await model1.toBundle();

    // Should be JSON stringify-able, and contain no Yjs types.
    expect(() => JSON.stringify(bundle)).not.toThrow();
    assertNoYjsTypes(bundle);

    // Spot-check: ports + pluginStates are present in the bundle.
    const bundledBlockA = (bundle.blocks as any[]).find((b) => b.id === 'a');
    expect(bundledBlockA).toBeDefined();
    expect(bundledBlockA.pluginStates).toEqual({
      'plugin.test': {
        enabled: true,
        config: { mode: 'fast', nested: { retries: 2 } },
      },
    });

    const bundledLink1 = (bundle.links as any[]).find((l) => l.id === 'l1');
    expect(bundledLink1).toBeDefined();
    expect(bundledLink1.from).toEqual({ blockId: 'a', port: 'out' });
    expect(bundledLink1.to).toEqual({ blockId: 'b', port: 'in' });

    const doc2 = new YjsDoc('bundle-doc-2');
    const model2 = new DocumentModelImpl('model', doc2);

    await model2.loadFromBundle(bundle);

    const bundle2 = await model2.toBundle();

    // Roundtrip equality: serializing after load yields same pure JSON payload.
    expect(bundle2).toEqual(bundle);

    doc1.destroy();
    doc2.destroy();
  });

  it('restores via loadFromBundle on one client and syncs to the connected client', async () => {
    const docA = new YjsDoc('bundle-doc-sync-a');
    const docB = new YjsDoc('bundle-doc-sync-b');
    const disconnect = connectDocs(docA, docB);

    const modelA = new DocumentModelImpl('model', docA);
    const modelB = new DocumentModelImpl('model', docB);

    // Build initial content on A (B will sync).
    await modelA.insertBlock(makeBlock('a', 'alpha', 0), undefined);
    await modelA.insertBlock(makeBlock('b', 'beta', 1), undefined);

    await modelA.updateBlock('a', {
      position: { x: 10, y: 20 },
      size: { width: 300, height: 200 },
      zIndex: 5,
      connectedWith: 'b',
      meta: { label: 'hello', nested: { score: 1 } },
    });

    // Plugin states on A
    const blockA = (await modelA.getBlock('a'))!;
    (blockA as any).pluginStates = {
      'plugin.test': {
        enabled: true,
        config: { mode: 'fast', nested: { retries: 2 } },
      },
    };

    // Link ports on A
    await modelA.createLink(
      ({
        id: 'l1',
        from: { blockId: 'a', port: 'out' },
        to: { blockId: 'b', port: 'in' },
        meta: undefined,
      } as any) satisfies Link,
    );

    const bundle = await modelA.toBundle();
    expect(() => JSON.stringify(bundle)).not.toThrow();
    assertNoYjsTypes(bundle);

    // Clear both docs by loading an empty bundle on A (propagates to B).
    await modelA.loadFromBundle({ version: 1, meta: {}, blocks: [], links: [], plugins: {} });
    expect(await modelA.toBundle()).toEqual({ version: 1, meta: {}, blocks: [], links: [], plugins: {} });

    // Restore on A only; B must converge via sync.
    await modelA.loadFromBundle(bundle);

    const bundleA2 = await modelA.toBundle();
    const bundleB2 = await modelB.toBundle();
    modelA.instantiator.isPlainRecord(bundleA2);
    modelA.instantiator.isPlainRecord(bundleB2);

    expect(bundleA2).toEqual(bundle);
    expect(bundleB2).toEqual(bundle);

    disconnect();
    docA.destroy();
    docB.destroy();
  });

  it('syncs meta and plugin states between connected clients', async () => {
    const docA = new YjsDoc('sync-meta-plugin-a');
    const docB = new YjsDoc('sync-meta-plugin-b');
    const disconnect = connectDocs(docA, docB);

    const modelA = new DocumentModelImpl('model', docA);
    const modelB = new DocumentModelImpl('model', docB);

    // Create blocks on A
    await modelA.insertBlock(makeBlock('block1', 'test-block', 0), undefined);
    await modelA.insertBlock(makeBlock('block2', 'test-block', 1), undefined);

    // Set meta and plugin states on A using updateBlock
    await modelA.updateBlock('block1', {
      meta: {
        label: 'Block One',
        category: 'input',
        nested: { enabled: true, config: { retries: 3 } }
      },
      pluginStates: {
        'plugin.input': {
          enabled: true,
          config: { mode: 'auto', timeout: 5000 }
        },
        'plugin.validation': {
          enabled: false,
          config: { rules: ['required', 'email'] }
        }
      }
    });

    await modelA.updateBlock('block2', {
      meta: {
        label: 'Block Two',
        category: 'output',
        nested: { enabled: false, config: { format: 'json' } }
      },
      pluginStates: {
        'plugin.output': {
          enabled: true,
          config: { target: 'api', endpoint: '/process' }
        }
      }
    });

    // Wait for sync and verify on client B
    const blockB1 = await modelB.getBlock('block1');
    const blockB2 = await modelB.getBlock('block2');

    expect(blockB1).toBeDefined();
    expect(blockB2).toBeDefined();

    // Verify meta states are synced
    expect(blockB1!.meta).toEqual({
      label: 'Block One',
      category: 'input',
      nested: { enabled: true, config: { retries: 3 } }
    });

    expect(blockB2!.meta).toEqual({
      label: 'Block Two',
      category: 'output',
      nested: { enabled: false, config: { format: 'json' } }
    });

    // Verify plugin states are synced
    expect((blockB1 as any).pluginStates).toEqual({
      'plugin.input': {
        enabled: true,
        config: { mode: 'auto', timeout: 5000 }
      },
      'plugin.validation': {
        enabled: false,
        config: { rules: ['required', 'email'] }
      }
    });

    expect((blockB2 as any).pluginStates).toEqual({
      'plugin.output': {
        enabled: true,
        config: { target: 'api', endpoint: '/process' }
      }
    });

    // Test updates sync both ways
    // Update meta and plugin states on B
    await modelB.updateBlock('block1', {
      meta: {
        label: 'Block One Updated',
        category: 'input',
        nested: { enabled: true, config: { retries: 5 } }
      },
      pluginStates: {
        'plugin.input': {
          enabled: true,
          config: { mode: 'auto', timeout: 10000 }
        },
        'plugin.validation': {
          enabled: true,
          config: { rules: ['required', 'email'] }
        }
      }
    });

    // Wait for sync back to A
    const blockA1Updated = await modelA.getBlock('block1');

    expect(blockA1Updated!.meta).toEqual({
      label: 'Block One Updated',
      category: 'input',
      nested: { enabled: true, config: { retries: 5 } }
    });

    expect((blockA1Updated as any).pluginStates).toEqual({
      'plugin.input': {
        enabled: true,
        config: { mode: 'auto', timeout: 10000 }
      },
      'plugin.validation': {
        enabled: true,
        config: { rules: ['required', 'email'] }
      }
    });

    disconnect();
    docA.destroy();
    docB.destroy();
  });
});

