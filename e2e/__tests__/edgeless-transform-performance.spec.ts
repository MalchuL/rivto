import { expect, test, type Page } from "@playwright/test";

/**
 * Measures one pointer sample and the following two rendering frames.
 *
 * @param page - Warm demo during an active transform gesture.
 * @param x - Client X coordinate of the sample.
 * @param y - Client Y coordinate of the sample.
 * @returns Synchronous delivery and two-frame durations in milliseconds.
 */
async function measureMove(page: Page, x: number, y: number) {
  await page.evaluate(() => {
    performance.clearMarks("move-start");
    performance.clearMarks("move-sync");
    performance.clearMarks("move-rendered");
    window.addEventListener("mousemove", () => performance.mark("move-start"), {
      capture: true,
      once: true,
    });
    window.addEventListener(
      "mousemove",
      () => {
        performance.mark("move-sync");
        requestAnimationFrame(() => requestAnimationFrame(() => performance.mark("move-rendered")));
      },
      { once: true },
    );
  });
  await page.mouse.move(x, y);
  await page.waitForFunction(() => performance.getEntriesByName("move-rendered").length > 0);
  return page.evaluate(() => {
    const start = performance.getEntriesByName("move-start")[0].startTime;
    return {
      sync: performance.getEntriesByName("move-sync")[0].startTime - start,
      rendered: performance.getEntriesByName("move-rendered")[0].startTime - start,
    };
  });
}

for (const repeat of [0, 200]) {
  test(`shape transform commits measured movement, repeat=${repeat}`, async ({ page }) => {
    await page.goto(`/?repeat=${repeat}`);
    await page.locator('[data-editor-mode="edgeless"]').click();
    const toolbar = page.getByRole("toolbar", { name: "Visual objects" });
    await toolbar.getByRole("button", { name: "Shapes", exact: true }).click();
    await page
      .getByRole("dialog", { name: "shapes tools" })
      .getByRole("button", { name: "Rectangle", exact: true })
      .click();
    const capture = page.locator(".edgeless-drawing-capture[data-active]");
    await expect(capture).toBeVisible();
    const area = (await capture.boundingBox())!;
    await page.mouse.click(area.x + area.width / 2, area.y + area.height / 2);
    const shape = page.locator('[data-edgeless-visual-kind="rectangle"][data-selected="true"]');
    await expect(shape).toHaveCount(1);
    await toolbar.getByRole("button", { name: "Select", exact: true }).click();
    const before = (await shape.boundingBox())!;
    const x = before.x + before.width / 2;
    const y = before.y + before.height / 2;
    await page.keyboard.down("Alt");
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 10, y + 5);
    const timing = await measureMove(page, x + 35, y + 20);
    await expect.poll(async () => (await shape.boundingBox())!.x - before.x).toBeGreaterThan(20);
    await page.mouse.up();
    await page.keyboard.up("Alt");
    expect((await shape.boundingBox())!.x - before.x).toBeGreaterThan(20);
    console.log(`shape-transform repeat=${repeat}: ${JSON.stringify(timing)}`);
  });
}
