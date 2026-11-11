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

/** Number and total size of persisted binary updates. */
interface SavedUpdateStats {
  readonly count: number;
  readonly bytes: number;
}

/**
 * Checks that captured in-memory update buffers are collectible in Chromium.
 *
 * @param page - Page holding weak references to the saved update buffers.
 * @returns The references have been checked and the protocol session detached.
 */
async function expectOffloadedBuffersCollected(page: Page): Promise<void> {
  const session = await page.context().newCDPSession(page);
  for (let index = 0; index < 8; index++) {
    await page.waitForTimeout(0);
    await session.send("HeapProfiler.collectGarbage");
  }
  const retained = await page.evaluate(() => {
    const references = Reflect.get(window, "offloadedUpdateReferences") as WeakRef<Uint8Array>[];
    return references.filter((reference) => reference.deref()).length;
  });
  expect(retained).toBe(0);
  await session.detach();
}

/**
 * Captures weak references to the source document's current saved updates.
 *
 * @returns The page holds weak references without retaining the update buffers.
 */
function captureSourceUpdateReferences(): void {
  const updates = (
    window as unknown as DatabaseMemoryWindow
  ).__rivtoDocuments.database.documents.get("source")!.updates;
  Reflect.set(
    window,
    "offloadedUpdateReferences",
    updates.map((update) => new WeakRef(update)),
  );
}

/**
 * Writes independent history entries and reports the un-compacted update log.
 *
 * @param blockId - Source block to update in the mounted demo.
 * @returns Update count and total binary size before deferred compaction.
 */
function writeSourceEdits(blockId: string): SavedUpdateStats {
  const host = window as unknown as DatabaseMemoryWindow;
  const source = [...host.__rivtoDocuments.panes].find((pane) => pane.id === "source")!.reactEditor;
  for (let index = 0; index < 120; index++) {
    source.blocks.updateBlock(blockId, { content: `Saved edit ${index}` });
    source.history.stopCapturing();
  }
  const updates = host.__rivtoDocuments.database.documents.get("source")!.updates;
  return {
    count: updates.length,
    bytes: updates.reduce((total, update) => total + update.byteLength, 0),
  };
}

test("compacts edit updates without losing content or live undo", async ({ page }) => {
  const room = `database-memory-${crypto.randomUUID()}`;
  await page.goto(`/?embeddings=1&room=${room}`);
  const source = page.locator('[data-document-pane="source"] [data-block-content]').first();
  await expect(source).toHaveText("Source text");
  const before = await page.evaluate(writeSourceEdits, `${room}:source-block`);
  expect(before.count).toBeGreaterThan(100);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as DatabaseMemoryWindow).__rivtoDocuments.database.documents.get(
            "source",
          )!.updates.length,
      ),
    )
    .toBeLessThan(10);
  const bytes = await page.evaluate(() =>
    (window as unknown as DatabaseMemoryWindow).__rivtoDocuments.database.documents
      .get("source")!
      .updates.reduce((total, update) => total + update.byteLength, 0),
  );
  expect(bytes).toBeLessThan(before.bytes);
  await page.evaluate(() => {
    const host = window as unknown as DatabaseMemoryWindow;
    [...host.__rivtoDocuments.panes]
      .find((pane) => pane.id === "source")!
      .reactEditor.history.undo();
  });
  await expect(source).toHaveText("Saved edit 118");
  await page.getByRole("button", { name: "Close references", exact: true }).click();
  await page.getByRole("button", { name: "Close source", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        Boolean(
          (window as unknown as DatabaseMemoryWindow).__rivtoDocuments.editor.getEditor("source"),
        ),
      ),
    )
    .toBe(false);
  await page.getByRole("button", { name: "Open source", exact: true }).click();
  await expect(
    page.locator('[data-document-pane="source"] [data-block-content]').first(),
  ).toHaveText("Saved edit 118");
});

test("preserves updates whose dependencies arrive after compaction", async ({ page }) => {
  await page.goto(`/?embeddings=1&room=pending-${crypto.randomUUID()}`);
  await expect(
    page.locator('[data-document-pane="source"] [data-block-content]').first(),
  ).toHaveText("Source text");
  await page.evaluate(() => {
    const host = window as unknown as DatabaseMemoryWindow;
    const { database, registry } = host.__rivtoDocuments;
    registry.registerDocument("pending-writer");
    const writer = registry.openDocument("pending-writer");
    const updates: Uint8Array[] = [];
    const unsubscribe = writer.on("update", (update: Uint8Array) => updates.push(update));
    writer.getText("pending").insert(0, "A");
    writer.getText("pending").insert(1, "B");
    unsubscribe();
    host.pendingFirstUpdate = updates[0]!;
    database.openDocument("pending-result");
    for (let index = 0; index < 110; index++) {
      database.saveUpdate("pending-result", updates[1]!);
    }
    void writer.destroy();
  });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as DatabaseMemoryWindow).__rivtoDocuments.database.documents.get(
            "pending-result",
          )!.updates.length,
      ),
    )
    .toBeLessThan(10);
  const restored = await page.evaluate(async () => {
    const host = window as unknown as DatabaseMemoryWindow;
    const { database, registry } = host.__rivtoDocuments;
    database.saveUpdate("pending-result", host.pendingFirstUpdate);
    registry.registerDocument("pending-result");
    const target = registry.openDocument("pending-result");
    database.restore(target);
    const text = target.getText("pending").toString();
    await target.destroy();
    return text;
  });
  expect(restored).toBe("AB");
});

