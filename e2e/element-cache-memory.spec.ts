import { expect, test } from "@playwright/test";
import type { YjsDoc } from "@chulane/crdt-doc";
import type { DocumentEditorAPI } from "@chulane/rivto";

/** Demo runtime and detached element snapshots observed by this regression. */
interface ElementMemoryWindow extends Window {
  readonly __rivtoDemo: { readonly editor: DocumentEditorAPI };
  snapshotRefs: WeakRef<object>[];
}

/**
 * Caches element snapshots and removes their records through a separate CRDT peer.
 *
 * @returns The number of deleted records still present in the receiving model.
 */
async function deleteElementsRemotely(): Promise<number> {
  const host = window as unknown as ElementMemoryWindow;
  const model = host.__rivtoDemo.editor.getDocument();
  const ids: string[] = [];
  model.history.batchUpdatesWithoutHistory(() => {
    for (let index = 0; index < 100; index++) {
      const element = model.elements.insertElement({
        id: `remote-memory-${index}`,
        type: "shape",
        frame: { x: 0, y: 0, width: 20, height: 30 },
        zIndex: 0,
        props: { payload: "x".repeat(5_000) },
      });
      ids.push(element.id);
    }
  });
  host.snapshotRefs = ids.flatMap((id) => {
    const tree = model.elements.getElement(id);
    if (!tree) {
      throw new Error(`Missing cached element ${id}`);
    }
    return [
      new WeakRef(tree),
      new WeakRef(model.elements.getElements(id)),
      new WeakRef(model.elements.getElementNodes(id)),
    ];
  });
  const local = Reflect.get(model, "crdt") as YjsDoc;
  const Remote = local.constructor as typeof YjsDoc;
  const remote = new Remote("element-memory-peer");
  remote.applySnapshot(local.getSnapshot());
  remote.transact(() => {
    const roots = remote.getArray<string>("rivto.editor.rootElementIds");
    const records = remote.getMap("rivto.editor.elements");
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
  return ids.filter((id) => model.elements.hasElement(id)).length;
}

test("collects element snapshots after remote deletion", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "The forced garbage collection protocol is Chromium-only");
  await page.goto("/?test_features=1");
  await expect(page.locator(".page-surface").first()).toBeVisible();
  expect(await page.evaluate(deleteElementsRemotely)).toBe(0);
  const session = await page.context().newCDPSession(page);
  await expect
    .poll(async () => {
      await session.send("HeapProfiler.collectGarbage");
      return page.evaluate(
        () =>
          (window as unknown as ElementMemoryWindow).snapshotRefs.filter((ref) => ref.deref())
            .length,
      );
    })
    .toBe(0);
  await session.detach();
});
