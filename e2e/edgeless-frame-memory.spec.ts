import { expect, test } from "@playwright/test";
import type { CRDTMap, YjsDoc } from "@chulane/crdt-doc";
import type { DocumentEditorAPI } from "@chulane/rivto";

interface FrameRecord {
  readonly frame: CRDTMap<{ x: number; y: number; width: number; height: number }>;
}

interface FrameWriteWindow extends Window {
  readonly __rivtoDemo: { readonly editor: DocumentEditorAPI };
  frameWrites: { unchanged: string[]; changed: string[] };
}

test("editing an edgeless block does not rewrite unchanged frame fields", async ({ page }) => {
  await page.goto("/?test_features=1");
  await page.locator('[data-editor-mode="edgeless"]').click();
  const first = page.locator(".edgeless-viewport [data-block-content][contenteditable]").first();
  await first.click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  const content = page.locator("[data-block-content][contenteditable]:focus");
  await expect(content).toHaveText("");
  await page.evaluate(() => {
    const host = window as unknown as FrameWriteWindow;
    const crdt = Reflect.get(host.__rivtoDemo.editor.getDocument(), "crdt") as YjsDoc;
    const elements = crdt.getMap<Record<string, CRDTMap<FrameRecord>>>("rivto.editor.elements");
    host.frameWrites = { unchanged: [], changed: [] };
    for (const element of elements.values()) {
      const frame = element.get("frame");
      if (!frame) {
        continue;
      }
      let previous = frame.toObject();
      frame.observe((events) => {
        const next = frame.toObject();
        for (const event of events) {
          for (const key of event.keys) {
            const target = Object.is(previous[key], next[key]) ? "unchanged" : "changed";
            host.frameWrites[target].push(key);
          }
        }
        previous = next;
      });
    }
  });
  for (let index = 0; index < 40; index++) {
    await page.keyboard.insertText(`${index}-${"x".repeat(512)}`);
    await page.keyboard.press("Control+a");
    await page.keyboard.press("Backspace");
  }
  await expect(content).toHaveText("");
  await expect
    .poll(() => page.evaluate(() => (window as unknown as FrameWriteWindow).frameWrites.changed))
    .toContain("height");
  const writes = await page.evaluate(() => (window as unknown as FrameWriteWindow).frameWrites);
  expect(writes.unchanged).toEqual([]);
});