test("compacts large updates without repeatedly compacting a large snapshot", async ({ page }) => {
  await page.goto(`/?embeddings=1&room=large-updates-${crypto.randomUUID()}`);
  await expect(
    page.locator('[data-document-pane="source"] [data-block-content]').first(),
  ).toHaveText("Source text");
  const result = await page.evaluate(async () => {
    const { database, registry } = (window as unknown as DatabaseMemoryWindow).__rivtoDocuments;
    registry.registerDocument("large-writer");
    const writer = registry.openDocument("large-writer");
    database.openDocument("large-result");
    const unsubscribe = writer.on("update", (update: Uint8Array) => {
      database.saveUpdate("large-result", update);
    });
    const callbacks: Array<() => void> = [];
    Object.defineProperty(window, "requestIdleCallback", {
      configurable: true,
      value: (callback: () => void) => (callbacks.push(callback), callbacks.length),
    });
    Object.defineProperty(window, "cancelIdleCallback", { configurable: true, value: () => {} });
    const text = writer.getText("large");
    text.insert(0, "x".repeat(2 * 1024 * 1024));
    text.insert(text.toString().length, "a");
    const scheduled = callbacks.length;
    callbacks.shift()?.();
    text.insert(text.toString().length, "b");
    const rescheduled = callbacks.length;
    registry.registerDocument("large-result");
    const restored = registry.openDocument("large-result");
    database.restore(restored);
    const content = restored.getText("large").toString();
    await restored.destroy();
    unsubscribe();
    await writer.destroy();
    return { scheduled, rescheduled, length: content.length, suffix: content.slice(-2) };
  });
  expect(result).toEqual({
    scheduled: 1,
    rescheduled: 0,
    length: 2 * 1024 * 1024 + 2,
    suffix: "ab",
  });
});

test("compacts deleted large content without changing live undo", async ({ page }) => {
  await page.goto(`/?embeddings=1&room=deleted-content-${crypto.randomUUID()}`);
  await expect(
    page.locator('[data-document-pane="source"] [data-block-content]').first(),
  ).toHaveText("Source text");
  const result = await page.evaluate(async () => {
    const { database, registry } = (window as unknown as DatabaseMemoryWindow).__rivtoDocuments;
    registry.registerDocument("deleted-writer");
    const writer = registry.openDocument("deleted-writer");
    database.openDocument("deleted-result");
    const text = writer.getText("text");
    const history = writer.createUndoManager([text]);
    const unsubscribe = writer.on("update", (update: Uint8Array) => {
      database.saveUpdate("deleted-result", update);
    });
    let compact: (() => void) | undefined;
    Object.defineProperty(window, "requestIdleCallback", {
      configurable: true,
      value: (callback: () => void) => {
        compact = callback;
        return 1;
      },
    });
    Object.defineProperty(window, "cancelIdleCallback", { configurable: true, value: () => {} });
    writer.transact(() => text.insert(0, "x".repeat(2 * 1024 * 1024)));
    history.stopCapturing();
    writer.transact(() => text.delete(0, 2 * 1024 * 1024));
    const updates = database.documents.get("deleted-result")!.updates;
    const before = updates.reduce((total, update) => total + update.byteLength, 0);
    compact?.();
    const after = updates.reduce((total, update) => total + update.byteLength, 0);
    history.undo();
    const restored = text.toString().length;
    unsubscribe();
    history.destroy();
    await writer.destroy();
    return { before, after, restored };
  });
  expect(result.before).toBeGreaterThan(2 * 1024 * 1024);
  expect(result.after).toBeLessThan(1024);
  expect(result.restored).toBe(2 * 1024 * 1024);
});

test("cancels pending database compaction on shutdown", async ({ page }) => {
  await page.goto(`/?embeddings=1&room=cancel-compaction-${crypto.randomUUID()}`);
  await expect(
    page.locator('[data-document-pane="source"] [data-block-content]').first(),
  ).toBeVisible();
  const result = await page.evaluate(() => {
    const host = (window as unknown as DatabaseMemoryWindow).__rivtoDocuments;
    const Database = host.database.constructor as typeof DemoDatabase;
    const database = new Database();
    const update = host.database.documents.get("source")!.updates[0]!;
    const request = Object.getOwnPropertyDescriptor(window, "requestIdleCallback");
    const cancel = Object.getOwnPropertyDescriptor(window, "cancelIdleCallback");
    const cancelled: number[] = [];
    let scheduled = 0;
    Object.defineProperty(window, "requestIdleCallback", {
      configurable: true,
      value: () => ++scheduled,
    });
    Object.defineProperty(window, "cancelIdleCallback", {
      configurable: true,
      value: (id: number) => cancelled.push(id),
    });
    try {
      database.openDocument("probe");
      for (let index = 0; index < 120; index++) {
        database.saveUpdate("probe", update);
      }
      database.destroy();
      database.destroy();
      return { scheduled, cancelled };
    } finally {
      if (request) {
        Object.defineProperty(window, "requestIdleCallback", request);
      } else {
        Reflect.deleteProperty(window, "requestIdleCallback");
      }
      if (cancel) {
        Object.defineProperty(window, "cancelIdleCallback", cancel);
      } else {
        Reflect.deleteProperty(window, "cancelIdleCallback");
      }
    }
  });
  expect(result).toEqual({ scheduled: 1, cancelled: [1] });
});

