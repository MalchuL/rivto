import { expect, test } from "@playwright/test";
import type { ReactEditorApi } from "@chulane/rivto-react";
import type { DocumentEditorAPI } from "@chulane/rivto";
import type { BlockEditorController, BlockEditorNodeApi } from "@chulane/rivto-page";

/** Browser-owned references used to observe Page node lifetimes. */
interface NodeMemoryWindow extends Window {
  readonly __rivtoDemo: {
    readonly reactEditor: ReactEditorApi;
    readonly editor: DocumentEditorAPI;
  };
  nodeMemoryRefs: WeakRef<BlockEditorNodeApi>[];
  subscribedNode: WeakRef<BlockEditorNodeApi>;
  disposeNode: () => void;
  restoreSubscribe: () => void;
  releasedNode: boolean;
  readonly __rivtoLifecycleEditor?: ReactEditorApi;
  heldNode: BlockEditorNodeApi;
  controllerRef: WeakRef<BlockEditorController>;
}

test("collects unused and subscribed page nodes while retaining subscription cleanup", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "The forced garbage collection protocol is Chromium-only");
  await page.goto("/?test_features=1");
  await expect(page.locator(".page-surface").first()).toBeVisible();
  await page.evaluate(() => {
    const host = window as unknown as NodeMemoryWindow;
    const panel = host.__rivtoDemo.reactEditor.panels.getDefault();
    if (!panel) {
      throw new Error("Demo panel is unavailable");
    }
    const controller = panel.page as BlockEditorController;
    host.nodeMemoryRefs = Array.from(
      { length: 1000 },
      (_, index) => new WeakRef(controller.getNode(`memory-unused-${index}`)),
    );
    const subscribed = controller.getNode("memory-subscribed");
    host.subscribedNode = new WeakRef(subscribed);
    host.disposeNode = subscribed.subscribe(() => {});
  });
  const session = await page.context().newCDPSession(page);
  await session.send("HeapProfiler.collectGarbage");
  await expect
    .poll(async () => {
      await session.send("HeapProfiler.collectGarbage");
      return page.evaluate(() => {
        const host = window as unknown as NodeMemoryWindow;
        return host.nodeMemoryRefs.filter((reference) => reference.deref()).length;
      });
    })
    .toBe(0);
  await expect
    .poll(async () => {
      await session.send("HeapProfiler.collectGarbage");
      return page.evaluate(() =>
        Boolean((window as unknown as NodeMemoryWindow).subscribedNode.deref()),
      );
    })
    .toBe(false);
  await page.evaluate(() => (window as unknown as NodeMemoryWindow).disposeNode());
  await session.detach();
});

test("a borrowed node does not retain its destroyed controller", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "The forced garbage collection protocol is Chromium-only");
  await page.goto("/?editorLifecycle=1");
  await expect(page.locator('[data-lifecycle-state="ready"]')).toBeVisible();
  await page.evaluate(() => {
    const host = window as unknown as NodeMemoryWindow;
    const panel = host.__rivtoLifecycleEditor?.panels.getDefault();
    if (!panel) {
      throw new Error("Lifecycle panel is unavailable");
    }
    const controller = panel.page as BlockEditorController;
    host.heldNode = controller.getNode("first-block");
    host.disposeNode = host.heldNode.subscribe(() => {});
    host.controllerRef = new WeakRef(controller);
  });
  await page.getByRole("button", { name: "Toggle mount", exact: true }).click();
  await expect(page.locator("[data-lifecycle-state]")).toHaveCount(0);
  const session = await page.context().newCDPSession(page);
  await expect
    .poll(async () => {
      await session.send("HeapProfiler.collectGarbage");
      return page.evaluate(() =>
        Boolean((window as unknown as NodeMemoryWindow).controllerRef.deref()),
      );
    })
    .toBe(false);
  expect(
    await page.evaluate(() => (window as unknown as NodeMemoryWindow).heldNode.getSnapshot()),
  ).toBeUndefined();
  await session.detach();
});

