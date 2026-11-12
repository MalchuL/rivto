import { collectGarbage } from "./fixtures/collect-garbage";
import { expect, test } from "@playwright/test";
import type { EditorStorage, ReactEditorApi } from "@chulane/rivto-react";
import type { YjsDoc, YjsDocumentRegistry } from "@chulane/crdt-doc";
import type { DocumentStorage } from "@chulane/document-model";
import type { DemoDatabase } from "../demo/src/database";

/** Demo resources used to verify saved updates across a document reopen. */
interface DatabaseMemoryWindow extends Window {
  readonly __rivtoDocuments: {
    readonly database: DemoDatabase;
    readonly storage: DocumentStorage;
    readonly editor: EditorStorage;
    readonly registry: YjsDocumentRegistry;
    readonly panes: Set<{ readonly id: string; readonly reactEditor: ReactEditorApi }>;
  };
  pendingFirstUpdate: Uint8Array;
}

/** Dependencies formerly retained by a completed document unsubscribe. */
interface CompletedSubscriptionProbe {
  readonly document: WeakRef<object>;
  readonly payload: WeakRef<object>;
}

test("a completed document unsubscribe releases its dependencies", async ({
  page,
  browserName,
}) => {
  await page.goto(`/?embeddings=1&room=unsubscribed-document-${crypto.randomUUID()}`);
  await expect(
    page.locator('[data-document-pane="source"] [data-block-content]').first(),
  ).toHaveText("Source text");
  const calls = await page.evaluate(() => {
    const host = (window as unknown as DatabaseMemoryWindow).__rivtoDocuments;
    const Document = host.registry.root.constructor as typeof YjsDoc;
    const adapter = new Document("unsubscribed-document-probe");
    const data = { bytes: new Uint8Array(1_000_000) };
    let count = 0;
    const unsubscribe = adapter.on("update", () => {
      count += data.bytes.length;
    });
    adapter.getMap("root").set("first", 1);
    unsubscribe();
    unsubscribe();
    adapter.getMap("root").set("second", 2);
    Reflect.set(window, "completedSubscriptionProbe", {
      unsubscribe,
      document: new WeakRef(adapter.doc),
      payload: new WeakRef(data),
    });
    return count;
  });
  expect(calls).toBe(1_000_000);
  if (browserName === "chromium") {
    const session = await page.context().newCDPSession(page);
    await collectGarbage(page, session);
    const retained = await page.evaluate(() => {
      const probe = Reflect.get(window, "completedSubscriptionProbe") as CompletedSubscriptionProbe;
      return { document: !!probe.document.deref(), payload: !!probe.payload.deref() };
    });
    expect(retained).toEqual({ document: false, payload: false });
    await session.detach();
  }
});