test("keeps the saved update log when compaction fails", async ({ page }) => {
  await page.goto(`/?embeddings=1&room=invalid-compaction-${crypto.randomUUID()}`);
  await expect(
    page.locator('[data-document-pane="source"] [data-block-content]').first(),
  ).toBeVisible();
  const result = await page.evaluate(() => {
    const host = (window as unknown as DatabaseMemoryWindow).__rivtoDocuments;
    const Database = host.database.constructor as typeof DemoDatabase;
    const database = new Database();
    const request = Object.getOwnPropertyDescriptor(window, "requestIdleCallback");
    const cancel = Object.getOwnPropertyDescriptor(window, "cancelIdleCallback");
    let compact: (() => void) | undefined;
    Object.defineProperty(window, "requestIdleCallback", {
      configurable: true,
      value: (callback: () => void) => {
        compact = callback;
        return 1;
      },
    });
    Object.defineProperty(window, "cancelIdleCallback", { configurable: true, value: () => {} });
    try {
      database.openDocument("probe");
      for (let index = 0; index < 100; index++) {
        database.saveUpdate("probe", new Uint8Array([255]));
      }
      try {
        compact!();
        return { failed: false, count: database.documents.get("probe")!.updates.length };
      } catch {
        return { failed: true, count: database.documents.get("probe")!.updates.length };
      }
    } finally {
      database.destroy();
      if (request) {
        Object.defineProperty(window, "requestIdleCallback", request);
      } else {
        Reflect.deleteProperty(window, "requestIdleCallback");
      }
      if (cancel) {
        Object.defineProperty(window, "cancelIdleCallback", cancel);
      } else {
        Reflect.deleteProperty(window, "cancelIdleCallback");
      }
    }
  });
  expect(result).toEqual({ failed: true, count: 100 });
});

test("preserves a pending deletion until its insertion arrives after compaction", async ({
  page,
}) => {
  await page.goto(`/?embeddings=1&room=pending-delete-${crypto.randomUUID()}`);
  await expect(
    page.locator('[data-document-pane="source"] [data-block-content]').first(),
  ).toBeVisible();
  await page.evaluate(() => {
    const host = window as unknown as DatabaseMemoryWindow;
    const { database, registry } = host.__rivtoDocuments;
    registry.registerDocument("delete-writer");
    const writer = registry.openDocument("delete-writer");
    const updates: Uint8Array[] = [];
    const unsubscribe = writer.on("update", (update: Uint8Array) => updates.push(update));
    const text = writer.getText("pending");
    text.insert(0, "deleted");
    text.delete(0, 7);
    unsubscribe();
    host.pendingFirstUpdate = updates[0]!;
    database.openDocument("delete-result");
    for (let index = 0; index < 110; index++) {
      database.saveUpdate("delete-result", updates[1]!);
    }
    void writer.destroy();
  });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as DatabaseMemoryWindow).__rivtoDocuments.database.documents.get(
            "delete-result",
          )!.updates.length,
      ),
    )
    .toBeLessThan(10);
  const content = await page.evaluate(async () => {
    const host = window as unknown as DatabaseMemoryWindow;
    const { database, registry } = host.__rivtoDocuments;
    database.saveUpdate("delete-result", host.pendingFirstUpdate);
    registry.registerDocument("delete-result");
    const target = registry.openDocument("delete-result");
    database.restore(target);
    const value = target.getText("pending").toString();
    await target.destroy();
    return value;
  });
  expect(content).toBe("");
});

test("offloads a closed document and restores its collaborative snapshot", async ({
  page,
  browserName,
}) => {
  const room = `offload-${crypto.randomUUID()}`;
  await page.goto(`/?embeddings=1&room=${room}`);
  const source = page.locator('[data-document-pane="source"] [data-block-content]').first();
  await expect(source).toHaveText("Source text");
  await page.evaluate((id) => {
    const host = (window as unknown as DatabaseMemoryWindow).__rivtoDocuments;
    const editor = [...host.panes].find((pane) => pane.id === "source")!.reactEditor;
    editor.blocks.setBlockProp(id, "offloadProbe", "x".repeat(300_000));
  }, `${room}:source-block`);
  const savedBytes = await page.evaluate(() =>
    (window as unknown as DatabaseMemoryWindow).__rivtoDocuments.database.documents
      .get("source")!
      .updates.reduce((total, update) => total + update.byteLength, 0),
  );
  expect(savedBytes).toBeGreaterThan(300_000);
  await page.evaluate(captureSourceUpdateReferences);
  await page.getByRole("button", { name: "Close references", exact: true }).click();
  await page.getByRole("button", { name: "Close source", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const host = (window as unknown as DatabaseMemoryWindow).__rivtoDocuments;
        return {
          open: Boolean(host.editor.getEditor("source")),
          updates: host.database.documents.get("source")!.updates.length,
        };
      }),
    )
    .toEqual({ open: false, updates: 0 });
  if (browserName === "chromium") {
    await expectOffloadedBuffersCollected(page);
  }
  await page.getByRole("button", { name: "Open source", exact: true }).click();
  await expect(source).toHaveText("Source text");
  const restored = await page.evaluate((id) => {
    const host = (window as unknown as DatabaseMemoryWindow).__rivtoDocuments;
    const editor = [...host.panes].find((pane) => pane.id === "source")!.reactEditor;
    return editor.blocks.getBlock(id)?.props.offloadProbe;
  }, `${room}:source-block`);
  expect(restored).toBe("x".repeat(300_000));
});

test("waits for the last model before offloading shared document updates", async ({ page }) => {
  await page.goto(`/?embeddings=1&room=offload-shared-${crypto.randomUUID()}`);
  await expect(
    page.locator('[data-document-pane="source"] [data-block-content]').first(),
  ).toBeVisible();
  const result = await page.evaluate(async () => {
    const host = (window as unknown as DatabaseMemoryWindow).__rivtoDocuments;
    const existing = host.editor.getDocument("source")!;
    const Database = host.database.constructor as typeof DemoDatabase;
    const Model = existing.constructor as typeof DBDocumentModel;
    const Adapter = Reflect.get(existing, "crdt").constructor as typeof YjsDoc;
    const database = new Database();
    const firstAdapter = new Adapter("shared-probe");
    const first = new Model(firstAdapter, database);
    firstAdapter.transact(() => firstAdapter.getText("text").insert(0, "first"));
    const secondAdapter = new Adapter("shared-probe");
    const second = new Model(secondAdapter, database);
    await first.destroy();
    const whileOpen = database.documents.get("shared-probe")!.updates.length;
    secondAdapter.transact(() => secondAdapter.getText("text").insert(5, "-second"));
    await second.destroy();
    const afterClose = database.documents.get("shared-probe")!.updates.length;
    const restored = new Adapter("shared-probe");
    database.restore(restored);
    const text = restored.getText("text").toString();
    await restored.destroy();
    database.destroy();
    return { whileOpen, afterClose, text };
  });
  expect(result.whileOpen).toBeGreaterThan(0);
  expect(result.afterClose).toBe(0);
  expect(result.text).toBe("first-second");
});

