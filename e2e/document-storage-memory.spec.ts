import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import type { EditorStorage, ReactEditorApi } from "@chulane/rivto-react";
import type { YjsDoc, YjsDocumentRegistry } from "@chulane/crdt-doc";
import type { DocumentStorage } from "@chulane/document-model";
import type { DBDocumentModel, DemoDatabase } from "../demo/src/database";

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

/** Host payload reference retained independently of destroyed document storage. */
interface DestroyedStorageProbe {
  readonly payload: WeakRef<object>;
}

/**
 * Checks whether a destroyed resource's payload can be collected in Chromium.
 *
 * @param page - Page holding the weak-reference probe.
 * @param key - Window property containing the probe.
 * @returns The payload has been checked and the protocol session detached.
 */
async function expectCollected(page: Page, key: string): Promise<void> {
  const session = await page.context().newCDPSession(page);
  for (let index = 0; index < 8; index++) {
    await page.waitForTimeout(0);
    await session.send("HeapProfiler.collectGarbage");
  }
  const retained = await page.evaluate((key) => {
    const probe = Reflect.get(window, key) as DestroyedStorageProbe;
    return Boolean(probe.payload.deref());
  }, key);
  expect(retained).toBe(false);
  await session.detach();
}

test("destroyed document storage releases host callback data", async ({ page, browserName }) => {
  await page.goto(`/?embeddings=1&room=destroyed-storage-${crypto.randomUUID()}`);
  await expect(
    page.locator('[data-document-pane="source"] [data-block-content]').first(),
  ).toHaveText("Source text");
  const result = await page.evaluate(async () => {
    const host = (window as unknown as DatabaseMemoryWindow).__rivtoDocuments;
    const Storage = host.storage.constructor as typeof DocumentStorage;
    const Registry = host.registry.constructor as typeof YjsDocumentRegistry;
    const data = { bytes: new Uint8Array(1_000_000) };
    const payload = new WeakRef(data);
    const storage = new Storage({
      registry: new Registry("destroyed-storage-probe"),
      lookupDocumentIds: async () => [String(data.bytes.length)],
    });
    await storage.destroy();
    Reflect.set(window, "destroyedStorageProbe", { storage, payload });
    return true;
  });
  expect(result).toBe(true);
  if (browserName === "chromium") {
    await expectCollected(page, "destroyedStorageProbe");
  }
});

for (const failure of [false, true]) {
  test(`destroyed demo document releases its session database (cleanup failure: ${failure})`, async ({
    page,
    browserName,
  }) => {
    await page.goto(`/?embeddings=1&room=destroyed-model-${crypto.randomUUID()}`);
    await expect(
      page.locator('[data-document-pane="source"] [data-block-content]').first(),
    ).toHaveText("Source text");
    const failed = await page.evaluate(async (failure) => {
      const host = (window as unknown as DatabaseMemoryWindow).__rivtoDocuments;
      const existing = host.editor.getDocument("source")!;
      const Database = host.database.constructor as typeof DemoDatabase;
      const Model = existing.constructor as typeof DBDocumentModel;
      const Adapter = Reflect.get(existing, "crdt").constructor as typeof YjsDoc;
      const database = new Database();
      const adapter = new Adapter("destroyed-model-probe");
      if (failure) {
        await adapter.attachProvider({
          id: "failure-probe",
          connect: async () => {},
          disconnect: async () => {
            throw new Error("disconnect failed");
          },
        });
      }
      const model = new Model(adapter, database);
      const payload = new Uint8Array(1_000_000);
      database.documents.get(model.id)!.updates.push(payload);
      let failed = false;
      try {
        await model.destroy();
      } catch (error) {
        if (!failure || String(error) !== "Error: disconnect failed") {
          throw error;
        }
        failed = true;
      }
      Reflect.set(window, "destroyedModelProbe", { model, payload: new WeakRef(payload) });
      return failed;
    }, failure);
    expect(failed).toBe(failure);
    if (browserName === "chromium") {
      await expectCollected(page, "destroyedModelProbe");
    }
  });
}

test("destroyed demo database detaches from live workspace metadata", async ({
  page,
  browserName,
}) => {
  await page.goto(`/?embeddings=1&room=destroyed-database-${crypto.randomUUID()}`);
  await expect(
    page.locator('[data-document-pane="source"] [data-block-content]').first(),
  ).toHaveText("Source text");
  await page.evaluate(() => {
    const host = (window as unknown as DatabaseMemoryWindow).__rivtoDocuments;
    const Database = host.database.constructor as typeof DemoDatabase;
    const database = new Database(host.registry.root);
    database.openDocument("observer-probe");
    const payload = new Uint8Array(1_000_000);
    database.documents.get("observer-probe")!.updates.push(payload);
    database.destroy();
    Reflect.set(window, "destroyedDatabaseProbe", { payload: new WeakRef(payload) });
  });
  if (browserName === "chromium") {
    await expectCollected(page, "destroyedDatabaseProbe");
  }
});

