import { measureEventDelivery } from "./measure-event-delivery";
import { expect, test, type Page } from "@playwright/test";

for (const repeat of [0, 200]) {
  test(`updates a React canvas creation preview, repeat=${repeat}`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto(`/?repeat=${repeat}`);
    await page.locator('[data-journal-document="today"] [data-block-content]').first().waitFor();
    await page.locator('[data-editor-mode="edgeless"]').click();
    const toolbar = page.getByRole("toolbar", { name: "Visual objects" });
    const viewport = page.locator(".edgeless-viewport");
    const samples = [];
    for (let index = 0; index < 3; index++) {
      await toolbar.getByRole("button", { name: "Shapes", exact: true }).click();
      await toolbar.getByRole("button", { name: "Rectangle", exact: true }).click();
      const area = (await viewport.boundingBox())!;
      await page.mouse.move(area.x + 350, area.y + 220);
      await page.mouse.down();
      samples.push(await measureMove(page, area.x + 500, area.y + 320));
      const preview = page.locator('[data-edgeless-creation-preview="rectangle"]');
      await expect(preview).toBeVisible();
      await page.keyboard.press("Escape");
      await page.mouse.up();
      await expect(preview).toHaveCount(0);
    }
    console.log(JSON.stringify({ interaction: "react-tool-move", repeat, samples }));
  });
}

/**
 * Measures one real pointer move and the next two rendering frames.
 *
 * @param page - Warm demo with a captured creation gesture.
 * @param x - Destination viewport X coordinate in CSS pixels.
 * @param y - Destination viewport Y coordinate in CSS pixels.
 * @returns Synchronous and two-frame timings in milliseconds.
 */
async function measureMove(page: Page, x: number, y: number) {
  return measureEventDelivery(page, "pointermove", () => page.mouse.move(x, y));
}