test("keeps updates in memory when browser storage rejects offloading", async ({ page }) => {
  await page.goto(`/?embeddings=1&room=offload-quota-${crypto.randomUUID()}`);
  await expect(
    page.locator('[data-document-pane="source"] [data-block-content]').first(),
  ).toBeVisible();
  const result = await page.evaluate(async () => {
    const host = (window as unknown as DatabaseMemoryWindow).__rivtoDocuments;
    const existing = host.editor.getDocument("source")!;
    const Database = host.database.constructor as typeof DemoDatabase;
    const Model = existing.constructor as typeof DBDocumentModel;
    const Adapter = Reflect.get(existing, "crdt").constructor as typeof YjsDoc;
    const database = new Database();
    const adapter = new Adapter("quota-probe");
    const model = new Model(adapter, database);
    model.blocks.insertBlock({ id: "quota-block", type: "paragraph", content: "retained row" });
    adapter.transact(() => adapter.getText("text").insert(0, "saved"));
    const descriptor = Object.getOwnPropertyDescriptor(Storage.prototype, "setItem")!;
    Object.defineProperty(Storage.prototype, "setItem", {
      ...descriptor,
      value: () => {
        throw new DOMException("full", "QuotaExceededError");
      },
    });
    try {
      await model.destroy();
    } finally {
      Object.defineProperty(Storage.prototype, "setItem", descriptor);
    }
    const retained = database.documents.get("quota-probe")!.updates.length;
    const row = database.blocks.get("quota-block")?.get("quota-probe")?.content;
    const restored = new Adapter("quota-probe");
    database.restore(restored);
    const text = restored.getText("text").toString();
    await restored.destroy();
    database.destroy();
    return { retained, text, row };
  });
  expect(result.retained).toBeGreaterThan(0);
  expect(result.text).toBe("saved");
  expect(result.row).toBe("retained row");
});

test("preserves an offloaded update until its missing dependency arrives", async ({ page }) => {
  await page.goto(`/?embeddings=1&room=offload-pending-${crypto.randomUUID()}`);
  await expect(
    page.locator('[data-document-pane="source"] [data-block-content]').first(),
  ).toBeVisible();
  const result = await page.evaluate(async () => {
    const host = (window as unknown as DatabaseMemoryWindow).__rivtoDocuments;
    const existing = host.editor.getDocument("source")!;
    const Database = host.database.constructor as typeof DemoDatabase;
    const Adapter = Reflect.get(existing, "crdt").constructor as typeof YjsDoc;
    const database = new Database();
    const writer = new Adapter("writer");
    const updates: Uint8Array[] = [];
    const unsubscribe = writer.on("update", (update: Uint8Array) => updates.push(update));
    writer.getText("text").insert(0, "A");
    writer.getText("text").insert(1, "B");
    unsubscribe();
    database.openDocument("pending");
    database.saveUpdate("pending", updates[1]!);
    database.retainDocument("pending");
    database.releaseDocument("pending");
    const offloaded = database.documents.get("pending")!.updates.length;
    database.saveUpdate("pending", updates[0]!);
    const restored = new Adapter("pending");
    database.restore(restored);
    const text = restored.getText("text").toString();
    await Promise.all([writer.destroy(), restored.destroy()]);
    database.destroy();
    return { offloaded, text };
  });
  expect(result).toEqual({ offloaded: 0, text: "AB" });
});

test("retains saved state when an offloaded update is temporarily inaccessible", async ({
  page,
}) => {
  await page.goto(`/?embeddings=1&room=offload-read-${crypto.randomUUID()}`);
  await expect(
    page.locator('[data-document-pane="source"] [data-block-content]').first(),
  ).toBeVisible();
  const result = await page.evaluate(async () => {
    const host = (window as unknown as DatabaseMemoryWindow).__rivtoDocuments;
    const existing = host.editor.getDocument("source")!;
    const Database = host.database.constructor as typeof DemoDatabase;
    const Adapter = Reflect.get(existing, "crdt").constructor as typeof YjsDoc;
    const database = new Database();
    const writer = new Adapter("read-probe");
    database.openDocument("read-probe");
    const unsubscribe = writer.on("update", (update: Uint8Array) =>
      database.saveUpdate("read-probe", update),
    );
    writer.getText("text").insert(0, "saved");
    unsubscribe();
    database.retainDocument("read-probe");
    database.releaseDocument("read-probe");
    const descriptor = Object.getOwnPropertyDescriptor(Storage.prototype, "getItem")!;
    Object.defineProperty(Storage.prototype, "getItem", {
      ...descriptor,
      value: () => {
        throw new Error("storage denied");
      },
    });
    const restored = new Adapter("read-probe");
    let denied = false;
    try {
      database.restore(restored);
    } catch (error) {
      denied = String(error) === "Error: storage denied";
    } finally {
      Object.defineProperty(Storage.prototype, "getItem", descriptor);
    }
    database.restore(restored);
    const text = restored.getText("text").toString();
    await Promise.all([writer.destroy(), restored.destroy()]);
    database.destroy();
    return { denied, text };
  });
  expect(result).toEqual({ denied: true, text: "saved" });
});

