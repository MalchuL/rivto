import { expect, test, type Page } from "@playwright/test";

/** Opens one drawing tool from the existing visual toolbar. */
async function chooseDrawing(page: Page, name: "Marker" | "Eraser"): Promise<void> {
  const menu = page.getByRole("dialog", { name: "drawing tools" });
  if (!(await menu.isVisible())) {
    await page
      .getByRole("toolbar", { name: "Visual objects" })
      .getByRole("button", { name: "Drawing" })
      .click();
  }
  await menu.getByRole("button", { name, exact: true }).click();
}

for (const repeat of [0, 200]) {
  test(`erasure feedback and deletion at repeat=${repeat}`, async ({ page }) => {
    await page.goto(repeat ? `/?repeat=${repeat}` : "/");
    await page.locator('[data-editor-mode="edgeless"]').click();
    const viewport = page.locator(".edgeless-viewport");
    await viewport.evaluate((element) => element.scrollIntoView({ block: "start" }));
    const bounds = await viewport.boundingBox();
    if (!bounds) {
      throw new Error("Expected edgeless viewport");
    }
    const point = { x: bounds.x + bounds.width - 300, y: bounds.y + 200 };
    const drawings = page.locator('[data-edgeless-visual-kind="drawing"]');
    const initialCount = await drawings.count();
    const samples: number[] = [];
    for (let index = 0; index < 4; index += 1) {
      await chooseDrawing(page, "Marker");
      await page.mouse.move(point.x, point.y);
      await page.mouse.down();
      await page.mouse.move(point.x + 90, point.y + 20, { steps: 8 });
      await page.mouse.up();
      const drawing = drawings.last();
      await expect(drawings).toHaveCount(initialCount + 1);
      await chooseDrawing(page, "Eraser");
      const box = await drawing.boundingBox();
      if (!box) {
        throw new Error("Expected a drawing to erase");
      }
      await page.mouse.move(box.x - 5, box.y + box.height / 2);
      await page.mouse.down();
      await page.evaluate(() => {
        (window as Window & { eraseFrames?: number }).eraseFrames = undefined;
        window.addEventListener(
          "pointermove",
          () => {
            const start = performance.now();
            requestAnimationFrame(() =>
              requestAnimationFrame(() => {
                (window as Window & { eraseFrames?: number }).eraseFrames =
                  performance.now() - start;
              }),
            );
          },
          { once: true, capture: true },
        );
      });
      await page.mouse.move(box.x + box.width + 5, box.y + box.height / 2);
      await expect(drawing).toHaveAttribute("data-edgeless-erase-target", "true");
      await expect
        .poll(() => page.evaluate(() => (window as Window & { eraseFrames?: number }).eraseFrames))
        .toBeDefined();
      const elapsed = await page.evaluate(
        () => (window as Window & { eraseFrames?: number }).eraseFrames!,
      );
      await page.mouse.up();
      await expect(drawings).toHaveCount(initialCount);
      if (index > 0) {
        samples.push(elapsed);
      }
    }
    console.log(`eraser repeat=${repeat}: ${JSON.stringify(samples)}`);
  });
}
