/** Modal drags must never auto-scroll the inert document behind the dialog. */
import { expect, test } from "@playwright/test";

for (const type of ["bento", "kanban"]) {
  test(`${type} modal drag keeps background scroll stable`, async ({ page }) => {
    await page.goto("/");
    const board = page.locator(`[data-block-type="${type}"]`).first();
    await board.scrollIntoViewIfNeeded();
    await board.getByRole("button", { name: `Expand ${type === "bento" ? "Bento" : "Kanban"}`, exact: true }).click();
    const modal = page.locator("dialog:modal");
    const handleClass = "page-drag-handle";
    const handles = modal.locator(`.${handleClass}`);
    const handle = type === "bento" ? handles.nth(1) : handles.last();
    await handle.locator("xpath=ancestor::*[@data-block-id][1]").hover();
    await handle.hover();
    const from = (await handle.boundingBox())!;
    const before = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }));
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + 10, from.y + 10, { steps: 3 });
    await page.mouse.move(400, 5, { steps: 15 });
    // Give the auto-scroll interval time to reveal movement of the inert page.
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }))).toEqual(before);
    await page.keyboard.press("Escape");
    await page.mouse.up();
  });
}