test("database shutdown preserves offloaded updates and removes its session key", async ({
  page,
}) => {
  await page.goto(`/?embeddings=1&room=offload-shutdown-${crypto.randomUUID()}`);
  await expect(
    page.locator('[data-document-pane="source"] [data-block-content]').first(),
  ).toBeVisible();
  const result = await page.evaluate(async () => {
    const host = (window as unknown as DatabaseMemoryWindow).__rivtoDocuments;
    const existing = host.editor.getDocument("source")!;
    const Database = host.database.constructor as typeof DemoDatabase;
    const Adapter = Reflect.get(existing, "crdt").constructor as typeof YjsDoc;
    const database = new Database();
    const writer = new Adapter("shutdown-probe");
    database.openDocument("shutdown-probe");
    const unsubscribe = writer.on("update", (update: Uint8Array) =>
      database.saveUpdate("shutdown-probe", update),
    );
    writer.getText("text").insert(0, "saved");
    unsubscribe();
    const before = sessionStorage.length;
    database.retainDocument("shutdown-probe");
    database.releaseDocument("shutdown-probe");
    const during = sessionStorage.length;
    database.destroy();
    const after = sessionStorage.length;
    const restored = new Adapter("shutdown-probe");
    database.restore(restored);
    const text = restored.getText("text").toString();
    await Promise.all([writer.destroy(), restored.destroy()]);
    return { before, during, after, text };
  });
  expect(result.during).toBe(result.before + 1);
  expect(result.after).toBe(result.before);
  expect(result.text).toBe("saved");
});

test("offloading works without native binary base64 methods", async ({ page }) => {
  await page.goto(`/?embeddings=1&room=offload-fallback-${crypto.randomUUID()}`);
  await expect(
    page.locator('[data-document-pane="source"] [data-block-content]').first(),
  ).toBeVisible();
  const result = await page.evaluate(async () => {
    const host = (window as unknown as DatabaseMemoryWindow).__rivtoDocuments;
    const existing = host.editor.getDocument("source")!;
    const Database = host.database.constructor as typeof DemoDatabase;
    const Adapter = Reflect.get(existing, "crdt").constructor as typeof YjsDoc;
    const encode = Object.getOwnPropertyDescriptor(Uint8Array.prototype, "toBase64");
    const decode = Object.getOwnPropertyDescriptor(Uint8Array, "fromBase64");
    Object.defineProperty(Uint8Array.prototype, "toBase64", {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(Uint8Array, "fromBase64", { configurable: true, value: undefined });
    const database = new Database();
    const writer = new Adapter("fallback-probe");
    const restored = new Adapter("fallback-probe");
    try {
      database.openDocument("fallback-probe");
      const unsubscribe = writer.on("update", (update: Uint8Array) =>
        database.saveUpdate("fallback-probe", update),
      );
      writer.getText("text").insert(0, "saved 🚀");
      unsubscribe();
      database.retainDocument("fallback-probe");
      database.releaseDocument("fallback-probe");
      const offloaded = database.documents.get("fallback-probe")!.updates.length;
      database.restore(restored);
      return { offloaded, text: restored.getText("text").toString() };
    } finally {
      await Promise.all([writer.destroy(), restored.destroy()]);
      database.destroy();
      if (encode) {
        Object.defineProperty(Uint8Array.prototype, "toBase64", encode);
      } else {
        Reflect.deleteProperty(Uint8Array.prototype, "toBase64");
      }
      if (decode) {
        Object.defineProperty(Uint8Array, "fromBase64", decode);
      } else {
        Reflect.deleteProperty(Uint8Array, "fromBase64");
      }
    }
  });
  expect(result).toEqual({ offloaded: 0, text: "saved 🚀" });
});

test("an offloaded snapshot merges a peer's offline edit and undo", async ({ page }) => {
  await page.goto(`/?embeddings=1&room=offload-offline-${crypto.randomUUID()}`);
  await expect(
    page.locator('[data-document-pane="source"] [data-block-content]').first(),
  ).toBeVisible();
  const result = await page.evaluate(async () => {
    const host = (window as unknown as DatabaseMemoryWindow).__rivtoDocuments;
    const existing = host.editor.getDocument("source")!;
    const Database = host.database.constructor as typeof DemoDatabase;
    const Adapter = Reflect.get(existing, "crdt").constructor as typeof YjsDoc;
    const database = new Database();
    const local = new Adapter("offline");
    const peer = new Adapter("offline");
    database.openDocument("offline");
    const unsubscribe = local.on("update", (update: Uint8Array) =>
      database.saveUpdate("offline", update),
    );
    local.transact(() => local.getText("text").insert(0, "base"));
    peer.applySnapshot(local.getSnapshot());
    const peerText = peer.getText("text");
    const history = peer.createUndoManager([peerText], undefined, 2);
    local.transact(() => local.getText("text").insert(4, "L"));
    peer.transact(() => peerText.insert(4, "R"));
    unsubscribe();
    database.retainDocument("offline");
    database.releaseDocument("offline");
    const offloaded = database.documents.get("offline")!.updates.length;
    await local.destroy();
    const restored = new Adapter("offline");
    database.restore(restored);
    restored.applySnapshot(peer.getSnapshot());
    peer.applySnapshot(restored.getSnapshot());
    const merged = restored.getText("text").toString();
    history.undo();
    restored.applySnapshot(peer.getSnapshot());
    const afterUndo = restored.getText("text").toString();
    const peerAfterUndo = peerText.toString();
    history.destroy();
    await Promise.all([peer.destroy(), restored.destroy()]);
    database.destroy();
    return { offloaded, merged, afterUndo, peerAfterUndo };
  });
  expect(result.offloaded).toBe(0);
  expect(result.merged).toMatch(/^base(?:LR|RL)$/);
  expect(result.afterUndo).toBe("baseL");
  expect(result.peerAfterUndo).toBe("baseL");
});

test("cleans session keys on page exit but keeps them for back-forward cache", async ({ page }) => {
  await page.goto(`/?embeddings=1&room=offload-pagehide-${crypto.randomUUID()}`);
  await expect(
    page.locator('[data-document-pane="source"] [data-block-content]').first(),
  ).toBeVisible();
  const result = await page.evaluate(async () => {
    const host = (window as unknown as DatabaseMemoryWindow).__rivtoDocuments;
    const existing = host.editor.getDocument("source")!;
    const Database = host.database.constructor as typeof DemoDatabase;
    const Adapter = Reflect.get(existing, "crdt").constructor as typeof YjsDoc;
    const database = new Database();
    const writer = new Adapter("pagehide-probe");
    database.openDocument("pagehide-probe");
    const unsubscribe = writer.on("update", (update: Uint8Array) =>
      database.saveUpdate("pagehide-probe", update),
    );
    writer.getText("text").insert(0, "saved");
    unsubscribe();
    const before = sessionStorage.length;
    database.retainDocument("pagehide-probe");
    database.releaseDocument("pagehide-probe");
    const stored = sessionStorage.length;
    window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true }));
    const cached = sessionStorage.length;
    window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: false }));
    const exited = sessionStorage.length;
    await writer.destroy();
    return { before, stored, cached, exited };
  });
  expect(result.stored).toBe(result.before + 1);
  expect(result.cached).toBe(result.stored);
  expect(result.exited).toBe(result.before);
});

