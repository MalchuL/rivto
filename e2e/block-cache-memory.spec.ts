import { expect, test } from "@playwright/test";
import type { YjsDoc } from "@chulane/crdt-doc";
import type { DocumentEditorAPI } from "@chulane/rivto";

/** Demo runtime and detached block snapshots observed by this regression. */
interface BlockMemoryWindow extends Window {
  readonly __rivtoDemo: { readonly editor: DocumentEditorAPI };
  snapshotRefs: WeakRef<object>[];
}

/**
 * Caches block snapshots and removes their records through a separate CRDT peer.
 *
 * @returns The number of deleted records still present in the receiving model.
 */
async function deleteBlocksRemotely(): Promise<number> {
  const host = window as unknown as BlockMemoryWindow;
  const model = host.__rivtoDemo.editor.getDocument();
  const ids: string[] = [];
  model.history.batchUpdatesWithoutHistory(() => {
    for (let index = 0; index < 100; index++) {
      const block = model.blocks.insertBlock({
        id: `remote-block-memory-${index}`,
        type: "paragraph",
        content: "x".repeat(5_000),
      });
      ids.push(block.id);
    }
  });
  host.snapshotRefs = ids.flatMap((id) => {
    const tree = model.blocks.getBlock(id);
    const node = model.blocks.getBlockNode(id);
    if (!tree || !node) {
      throw new Error(`Missing cached block ${id}`);
    }
    return [new WeakRef(tree), new WeakRef(node), new WeakRef(node.childIds)];
  });
  const local = Reflect.get(model, "crdt") as YjsDoc;
  const Remote = local.constructor as typeof YjsDoc;
  const remote = new Remote("block-memory-peer");
  remote.applySnapshot(local.getSnapshot());
  remote.transact(() => {
    const roots = remote.getArray<string>("rivto.editor.roots");
    const records = remote.getMap("rivto.editor.blocks");
    for (const id of ids) {
      const index = roots.toArray().indexOf(id);
      if (index >= 0) {
        roots.delete(index, 1);
      }
      records.delete(id);
    }
  });
  local.applySnapshot(remote.getSnapshot());
  await remote.destroy();
  return ids.filter((id) => model.blocks.hasBlock(id)).length;
}

test("collects block snapshots after remote deletion", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "The forced garbage collection protocol is Chromium-only");
  await page.goto("/?test_features=1");
  await expect(page.locator(".page-surface").first()).toBeVisible();
  expect(await page.evaluate(deleteBlocksRemotely)).toBe(0);
  const session = await page.context().newCDPSession(page);
  await expect
    .poll(async () => {
      await session.send("HeapProfiler.collectGarbage");
      return page.evaluate(
        () =>
          (window as unknown as BlockMemoryWindow).snapshotRefs.filter((ref) => ref.deref()).length,
      );
    })
    .toBe(0);
  await session.detach();
});
