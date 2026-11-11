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

/** Native document reference retained independently of a destroyed adapter. */
interface DestroyedAdapterProbe {
  readonly document: WeakRef<object>;
}

test("a retained destroyed adapter releases its native document", async ({ page, browserName }) => {
  await page.goto(`/?embeddings=1&room=destroyed-adapter-${crypto.randomUUID()}`);
  await expect(
    page.locator('[data-document-pane="source"] [data-block-content]').first(),
  ).toHaveText("Source text");
  const result = await page.evaluate(async () => {
    const host = (window as unknown as DatabaseMemoryWindow).__rivtoDocuments;
    const Document = host.registry.root.constructor as typeof YjsDoc;
    const adapter = new Document("destroyed-adapter-probe");
    adapter.getMap("root").set("payload", "x".repeat(1_000_000));
    const document = new WeakRef(adapter.doc);
    const unsubscribe = adapter.on("update", () => {});
    await adapter.destroy();
    unsubscribe();
    Reflect.set(window, "destroyedAdapterProbe", { adapter, document, unsubscribe });
    let accessRejected = false;
    try {
      void adapter.doc;
    } catch {
      accessRejected = true;
    }
    return { accessRejected };
  });
  if (browserName === "chromium") {
    const session = await page.context().newCDPSession(page);
    for (let index = 0; index < 8; index++) {
      await page.waitForTimeout(0);
      await session.send("HeapProfiler.collectGarbage");
    }
    const retained = await page.evaluate(() => {
      const probe = Reflect.get(window, "destroyedAdapterProbe") as DestroyedAdapterProbe;
      return probe.document.deref() !== undefined;
    });
    expect(retained).toBe(false);
    await session.detach();
  }
  expect(result.accessRejected).toBe(true);
});

for (const kind of ["map", "array"] as const) {
  test(`an unsubscribed ${kind} observer handle releases the closed document and callback`, async ({
    page,
    browserName,
  }) => {
    await page.goto(`/?embeddings=1&room=observer-handle-${crypto.randomUUID()}`);
    await expect(
      page.locator('[data-document-pane="source"] [data-block-content]').first(),
    ).toBeVisible();
    await page.evaluate(async (kind) => {
      const host = (window as any).__rivtoDocuments;
      const Adapter = host.registry.root.constructor;
      const adapter = new Adapter(`observer-${kind}`);
      const wrapper = kind === "map" ? adapter.getMap("root") : adapter.getArray("root");
      const callbackData = { bytes: new Uint8Array(1_000_000) };
      const payload = new WeakRef(callbackData);
      const nativeDocument = new WeakRef(adapter.doc);
      const unsubscribe = wrapper.observe(() => callbackData.bytes.length);
      unsubscribe();
      unsubscribe();
      await adapter.destroy();
      Reflect.set(window, "observerHandleProbe", { unsubscribe, payload, nativeDocument });
    }, kind);
    if (browserName === "chromium") {
      const session = await page.context().newCDPSession(page);
      for (let index = 0; index < 8; index++) {
        await page.waitForTimeout(0);
        await session.send("HeapProfiler.collectGarbage");
      }
      const retained = await page.evaluate(() => {
        const probe = Reflect.get(window, "observerHandleProbe");
        return { payload: !!probe.payload.deref(), nativeDocument: !!probe.nativeDocument.deref() };
      });
      expect(retained).toEqual({ payload: false, nativeDocument: false });
      await session.detach();
    }
  });
}

for (const operation of ["cleanup", "detach", "destroy", "destroy-failure"] as const) {
  test(`retained provider cleanup releases detached objects after ${operation}`, async ({
    page,
    browserName,
  }) => {
    await page.goto(`/?embeddings=1&room=provider-handle-${crypto.randomUUID()}`);
    await expect(
      page.locator('[data-document-pane="source"] [data-block-content]').first(),
    ).toBeVisible();
    await page.evaluate(async (operation) => {
      const host = (window as any).__rivtoDocuments;
      const Adapter = host.registry.root.constructor;
      const adapter = new Adapter(`provider-${operation}`);
      const provider = {
        id: "probe",
        bytes: new Uint8Array(1_000_000),
        connect: async () => {},
        disconnect: async () => {
          if (operation === "destroy-failure") {
            throw new Error("disconnect failed");
          }
        },
      };
      const adapterReference = new WeakRef(adapter);
      const providerReference = new WeakRef(provider);
      const cleanup = await adapter.attachProvider(provider);
      if (operation === "cleanup") {
        await cleanup();
      }
      if (operation === "detach") {
        await adapter.detachProvider("probe");
      }
      if (operation === "destroy-failure") {
        await adapter.destroy().then(
          () => {
            throw new Error("expected disconnect failure");
          },
          (error: Error) => {
            if (error.message !== "disconnect failed") {
              throw error;
            }
          },
        );
        await cleanup();
      } else {
        await adapter.destroy();
      }
      Reflect.set(window, "providerHandleProbe", { cleanup, adapterReference, providerReference });
    }, operation);
    if (browserName === "chromium") {
      const session = await page.context().newCDPSession(page);
      for (let index = 0; index < 8; index++) {
        await page.waitForTimeout(0);
        await session.send("HeapProfiler.collectGarbage");
      }
      const retained = await page.evaluate(() => {
        const probe = Reflect.get(window, "providerHandleProbe");
        return {
          adapter: !!probe.adapterReference.deref(),
          provider: !!probe.providerReference.deref(),
        };
      });
      expect(retained).toEqual({ adapter: false, provider: false });
      await session.detach();
    }
  });
}