test("last editor close releases its live document and restores an offline merge", async ({
  page,
  browserName,
}) => {
  const room = `lifecycle-offline-${crypto.randomUUID()}`;
  await page.goto(`/?embeddings=1&room=${room}`);
  await expect(
    page.locator('[data-document-pane="source"] [data-block-content]').first(),
  ).toHaveText("Source text");
  await page.getByRole("button", { name: "Close references", exact: true }).click();
  await page.evaluate(() => {
    const host = (window as unknown as DatabaseMemoryWindow).__rivtoDocuments;
    const editor = host.editor.getEditor("source")!;
    const model = editor.getDocument();
    const crdt = Reflect.get(model, "crdt") as YjsDoc;
    const Adapter = crdt.constructor as typeof YjsDoc;
    const peer = new Adapter("source");
    crdt.transact(() => crdt.getText("lifecycle-probe").insert(0, "base"));
    peer.applySnapshot(crdt.getSnapshot());
    crdt.transact(() => crdt.getText("lifecycle-probe").insert(4, "L"));
    peer.transact(() => peer.getText("lifecycle-probe").insert(4, "R"));
    const manager = Reflect.get(Reflect.get(model.history, "manager"), "manager") as object;
    Reflect.set(window, "lifecycleMemoryProbe", {
      peer,
      editor: new WeakRef(editor),
      model: new WeakRef(model),
      doc: new WeakRef(crdt.doc),
      manager: new WeakRef(manager),
    });
  });
  await page.getByRole("button", { name: "Close source", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const host = (window as unknown as DatabaseMemoryWindow).__rivtoDocuments;
        return {
          open: !!host.editor.getEditor("source"),
          updates: host.database.documents.get("source")!.updates.length,
        };
      }),
    )
    .toEqual({ open: false, updates: 0 });
  if (browserName === "chromium") {
    const session = await page.context().newCDPSession(page);
    for (let index = 0; index < 8; index++) {
      await page.waitForTimeout(0);
      await session.send("HeapProfiler.collectGarbage");
    }
    const retained = await page.evaluate(() => {
      const probe = Reflect.get(window, "lifecycleMemoryProbe");
      return ["editor", "model", "doc", "manager"].filter((key) => probe[key].deref());
    });
    expect(retained).toEqual([]);
    await session.detach();
  }
  await page.getByRole("button", { name: "Open source", exact: true }).click();
  await expect(
    page.locator('[data-document-pane="source"] [data-block-content]').first(),
  ).toHaveText("Source text");
  const values = await page.evaluate(async () => {
    const host = (window as unknown as DatabaseMemoryWindow).__rivtoDocuments;
    const crdt = Reflect.get(host.editor.getDocument("source")!, "crdt") as YjsDoc;
    const probe = Reflect.get(window, "lifecycleMemoryProbe") as { peer: YjsDoc };
    crdt.applySnapshot(probe.peer.getSnapshot());
    probe.peer.applySnapshot(crdt.getSnapshot());
    const merged = [
      crdt.getText("lifecycle-probe").toString(),
      probe.peer.getText("lifecycle-probe").toString(),
    ];
    await probe.peer.destroy();
    Reflect.deleteProperty(window, "lifecycleMemoryProbe");
    return merged;
  });
  expect(values[0]).toMatch(/^base(?:LR|RL)$/);
  expect(values[1]).toBe(values[0]);
});

test("closing one of two panes keeps their shared document active", async ({ page }) => {
  await page.goto(`/?embeddings=1&room=shared-panes-${crypto.randomUUID()}`);
  await expect(page.locator('[data-document-pane="source"]')).toHaveCount(1);
  await page.getByRole("button", { name: "Open source", exact: true }).click();
  await expect(page.locator('[data-document-pane="source"]')).toHaveCount(2);
  await page.getByRole("button", { name: "Close source", exact: true }).first().click();
  await expect(page.locator('[data-document-pane="source"]')).toHaveCount(1);
  await expect(
    page.locator('[data-document-pane="source"] [data-block-content]').first(),
  ).toHaveText("Source text");
  expect(
    await page.evaluate(
      () =>
        !!(window as unknown as DatabaseMemoryWindow).__rivtoDocuments.editor.getEditor("source"),
    ),
  ).toBe(true);
});

