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

const sortedBlocksView = async (model: DocumentModelImpl) => {
  const blocks = await model.getBlocks();
  return blocks
    .slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((b) => ({ id: b.id, type: b.type, order: b.order ?? 0 }));
};

const sortedLinksView = async (model: DocumentModelImpl) => {
  const links = await model.getLinks();
  return links
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((l) => ({
      id: l.id,
      // LinkPortProxy currently yields `null` for absent ports; normalize for stable assertions.
      from: { blockId: l.from.blockId, port: (l.from.port ?? undefined) as any },
      to: { blockId: l.to.blockId, port: (l.to.port ?? undefined) as any },
    }));
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

describe('DocumentModelImpl', () => {
  describe('single-client correctness', () => {
    it('inserts, moves, updates, and removes blocks with contiguous ordering', async () => {
      const doc = new YjsDoc('doc-single');
      const model = new DocumentModelImpl('model-single', doc);

      await model.insertBlock(makeBlock('a', 'alpha'), undefined); // append
      await model.insertBlock(makeBlock('b', 'beta'), undefined); // append
      await model.insertBlock(makeBlock('c', 'gamma'), null); // start

      expect(await sortedBlocksView(model)).toEqual([
        { id: 'c', type: 'gamma', order: 0 },
        { id: 'a', type: 'alpha', order: 1 },
        { id: 'b', type: 'beta', order: 2 },
      ]);

      await model.moveBlock('b', null); // move to start
      expect(await sortedBlocksView(model)).toEqual([
        { id: 'b', type: 'beta', order: 0 },
        { id: 'c', type: 'gamma', order: 1 },
        { id: 'a', type: 'alpha', order: 2 },
      ]);

      await model.updateBlock('c', { type: 'gamma-updated', zIndex: 7 });
      expect(await sortedBlocksView(model)).toEqual([
        { id: 'b', type: 'beta', order: 0 },
        { id: 'c', type: 'gamma-updated', order: 1 },
        { id: 'a', type: 'alpha', order: 2 },
      ]);

      await model.removeBlock('c');
      expect(await sortedBlocksView(model)).toEqual([
        { id: 'b', type: 'beta', order: 0 },
        { id: 'a', type: 'alpha', order: 1 },
      ]);

      doc.destroy();
    });

    it('creates and removes links', async () => {
      const doc = new YjsDoc('doc-links');
      const model = new DocumentModelImpl('model-links', doc);

      await model.insertBlock(makeBlock('a'), undefined);
      await model.insertBlock(makeBlock('b'), undefined);

      await model.createLink(makeLink('l1', 'a', 'b'));
      expect(await sortedLinksView(model)).toEqual([
        { id: 'l1', from: { blockId: 'a', port: undefined }, to: { blockId: 'b', port: undefined } },
      ]);

      await model.removeLink('l1');
      expect(await sortedLinksView(model)).toEqual([]);

      doc.destroy();
    });
  });

  describe('two-client sync (mirrors playground behavior)', () => {
    it('keeps two clients in sync while online (blocks + links)', async () => {
      const docA = new YjsDoc('room');
      const docB = new YjsDoc('room');
      const disconnect = connectDocs(docA, docB);

      const modelA = new DocumentModelImpl('model', docA);
      const modelB = new DocumentModelImpl('model', docB);

      // Client A edits
      await modelA.insertBlock(makeBlock('a', 'alpha'), undefined);
      await modelA.insertBlock(makeBlock('b', 'beta'), undefined);

      expect(await sortedBlocksView(modelB)).toEqual(await sortedBlocksView(modelA));

      // Client B edits (insert at beginning)
      await modelB.insertBlock(makeBlock('c', 'gamma'), null);
      expect(await sortedBlocksView(modelA)).toEqual(await sortedBlocksView(modelB));

      // Client A creates a link; both should see it
      await modelA.createLink(makeLink('l1', 'a', 'b'));
      expect(await sortedLinksView(modelA)).toEqual(await sortedLinksView(modelB));

      // Client B updates block; both should see the new type
      await modelB.updateBlock('a', { type: 'alpha-updated' });
      expect(await sortedBlocksView(modelA)).toEqual(await sortedBlocksView(modelB));

      disconnect();
      docA.destroy();
      docB.destroy();
    });

    it('syncs block meta updates between clients', async () => {
      const docA = new YjsDoc('room-meta');
      const docB = new YjsDoc('room-meta');
      const disconnect = connectDocs(docA, docB);

      const modelA = new DocumentModelImpl('model', docA);
      const modelB = new DocumentModelImpl('model', docB);

      await modelA.insertBlock(makeBlock('a', 'alpha'), undefined);

      const metaA = {
        label: 'hello',
        count: 1,
        nested: { ok: true },
        list: ['x', 2, false],
      };

      await modelA.updateBlock('a', { meta: metaA });

      const blockB = await modelB.getBlock('a');
      expect(blockB).toBeDefined();
      expect(JSON.parse(JSON.stringify(blockB!.meta))).toEqual(metaA);

      const metaB = {
        label: 'updated-from-b',
        count: 2,
        nested: { ok: false, reason: 'changed' },
      };

      await modelB.updateBlock('a', { meta: metaB });

      const blockA = await modelA.getBlock('a');
      expect(blockA).toBeDefined();
      expect(JSON.parse(JSON.stringify(blockA!.meta))).toEqual(metaB);
      docA.toJSON();
      docB.toJSON();
      disconnect();
      docA.destroy();
      docB.destroy();

    });

    it('syncs nested meta field updates and keeps documents equal', async () => {
      const docA = new YjsDoc('room-meta-nested');
      const docB = new YjsDoc('room-meta-nested');
      const disconnect = connectDocs(docA, docB);

      const modelA = new DocumentModelImpl('model', docA);
      const modelB = new DocumentModelImpl('model', docB);

      await modelA.insertBlock(makeBlock('a', 'alpha'), undefined);

      // Seed meta with nested structures.
      await modelA.updateBlock('a', {
        meta: {
          label: 'seed',
          nested: { ok: true, deep: { score: 1 } },
          list: ['x', { inner: 1 }],
        },
      });

      // Update only a nested field: read JSON snapshot, tweak, write back.
      const blockA = await modelA.getBlock('a');
      expect(blockA?.meta).toBeDefined();
      const jsonA = JSON.parse(JSON.stringify(blockA!.meta)) as any;
      jsonA.nested.deep.score = 2; // nested field update
      jsonA.list[1].inner = 42; // nested in array update
      blockA!.meta = jsonA;

      // Client B should converge to same nested meta.
      const blockB = await modelB.getBlock('a');
      expect(JSON.parse(JSON.stringify(blockB?.meta))).toEqual(JSON.parse(JSON.stringify(blockA!.meta)));

      // Full document snapshots should be equal as well.
      expect(docA.toJSON()).toEqual(docB.toJSON());

      disconnect();
      docA.destroy();
      docB.destroy();
    });

    it('propagates meta assignment to other client (assert only on receiver)', async () => {
      const docA = new YjsDoc('room-meta-receiver-assert-a');
      const docB = new YjsDoc('room-meta-receiver-assert-b');
      const disconnect = connectDocs(docA, docB);

      const modelA = new DocumentModelImpl('model', docA);
      const modelB = new DocumentModelImpl('model', docB);

      await modelA.insertBlock(makeBlock('a', 'alpha'), undefined);

      const expected = {
        label: 'seed',
        nested: { deep: { score: 123 } },
        list: ['x', 2, { inner: true }],
      };

      // Set on A.
      await modelA.updateBlock('a', { meta: expected });

      // Let update handlers exchange incremental updates.
      await new Promise((r) => setTimeout(r, 0));

      // Assert only on B (no comparison against A’s current state).
      const blockB = await modelB.getBlock('a');
      expect(blockB).toBeDefined();
      expect(JSON.parse(JSON.stringify(blockB!.meta))).toEqual(expected);
      expect((blockB!.meta as any).nested.deep.score).toBe(123);
      expect((blockB!.meta as any).list[0]).toBe('x');
      expect((blockB!.meta as any).list[2].inner).toBe(true);

      disconnect();
      docA.destroy();
      docB.destroy();
    });

    it('propagates reorder operations between clients', async () => {
      const docA = new YjsDoc('room-reorder');
      const docB = new YjsDoc('room-reorder');
      const disconnect = connectDocs(docA, docB);

      const modelA = new DocumentModelImpl('model', docA);
      const modelB = new DocumentModelImpl('model', docB);

      await modelA.insertBlock(makeBlock('a'), undefined);
      await modelA.insertBlock(makeBlock('b'), undefined);
      await modelA.insertBlock(makeBlock('c'), undefined);

      // Reorder from client B
      await modelB.moveBlock('a', 'c'); // move 'a' after 'c' => b, c, a

      expect(await sortedBlocksView(modelA)).toEqual([
        { id: 'b', type: 'block', order: 0 },
        { id: 'c', type: 'block', order: 1 },
        { id: 'a', type: 'block', order: 2 },
      ]);
      expect(await sortedBlocksView(modelB)).toEqual(await sortedBlocksView(modelA));

      disconnect();
      docA.destroy();
      docB.destroy();
    });
  });
});