test("database destruction stops workspace metadata notifications", async ({ page }) => {
  await page.goto(`/?embeddings=1&room=database-observer-${crypto.randomUUID()}`);
  await expect(
    page.locator('[data-document-pane="source"] [data-block-content]').first(),
  ).toBeVisible();
  const calls = await page.evaluate(async () => {
    const host = (window as unknown as DatabaseMemoryWindow).__rivtoDocuments;
    const Database = host.database.constructor as typeof DemoDatabase;
    const Adapter = host.registry.root.constructor as typeof YjsDoc;
    const root = new Adapter("observer-root");
    const database = new Database(root);
    let count = 0;
    const unsubscribe = database.subscribe(() => count++);
    database.reuse("doc", "block", "first");
    const before = count;
    database.destroy();
    database.destroy();
    root.getMap("demo.database.identities").set("external", {
      kind: "block",
      documentId: "doc",
      id: "second",
      present: false,
    });
    const after = count;
    unsubscribe();
    await root.destroy();
    return { before, after };
  });
  expect(calls).toEqual({ before: 1, after: 1 });
});

test("database teardown remains safe after its metadata document closes", async ({ page }) => {
  await page.goto(`/?embeddings=1&room=database-root-first-${crypto.randomUUID()}`);
  await expect(
    page.locator('[data-document-pane="source"] [data-block-content]').first(),
  ).toBeVisible();
  await page.evaluate(async () => {
    const host = (window as unknown as DatabaseMemoryWindow).__rivtoDocuments;
    const Database = host.database.constructor as typeof DemoDatabase;
    const Adapter = host.registry.root.constructor as typeof YjsDoc;
    const root = new Adapter("observer-root-first");
    const database = new Database(root);
    await root.destroy();
    database.destroy();
    database.destroy();
  });
});

test("retained destroyed database releases its metadata document", async ({
  page,
  browserName,
}) => {
  await page.goto(`/?embeddings=1&room=database-metadata-retention-${crypto.randomUUID()}`);
  await expect(
    page.locator('[data-document-pane="source"] [data-block-content]').first(),
  ).toBeVisible();
  await page.evaluate(async () => {
    const host = (window as unknown as DatabaseMemoryWindow).__rivtoDocuments;
    const Database = host.database.constructor as typeof DemoDatabase;
    const Adapter = host.registry.root.constructor as typeof YjsDoc;
    const root = new Adapter("retained-database-root");
    const payload = new WeakRef(root.doc);
    const database = new Database(root);
    await root.destroy();
    database.destroy();
    Reflect.set(window, "retainedDatabaseProbe", { database, payload });
  });
  if (browserName === "chromium") {
    await expectCollected(page, "retainedDatabaseProbe");
  }
});

for (const kind of ["blocks", "elements", "pluginData", "history"] as const) {
  test(`retained ${kind} manager releases its destroyed native document`, async ({
    page,
    browserName,
  }) => {
    await page.goto(`/?embeddings=1&room=manager-retention-${crypto.randomUUID()}`);
    await expect(
      page.locator('[data-document-pane="source"] [data-block-content]').first(),
    ).toBeVisible();
    await page.evaluate(async (kind) => {
      const host = (window as unknown as DatabaseMemoryWindow).__rivtoDocuments;
      const Database = host.database.constructor as typeof DemoDatabase;
      const Model = host.editor.getDocument("source")!.constructor as typeof DBDocumentModel;
      const Adapter = host.registry.root.constructor as typeof YjsDoc;
      const database = new Database();
      const adapter = new Adapter(`retained-${kind}`);
      const document = new Model(adapter, database);
      const manager = document[kind];
      const payload = new WeakRef(adapter.doc);
      await document.destroy();
      database.destroy();
      Reflect.set(window, "managerRetentionProbe", { manager, payload });
    }, kind);
    if (browserName === "chromium") {
      await expectCollected(page, "managerRetentionProbe");
    }
  });
}

for (const kind of ["blocks", "elements"] as const) {
  test(`releases ${kind} manager observers after adapter teardown fails`, async ({
    page,
    browserName,
  }) => {
    await page.goto(`/?embeddings=1&room=failed-adapter-${crypto.randomUUID()}`);
    await expect(
      page.locator('[data-document-pane="source"] [data-block-content]').first(),
    ).toBeVisible();
    await page.evaluate(async (kind) => {
      const host = (window as unknown as DatabaseMemoryWindow).__rivtoDocuments;
      const Database = host.database.constructor as typeof DemoDatabase;
      const Model = host.editor.getDocument("source")!.constructor as typeof DBDocumentModel;
      const Adapter = host.registry.root.constructor as typeof YjsDoc;
      const database = new Database();
      const adapter = new Adapter(`failed-${kind}`);
      const originalDestroy = adapter.destroy.bind(adapter);
      const model = new Model(adapter, database);
      const payload = new WeakRef(model[kind]);
      Reflect.set(adapter, "destroy", async () => {
        throw new Error("adapter teardown failed");
      });
      try {
        await model.destroy();
        throw new Error("expected teardown failure");
      } catch (error) {
        if (String(error) !== "Error: adapter teardown failed") {
          throw error;
        }
      }
      adapter
        .getArray(kind === "blocks" ? "rivto.editor.roots" : "rivto.editor.rootElementIds")
        .insert(0, "later");
      Reflect.set(window, "failedAdapterProbe", { adapter, originalDestroy, database, payload });
    }, kind);
    if (browserName === "chromium") {
      await expectCollected(page, "failedAdapterProbe");
    }
    await page.evaluate(async () => {
      const probe = Reflect.get(window, "failedAdapterProbe");
      await probe.originalDestroy();
      probe.database.destroy();
      Reflect.deleteProperty(window, "failedAdapterProbe");
    });
  });
}