test("offloading a closed document releases its stored rows", async ({ page, browserName }) => {
  const room = `offloaded-rows-${crypto.randomUUID()}`;
  await page.goto(`/?embeddings=1&room=${room}`);
  await expect(
    page.locator('[data-document-pane="source"] [data-block-content]').first(),
  ).toHaveText("Source text");
  await page.evaluate((id) => {
    const host = (window as unknown as DatabaseMemoryWindow).__rivtoDocuments;
    const editor = host.editor.getEditor("source")!;
    editor.blocks.setBlockProp(id, "largeRow", "x".repeat(300_000));
    const row = host.database.blocks.get(id)!.get("source")!;
    const element = editor.getDocument().elements.insertElement({
      id: "offloaded-element",
      type: "shape",
      frame: { x: 0, y: 0, width: 10, height: 10 },
      zIndex: 0,
      props: { largeRow: "y".repeat(300_000) },
    });
    const elementRow = host.database.elements.get(element.id)!.get("source")!;
    Reflect.set(window, "offloadedRowReferences", [new WeakRef(row), new WeakRef(elementRow)]);
  }, `${room}:source-block`);
  await page.getByRole("button", { name: "Close references", exact: true }).click();
  await page.getByRole("button", { name: "Close source", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as DatabaseMemoryWindow).__rivtoDocuments.database.documents.get(
            "source",
          )!.updates.length,
      ),
    )
    .toBe(0);
  expect(
    await page.evaluate(
      (id) =>
        (
          window as unknown as DatabaseMemoryWindow
        ).__rivtoDocuments.database.findDocumentIdsWithBlock(id),
      `${room}:source-block`,
    ),
  ).toEqual(["source"]);
  if (browserName === "chromium") {
    const session = await page.context().newCDPSession(page);
    for (let index = 0; index < 8; index++) {
      await page.waitForTimeout(0);
      await session.send("HeapProfiler.collectGarbage");
    }
    expect(
      await page.evaluate(() =>
        (Reflect.get(window, "offloadedRowReferences") as WeakRef<object>[]).some((row) =>
          row.deref(),
        ),
      ),
    ).toBe(false);
    await session.detach();
  }
  await page.getByRole("button", { name: "Open source", exact: true }).click();
  await expect(
    page.locator('[data-document-pane="source"] [data-block-content]').first(),
  ).toHaveText("Source text");
  const restored = await page.evaluate((id) => {
    const host = (window as unknown as DatabaseMemoryWindow).__rivtoDocuments;
    return {
      block: host.database.blocks.get(id)?.get("source")?.props.largeRow,
      element: host.database.elements.get("offloaded-element")?.get("source")?.props.largeRow,
      locations: host.database.findDocumentIdsWithBlock(id),
    };
  }, `${room}:source-block`);
  expect(restored).toEqual({
    block: "x".repeat(300_000),
    element: "y".repeat(300_000),
    locations: ["source"],
  });
});

test("closed rows retain block lookup without a workspace index", async ({ page }) => {
  await page.goto(`/?embeddings=1&room=closed-row-lookup-${crypto.randomUUID()}`);
  await expect(
    page.locator('[data-document-pane="source"] [data-block-content]').first(),
  ).toBeVisible();
  const result = await page.evaluate(async () => {
    const host = (window as unknown as DatabaseMemoryWindow).__rivtoDocuments;
    const existing = host.editor.getDocument("source")!;
    const Database = host.database.constructor as typeof DemoDatabase;
    const Model = existing.constructor as typeof DBDocumentModel;
    const Adapter = Reflect.get(existing, "crdt").constructor as typeof YjsDoc;
    const database = new Database();
    const model = new Model(new Adapter("closed"), database);
    model.blocks.insertBlock({ id: "lookup-block", type: "paragraph", content: "saved" });
    const other = new Model(new Adapter("other"), database);
    other.blocks.insertBlock({ id: "lookup-block", type: "paragraph", content: "other" });
    await model.destroy();
    const closed = database.findDocumentIdsWithBlock("lookup-block");
    const closedRow = database.blocks.get("lookup-block")?.has("closed") ?? false;
    const otherRow = database.blocks.get("lookup-block")?.get("other")?.content;
    const reopened = new Model(new Adapter("closed"), database);
    const restored = database.blocks.get("lookup-block")?.get("closed")?.content;
    const reopenedLookup = database.findDocumentIdsWithBlock("lookup-block");
    await reopened.destroy();
    await other.destroy();
    database.destroy();
    return { closed, closedRow, otherRow, restored, reopenedLookup };
  });
  expect(result).toEqual({
    closed: ["closed", "other"],
    closedRow: false,
    otherRow: "other",
    restored: "saved",
    reopenedLookup: ["closed", "other"],
  });
});

for (const indexed of [false, true]) {
  test(`reconciles closed block lookup after an offline deletion (indexed: ${indexed})`, async ({
    page,
  }) => {
    await page.goto(`/?embeddings=1&room=closed-deletion-${crypto.randomUUID()}`);
    await expect(
      page.locator('[data-document-pane="source"] [data-block-content]').first(),
    ).toBeVisible();
    const result = await page.evaluate(async (indexed) => {
      const host = (window as unknown as DatabaseMemoryWindow).__rivtoDocuments;
      const existing = host.editor.getDocument("source")!;
      const Database = host.database.constructor as typeof DemoDatabase;
      const Model = existing.constructor as typeof DBDocumentModel;
      const Adapter = Reflect.get(existing, "crdt").constructor as typeof YjsDoc;
      const root = new Adapter("lookup-root");
      const database = new Database(indexed ? root : undefined);
      const local = new Model(new Adapter("closed"), database);
      local.blocks.insertBlock({ id: "deleted-offline", type: "paragraph", content: "saved" });
      const peerAdapter = new Adapter("closed");
      peerAdapter.applySnapshot(Reflect.get(local, "crdt").getSnapshot());
      const peerDatabase = new Database();
      const peer = new Model(peerAdapter, peerDatabase);
      await local.destroy();
      const before = database.findDocumentIdsWithBlock("deleted-offline");
      peer.blocks.removeBlock("deleted-offline");
      database.saveUpdate("closed", peerAdapter.getSnapshot());
      const notifications: string[][] = [];
      const unsubscribe = database.subscribe(() => {
        notifications.push(database.findDocumentIdsWithBlock("deleted-offline"));
      });
      const reopened = new Model(new Adapter("closed"), database);
      const after = database.findDocumentIdsWithBlock("deleted-offline");
      const deleted = reopened.blocks.getBlockNode("deleted-offline") === undefined;
      unsubscribe();
      await reopened.destroy();
      await peer.destroy();
      database.destroy();
      peerDatabase.destroy();
      await root.destroy();
      return { before, after, deleted, notifications };
    }, indexed);
    expect(result).toEqual({ before: ["closed"], after: [], deleted: true, notifications: [[]] });
  });
}

