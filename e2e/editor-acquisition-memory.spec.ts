import { expect, test } from "@playwright/test";
import type { EditorStorage } from "@chulane/rivto-react";

/** References held to check collection after an editor acquisition is released. */
interface AcquisitionMemoryWindow extends Window {
  readonly __rivtoDocuments: { readonly editor: EditorStorage };
  acquisitionProbe: {
    readonly release: () => Promise<void>;
    readonly editor: WeakRef<object>;
    readonly document: WeakRef<object>;
  };
}

test("a completed editor acquisition release does not retain the editor or document", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "The forced garbage collection protocol is Chromium-only");
  await page.goto(`/?embeddings=1&room=acquisition-${crypto.randomUUID()}`);
  await expect(
    page.locator('[data-document-pane="source"] [data-block-content]').first(),
  ).toBeVisible();
  await page.evaluate(async () => {
    const host = window as unknown as AcquisitionMemoryWindow;
    const Storage = host.__rivtoDocuments.editor.constructor as typeof EditorStorage;
    const storage = new Storage();
    const acquisition = await storage.acquireEditor("memory-probe");
    host.acquisitionProbe = {
      release: acquisition.release,
      editor: new WeakRef(acquisition.editor),
      document: new WeakRef(acquisition.document),
    };
    await acquisition.release();
    await storage.destroy();
  });
  const session = await page.context().newCDPSession(page);
  await expect
    .poll(async () => {
      await session.send("HeapProfiler.collectGarbage");
      return page.evaluate(() => {
        const { editor, document } = (window as unknown as AcquisitionMemoryWindow)
          .acquisitionProbe;
        return { editor: Boolean(editor.deref()), document: Boolean(document.deref()) };
      });
    })
    .toEqual({ editor: false, document: false });
  await page.evaluate(() =>
    (window as unknown as AcquisitionMemoryWindow).acquisitionProbe.release(),
  );
  await session.detach();
});
