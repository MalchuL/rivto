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

/** Weak references held alongside destroyed editor-storage objects. */
interface DestroyedEditorStorageProbe {
  readonly payload: WeakRef<object>;
  readonly source: WeakRef<object>;
  readonly disposableResolver: WeakRef<object>;
}

test("destroyed editor storage and resolver release their borrowed data", async ({
  page,
  browserName,
}) => {
  await page.goto(`/?embeddings=1&room=destroyed-editor-storage-${crypto.randomUUID()}`);
  await expect(
    page.locator('[data-document-pane="source"] [data-block-content]').first(),
  ).toHaveText("Source text");
  const result = await page.evaluate(async () => {
    const host = (window as unknown as DatabaseMemoryWindow).__rivtoDocuments;
    const Storage = host.editor.constructor as typeof EditorStorage;
    const data = { bytes: new Uint8Array(1_000_000) };
    const payload = new WeakRef(data);
    const storage = new Storage({ lookupDocumentIds: async () => [String(data.bytes.length)] });
    await storage.destroy();
    const source = new Storage();
    const sourceReference = new WeakRef(source);
    const resolver = source.blockReferences;
    await source.destroy();
    const disposableSource = new Storage();
    const disposableResolver = disposableSource.blockReferences;
    const resolverReference = new WeakRef(disposableResolver);
    const cleanup = disposableResolver.subscribeBlockLocation(
      { documentId: "source", blockId: "target" },
      () => {},
    );
    await disposableSource.destroy();
    Reflect.set(window, "destroyedEditorStorageProbe", {
      storage,
      resolver,
      cleanup,
      payload,
      source: sourceReference,
      disposableResolver: resolverReference,
    });
    try {
      await resolver.resolveBlock({ documentId: "source", blockId: "target" });
      return false;
    } catch {
      return storage.getEditors().length === 0;
    }
  });
  expect(result).toBe(true);
  if (browserName === "chromium") {
    const session = await page.context().newCDPSession(page);
    for (let index = 0; index < 8; index++) {
      await page.waitForTimeout(0);
      await session.send("HeapProfiler.collectGarbage");
    }
    const retained = await page.evaluate(() => {
      const probe = Reflect.get(
        window,
        "destroyedEditorStorageProbe",
      ) as DestroyedEditorStorageProbe;
      return {
        payload: probe.payload.deref() !== undefined,
        source: probe.source.deref() !== undefined,
        disposableResolver: probe.disposableResolver.deref() !== undefined,
      };
    });
    expect(retained).toEqual({ payload: false, source: false, disposableResolver: false });
    await session.detach();
  }
});