test("reopening during final release preserves saved and offline edits", async ({ page }) => {
  const room = `release-race-${crypto.randomUUID()}`;
  await page.goto(`/?embeddings=1&room=${room}`);
  await expect(
    page.locator('[data-document-pane="source"] [data-block-content]').first(),
  ).toHaveText("Source text");
  await page.evaluate(async () => {
    const host = (window as unknown as DatabaseMemoryWindow).__rivtoDocuments;
    const lease = await host.editor.acquireEditor("source");
    const crdt = Reflect.get(lease.document, "crdt") as YjsDoc;
    const Adapter = crdt.constructor as typeof YjsDoc;
    const peer = new Adapter("source");
    crdt.transact(() => crdt.getText("release-race").insert(0, "base"));
    peer.applySnapshot(crdt.getSnapshot());
    crdt.transact(() => crdt.getText("release-race").insert(4, "L"));
    peer.transact(() => peer.getText("release-race").insert(4, "R"));
    Reflect.set(window, "releaseRace", { lease, peer });
  });
  await page.getByRole("button", { name: "Close references", exact: true }).click();
  await page.getByRole("button", { name: "Close source", exact: true }).click();
  const result = await page.evaluate(async () => {
    const host = (window as unknown as DatabaseMemoryWindow).__rivtoDocuments;
    const probe = Reflect.get(window, "releaseRace") as {
      lease: Awaited<ReturnType<EditorStorage["acquireEditor"]>>;
      peer: YjsDoc;
    };
    const previous = probe.lease.editor;
    const closing = probe.lease.release();
    const opening = host.editor.acquireEditor("source");
    await closing;
    const reopened = await opening;
    const crdt = Reflect.get(reopened.document, "crdt") as YjsDoc;
    const local = crdt.getText("release-race").toString();
    crdt.applySnapshot(probe.peer.getSnapshot());
    probe.peer.applySnapshot(crdt.getSnapshot());
    const merged = crdt.getText("release-race").toString();
    const peerValue = probe.peer.getText("release-race").toString();
    const freshEditor = reopened.editor !== previous;
    await reopened.release();
    await probe.peer.destroy();
    Reflect.deleteProperty(window, "releaseRace");
    return { local, merged, peerValue, freshEditor };
  });
  expect(result.local).toBe("baseL");
  expect(result.merged).toMatch(/^base(?:LR|RL)$/);
  expect(result.peerValue).toBe(result.merged);
  expect(result.freshEditor).toBe(true);
});

for (const fails of [false, true]) {
  test(`persists the final provider update on close (disconnect fails: ${fails})`, async ({
    page,
    browserName,
  }) => {
    await page.goto(`/?embeddings=1&room=final-provider-${crypto.randomUUID()}`);
    await expect(
      page.locator('[data-document-pane="source"] [data-block-content]').first(),
    ).toBeVisible();
    const result = await page.evaluate(async (fails) => {
      const host = (window as unknown as DatabaseMemoryWindow).__rivtoDocuments;
      const existing = host.editor.getDocument("source")!;
      const Database = host.database.constructor as typeof DemoDatabase;
      const Model = existing.constructor as typeof DBDocumentModel;
      const Adapter = Reflect.get(existing, "crdt").constructor as typeof YjsDoc;
      const database = new Database();
      const adapter = new Adapter("provider-final");
      const document = new Model(adapter, database);
      const nativeDocument = new WeakRef(adapter.doc);
      adapter.transact(() => adapter.getText("value").insert(0, "base"));
      const peer = new Adapter("provider-final");
      peer.applySnapshot(adapter.getSnapshot());
      peer.transact(() => peer.getText("value").insert(4, "R"));
      await adapter.attachProvider({
        id: "final-update",
        connect: async () => {},
        disconnect: async (doc) => {
          doc.applySnapshot(peer.getSnapshot());
          if (fails) {
            throw new Error("disconnect failed");
          }
        },
      });
      let failed = false;
      try {
        await document.destroy();
      } catch (error) {
        if (String(error) !== "Error: disconnect failed") {
          throw error;
        }
        failed = true;
      }
      const offloaded = database.documents.get("provider-final")!.updates.length === 0;
      const restored = new Adapter("provider-final");
      database.restore(restored);
      const value = restored.getText("value").toString();
      await restored.destroy();
      await peer.destroy();
      Reflect.set(window, "finalProviderProbe", { database, document, nativeDocument });
      return { failed, offloaded, value };
    }, fails);
    expect(result).toEqual({ failed: fails, offloaded: true, value: "baseR" });
    if (browserName === "chromium") {
      const session = await page.context().newCDPSession(page);
      for (let index = 0; index < 8; index++) {
        await page.waitForTimeout(0);
        await session.send("HeapProfiler.collectGarbage");
      }
      const retained = await page.evaluate(() =>
        Boolean(Reflect.get(window, "finalProviderProbe").nativeDocument.deref()),
      );
      expect(retained).toBe(false);
      await session.detach();
    }
    await page.evaluate(() => {
      Reflect.get(window, "finalProviderProbe").database.destroy();
      Reflect.deleteProperty(window, "finalProviderProbe");
    });
  });
}
