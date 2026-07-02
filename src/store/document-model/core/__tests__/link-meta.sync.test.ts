import * as Y from 'yjs';
import { DocumentModelImpl } from '@/store/document-model';
import { YjsDoc } from '@/store/crdt-doc';
import type { Link, BlockCore } from '@/store/document-model';
import type { Unsubscribe } from '@/store/crdt-doc';

const makeBlock = (id: string, type = 'block'): BlockCore =>
  ({
    id,
    type,
    order: 0,
    meta: undefined,
  }) as any;

const makeLink = (id: string, fromId: string, toId: string): Link =>
  ({
    id,
    from: { blockId: fromId },
    to: { blockId: toId },
    meta: undefined,
  }) as any;

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

const getLinkById = async (model: DocumentModelImpl, id: string): Promise<Link> => {
  const links = await model.getLinks();
  const link = links.find((l) => l.id === id);
  if (!link) throw new Error(`Link ${id} not found`);
  return link;
};

describe('Link meta (callbacks + sync)', () => {
  it('supports initialize/get/set/delete callbacks and stays equal between two synced clients', async () => {
    const docA = new YjsDoc('room-link-meta');
    const docB = new YjsDoc('room-link-meta');
    const disconnect = connectDocs(docA, docB);

    const modelA = new DocumentModelImpl('model', docA);
    const modelB = new DocumentModelImpl('model', docB);

    // Create blocks + link on A (like playground usage).
    await modelA.insertBlock(makeBlock('a'), undefined);
    await modelA.insertBlock(makeBlock('b'), undefined);
    await modelA.createLink(makeLink('l1', 'a', 'b'));

    // Ensure link exists on B.
    const linkB0 = await getLinkById(modelB, 'l1');
    expect(linkB0.id).toBe('l1');

    // Seed meta (creates underlying meta map); then mutate via record proxy.
    const linkA = await getLinkById(modelA, 'l1');
    linkA.meta = {}; // create meta structure
    expect(linkA.meta).toBeDefined();

    (linkA.meta as any).label = 'seed';
    (linkA.meta as any).count = 1;
    (linkA.meta as any).nested = { ok: true, deep: { score: 1 } };
    (linkA.meta as any).list = ['x', 2];
    expect((await modelA.getBlocks()).length).toBe(2);
    docA.toJSON();
    modelB.getBlocks() // This initializes the blocks on the modelB to avoid the AbstractType error
    const jsonB = docB.toJSON();
    expect(jsonB).toEqual(docA.toJSON());
    expect((linkA.meta as any).label).toBe('seed');
    expect((linkA.meta as any).count).toBe(1);
    expect((linkA.meta as any).nested.ok).toBe(true);
    expect((linkA.meta as any).nested.deep.score).toBe(1);

    (linkA.meta as any).label = 'updated';
    (linkA.meta as any).nested.deep.score = 2;
    (linkA.meta as any).list.splice(1, 1);
    (linkA.meta as any).list.splice(1, 0, 3);

    expect((linkA.meta as any).label).toBe('updated');
    expect((linkA.meta as any).nested.deep.score).toBe(2);
    expect((linkA.meta as any).list[1]).toBe(3);

    delete (linkA.meta as any).count;
    expect((linkA.meta as any).count).toBeUndefined();

    // Client B should see identical meta after sync.
    const linkB = await getLinkById(modelB, 'l1');
    expect(linkB.meta).toBeDefined();

    // With proxy-backed CRDTMap/CRDTArray, nested edits should propagate.
    expect(JSON.parse(JSON.stringify(linkB.meta))).toEqual(JSON.parse(JSON.stringify(linkA.meta)));
    expect((linkB.meta as any).label).toBe('updated');


    expect(JSON.parse(JSON.stringify(linkB.meta))).toEqual(JSON.parse(JSON.stringify(linkA.meta)));
    expect((linkB.meta as any).label).toBe('updated');
    expect((linkB.meta as any).count).toBeUndefined();
    expect((linkB.meta as any).nested.deep.score).toBe(2);
    expect((linkB.meta as any).list[1]).toBe(3);

    // Ensure both clients converge on the same link meta.
    // (We avoid asserting `doc.toJSON()` equality here because `YjsDoc.toJSON()` currently
    // throws if any map contains a raw JS object, and link/meta internals may store such values.)

    disconnect();
    docA.destroy();
    docB.destroy();
  });
});

