import { expect, test } from "@playwright/test";
import type { CRDTDoc } from "@chulane/crdt-doc";
import type { DocumentEditorAPI } from "@chulane/rivto";

/** References used to check whether the last structural transaction is retained. */
interface TransactionMemoryWindow extends Window {
  readonly __rivtoDemo: { readonly editor: DocumentEditorAPI };
  transactionRef: WeakRef<object>;
  removedBlockId: string;
}

test("collects the last structural transaction without breaking undo", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "The forced garbage collection protocol is Chromium-only");
  await page.goto("/?test_features=1");
  await expect(page.locator(".page-surface").first()).toBeVisible();
  const notifications = await page.evaluate(() => {
    const host = window as unknown as TransactionMemoryWindow;
    const model = host.__rivtoDemo.editor.getDocument();
    const crdt = (model as unknown as { crdt: CRDTDoc }).crdt;
    const block = model.blocks.insertBlock({ type: "paragraph", content: "Transaction memory" });
    model.history.clear();
    host.removedBlockId = block.id;
    let notifications = 0;
    const unsubscribeStructure = model.blocks.subscribeStructure(() => {
      notifications++;
    });
    const unobserve = crdt.getArray<string>("rivto.editor.roots").observe((_, transaction) => {
      if (transaction && typeof transaction === "object") {
        host.transactionRef = new WeakRef(transaction);
      }
    });
    model.blocks.removeBlock(block.id);
    unobserve();
    unsubscribeStructure();
    return notifications;
  });
  expect(notifications).toBe(1);
  const session = await page.context().newCDPSession(page);
  await expect
    .poll(async () => {
      await session.send("HeapProfiler.collectGarbage");
      return page.evaluate(() =>
        Boolean((window as unknown as TransactionMemoryWindow).transactionRef.deref()),
      );
    })
    .toBe(false);
  expect(
    await page.evaluate(() => {
      const host = window as unknown as TransactionMemoryWindow;
      const model = host.__rivtoDemo.editor.getDocument();
      model.history.undo();
      return model.blocks.getBlock(host.removedBlockId)?.content;
    }),
  ).toBe("Transaction memory");
  await session.detach();
});
