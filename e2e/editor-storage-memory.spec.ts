import { collectGarbage } from "./fixtures/collect-garbage";
import { expect, test } from "@playwright/test";
import type { EditorStorage, ReactEditorApi } from "@chulane/rivto-react";
import type { YjsDoc, YjsDocumentRegistry } from "@chulane/crdt-doc";
import type { DocumentStorage } from "@chulane/document-model";
import type { BlockReferenceResolver } from "@chulane/rivto";
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

/**
 * Retains a host availability callback after its resolver has been destroyed.
 *
 * @returns The page holds the callback and a weak reference to its former source.
 */
function captureRetainedLocationCallback(): void {
  const host = (window as unknown as DatabaseMemoryWindow).__rivtoDocuments;
  const Resolver = host.editor.blockReferences.constructor as typeof BlockReferenceResolver;
  const source = {
    getDocument: () => undefined,
    getDocuments: () => [],
    getEditors: () => [],
    subscribeDocuments: (listener: () => void) => {
      Reflect.set(window, "retainedLocationCallback", listener);
      return () => {};
    },
  };
  const reference = new WeakRef(source);
  const resolver = new Resolver(source, {});
  resolver.subscribeBlockLocation({ documentId: "source", blockId: "target" }, () => {});
  resolver.destroy();
  Reflect.set(window, "retainedLocationSource", reference);
}

/**
 * Creates destroyed storage and resolver instances while retaining their handles.
 *
 * Runs in the demo page so weak references can be inspected after browser garbage collection.
 *
 * @returns True when destroyed resolution rejects and the storage has no editors.
 */
async function createDestroyedEditorStorageProbe(): Promise<boolean> {
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
}

test("destroyed editor storage and resolver release their borrowed data", async ({
  page,
  browserName,
}) => {
  await page.goto(`/?embeddings=1&room=destroyed-editor-storage-${crypto.randomUUID()}`);
  await expect(
    page.locator('[data-document-pane="source"] [data-block-content]').first(),
  ).toHaveText("Source text");
  const result = await page.evaluate(createDestroyedEditorStorageProbe);
  expect(result).toBe(true);
  if (browserName === "chromium") {
    const session = await page.context().newCDPSession(page);
    await collectGarbage(page, session);
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

test("a retained host callback does not keep a destroyed resolver's source alive", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "Explicit garbage collection requires Chromium.");
  await page.goto(`/?embeddings=1&room=retained-location-${crypto.randomUUID()}`);
  await expect(
    page.locator('[data-document-pane="source"] [data-block-content]').first(),
  ).toHaveText("Source text");
  await page.evaluate(captureRetainedLocationCallback);
  const session = await page.context().newCDPSession(page);
  await collectGarbage(page, session);
  expect(
    await page.evaluate(() =>
      Boolean((Reflect.get(window, "retainedLocationSource") as WeakRef<object>).deref()),
    ),
  ).toBe(false);
  await session.detach();
});
