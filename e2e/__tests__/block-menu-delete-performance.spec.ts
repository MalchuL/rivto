import { measureEventDelivery } from "./measure-event-delivery";
import { expect, test, type Locator, type Page } from "@playwright/test";

for (const repeat of [0, 200]) {
  test(`deletes a block from its handle menu, repeat=${repeat}`, async ({ page, browserName }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.goto(`/?repeat=${repeat}`);
    const surface = page.locator('[data-journal-document="today"] > .page-surface');
    await surface.locator("[data-block-content]").first().waitFor();
    const id = await page.evaluate(() => {
      const editor = window.__rivtoDemo.editor;
      const first = editor.blocks.getRootIds()[0]!;
      return editor.blocks.insertBlock(
        { type: "paragraph", content: "Menu delete performance" },
        editor.blocks.getInsertionDestinationAfter(first),
      ).id;
    });
    const block = surface.locator(`[data-block-id="${id}"]`).first();
    const samples = [];
    for (let index = 0; index < 3; index++) {
      await block.locator(":scope > .rivto-block-row").hover();
      await block.locator(":scope > .rivto-block-row .block-handle").click({ button: "right" });
      const action = page.getByRole("menuitem", { name: "Delete", exact: true });
      await expect(action).toBeVisible();
      samples.push(await measureClick(page, action));
      await expect(block).toHaveCount(0);
      await page.keyboard.press("ControlOrMeta+z");
      await expect(block).toBeVisible();
    }
    console.log(JSON.stringify({ interaction: "block-menu-delete", browserName, repeat, samples }));
  });
}

/**
 * Measures a real menu click and the two animation frames following its delivery.
 *
 * @param page - Warm editor with the block menu open.
 * @param action - Visible Delete menu item.
 * @returns Synchronous click and two-frame durations in milliseconds.
 * @throws If browser input or timing observation fails.
 */
async function measureClick(page: Page, action: Locator) {
  return measureEventDelivery(page, "click", () => action.click());
}
