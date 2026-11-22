import { measureEventDelivery } from "./measure-event-delivery";
import { expect, test, type Page } from "@playwright/test";

for (const repeat of [0, 200]) {
  test(`moves a caret between journal editors, repeat=${repeat}`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto(`/?repeat=${repeat}`);
    const today = page.locator('[data-journal-document="today"]');
    const yesterday = page.locator('[data-journal-document="yesterday"]');
    await yesterday.getByRole("button", { name: "Add block", exact: true }).click();
    const lastToday = today.locator("[data-block-content]").last();
    const firstYesterday = yesterday.locator("[data-block-content]").first();
    const samples = [];
    for (let index = 0; index < 3; index++) {
      await firstYesterday.click();
      await page.keyboard.press("Home");
      samples.push(await measureUp(page));
      await expect(lastToday).toBeFocused();
    }
    console.log(JSON.stringify({ interaction: "adjacent-editor-caret", repeat, samples }));
  });
}

/**
 * Measures ArrowUp delivery and the following two browser frames.
 *
 * @param page - Warm journal focused at the start of yesterday's editor.
 * @returns Synchronous delivery and two-frame durations in milliseconds.
 */
async function measureUp(page: Page) {
  return measureEventDelivery(page, "keydown", () => page.keyboard.press("ArrowUp"));
}
