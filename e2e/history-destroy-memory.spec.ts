import { expect, test } from "@playwright/test";
import type { YjsDoc, YjsDocumentRegistry } from "@chulane/crdt-doc";

/** Demo registry and retained history handle used by the collection probe. */
interface HistoryDestroyMemoryWindow extends Window {
  readonly __rivtoDocuments: { readonly registry: YjsDocumentRegistry };
  historyProbe: { readonly history: object; readonly document: WeakRef<object> };
}

for (const explicit of [true, false]) {
  test(`history does not retain its document after ${explicit ? "history" : "document"} destruction`, async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== "chromium",
      "The forced garbage collection protocol is Chromium-only",
    );
    await page.goto(`/?embeddings=1&room=history-destroy-${crypto.randomUUID()}`);
    await expect(
      page.locator('[data-document-pane="source"] [data-block-content]').first(),
    ).toBeVisible();
    await page.evaluate(async (destroyHistory) => {
      const host = window as unknown as HistoryDestroyMemoryWindow;
      const Document = host.__rivtoDocuments.registry.root.constructor as typeof YjsDoc;
      const adapter = new Document("history-destroy");
      const map = adapter.getMap("root");
      const history = adapter.createUndoManager([map], undefined, 1);
      adapter.transact(() => map.set("payload", "x".repeat(1_000_000)));
      host.historyProbe = { history, document: new WeakRef(adapter.doc) };
      if (destroyHistory) {
        history.destroy();
      }
      await adapter.destroy();
    }, explicit);
    const session = await page.context().newCDPSession(page);
    await expect
      .poll(async () => {
        await session.send("HeapProfiler.collectGarbage");
        return page.evaluate(() =>
          Boolean((window as unknown as HistoryDestroyMemoryWindow).historyProbe.document.deref()),
        );
      })
      .toBe(false);
    await session.detach();
  });
}
