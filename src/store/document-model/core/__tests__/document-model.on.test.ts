import * as Y from 'yjs';
import { DocumentModelImpl } from '@/store/document-model';
import { YjsDoc } from '@/store/crdt-doc';
import type { BlockCore, Link } from '@/store/document-model';
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

const defer = <T = void>() => {
  let resolve!: (value: T) => void;
  let reject!: (err: any) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const waitForEvent = async (subscribe: (cb: () => void) => Unsubscribe, timeoutMs = 250) => {
  const d = defer<void>();
  const unsub = subscribe(() => d.resolve());
  const timer = setTimeout(() => d.reject(new Error('Timed out waiting for event')), timeoutMs);
  try {
    await d.promise;
  } finally {
    clearTimeout(timer);
    unsub();
  }
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

describe('DocumentModelImpl.on', () => {
  it('fires blocks.update for block inserts and updates', async () => {
    const doc = new YjsDoc('room-on-blocks');
    const model = new DocumentModelImpl('model', doc);

    const calls: any[] = [];
    const unsub = model.on('blocks.update', (e) => calls.push(e));

    await model.insertBlock(makeBlock('a', 'alpha'), undefined);
    await model.updateBlock('a', { type: 'alpha2' });

    unsub();
    expect(calls.length).toBeGreaterThanOrEqual(1);
    expect(calls.some((c) => c?.path === 'blocks')).toBe(true);

    doc.destroy();
  });

  it('fires links.update for link create and remove', async () => {
    const doc = new YjsDoc('room-on-links');
    const model = new DocumentModelImpl('model', doc);

    await model.insertBlock(makeBlock('a'), undefined);
    await model.insertBlock(makeBlock('b'), undefined);

    const calls: any[] = [];
    const unsub = model.on('links.update', (e) => calls.push(e));

    await model.createLink(makeLink('l1', 'a', 'b'));
    await model.removeLink('l1');

    unsub();
    expect(calls.length).toBeGreaterThanOrEqual(1);
    expect(calls.some((c) => c?.path === 'links')).toBe(true);

    doc.destroy();
  });

  it('fires blocks.update on remote client when synced client modifies blocks', async () => {
    const docA = new YjsDoc('room-on-sync');
    const docB = new YjsDoc('room-on-sync');
    const disconnect = connectDocs(docA, docB);

    const modelA = new DocumentModelImpl('model', docA);
    const modelB = new DocumentModelImpl('model', docB);

    const wait = waitForEvent((cb) => modelB.on('blocks.update', cb));

    await modelA.insertBlock(makeBlock('a', 'alpha'), undefined);
    await wait;

    disconnect();
    docA.destroy();
    docB.destroy();
  });
});