test("retains subscription cleanup when a host does not retain its callback", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "The forced garbage collection protocol is Chromium-only");
  await page.goto("/?test_features=1");
  await expect(page.locator(".page-surface").first()).toBeVisible();
  await page.evaluate(() => {
    const host = window as unknown as NodeMemoryWindow;
    const panel = host.__rivtoDemo.reactEditor.panels.getDefault();
    if (!panel) {
      throw new Error("Demo panel is unavailable");
    }
    const controller = panel.page as BlockEditorController;
    const blocks = controller.adapter.blocks;
    const original = blocks.subscribeBlockNode;
    host.releasedNode = false;
    blocks.subscribeBlockNode = (id, listener) =>
      id === "memory-noop-subscription"
        ? () => {
            host.releasedNode = true;
          }
        : original.call(blocks, id, listener);
    host.restoreSubscribe = () => {
      blocks.subscribeBlockNode = original;
    };
    const node = controller.getNode("memory-noop-subscription");
    host.subscribedNode = new WeakRef(node);
    node.subscribe(() => {});
  });
  const session = await page.context().newCDPSession(page);
  await expect
    .poll(async () => {
      await session.send("HeapProfiler.collectGarbage");
      return page.evaluate(() =>
        Boolean((window as unknown as NodeMemoryWindow).subscribedNode.deref()),
      );
    })
    .toBe(false);
  await page.evaluate(() => {
    const host = window as unknown as NodeMemoryWindow;
    host.restoreSubscribe();
    (host.__rivtoDemo.reactEditor.panels.getDefault()!.page as BlockEditorController).destroy();
  });
  expect(await page.evaluate(() => (window as unknown as NodeMemoryWindow).releasedNode)).toBe(
    true,
  );
  await session.detach();
});

for (const virtualized of [false, true]) {
  test(`collects deleted mounted block nodes with virtualization ${virtualized ? "on" : "off"}`, async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== "chromium",
      "The forced garbage collection protocol is Chromium-only",
    );
    await page.goto("/?test_features=1");
    await expect(page.locator(".page-surface").first()).toBeVisible();
    if (virtualized) {
      await page.getByRole("checkbox", { name: "Virtualize page", exact: true }).check();
    }
    const ids = await page.evaluate(() => {
      const host = window as unknown as NodeMemoryWindow;
      const editor = host.__rivtoDemo.editor;
      const inserted: string[] = [];
      editor.history.batchUpdatesWithoutHistory(() => {
        let after = editor.blocks.getRootIds()[0];
        for (let index = 0; index < 30; index++) {
          after = editor.blocks.insertBlock(
            { type: "paragraph", content: `Memory block ${index}` },
            editor.blocks.getInsertionDestinationAfter(after),
          ).id;
          inserted.push(after);
        }
      });
      return inserted;
    });
    await expect(page.locator(`[data-block-id="${ids[0]}"]`)).toHaveCount(1);
    await page.evaluate((inserted) => {
      const host = window as unknown as NodeMemoryWindow;
      const panel = host.__rivtoDemo.reactEditor.panels.getDefault();
      if (!panel) {
        throw new Error("Demo panel is unavailable");
      }
      const controller = panel.page as BlockEditorController;
      host.nodeMemoryRefs = inserted.map((id) => new WeakRef(controller.getNode(id)));
      host.__rivtoDemo.editor.history.batchUpdatesWithoutHistory(() =>
        host.__rivtoDemo.editor.blocks.removeBlocks(inserted),
      );
    }, ids);
    await expect(page.locator(`[data-block-id="${ids[0]}"]`)).toHaveCount(0);
    const session = await page.context().newCDPSession(page);
    await expect
      .poll(async () => {
        await session.send("HeapProfiler.collectGarbage");
        return page.evaluate(
          () =>
            (window as unknown as NodeMemoryWindow).nodeMemoryRefs.filter((reference) =>
              reference.deref(),
            ).length,
        );
      })
      .toBe(0);
    await session.detach();
  });
}
