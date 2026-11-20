import { expect, test } from "@playwright/test";

for (const repeat of [0, 200]) {
  test(`secondary input cancels a drawing tool at repeat=${repeat}`, async ({ page }) => {
    await page.goto(repeat ? `/?repeat=${repeat}` : "/");
    await page.locator('[data-editor-mode="edgeless"]').click();
    const viewport = page.locator(".edgeless-viewport");
    await viewport.evaluate((element) => element.scrollIntoView({ block: "start" }));
    const bounds = await viewport.boundingBox();
    if (!bounds) {
      throw new Error("Expected the edgeless viewport");
    }
    const surface = page
      .locator('[data-rivto-block-editor][data-rivto-surface="edgeless"]')
      .first();
    const toolbar = page.getByRole("toolbar", { name: "Visual objects" });
    const menu = page.getByRole("dialog", { name: "drawing tools" });
    const samples: number[] = [];
    for (let index = 0; index < 4; index += 1) {
      if (!(await menu.isVisible())) {
        await toolbar.getByRole("button", { name: "Drawing" }).click();
      }
      await menu.getByRole("button", { name: "Marker", exact: true }).click();
      await expect(surface).toHaveAttribute("data-edgeless-capture-tool", "true");
      await page.evaluate(() => {
        (window as Window & { cancelFrames?: number }).cancelFrames = undefined;
        window.addEventListener(
          "pointerdown",
          () => {
            const start = performance.now();
            requestAnimationFrame(() =>
              requestAnimationFrame(() => {
                (window as Window & { cancelFrames?: number }).cancelFrames =
                  performance.now() - start;
              }),
            );
          },
          { once: true, capture: true },
        );
      });
      await page.mouse.click(bounds.x + bounds.width - 300, bounds.y + 200, { button: "right" });
      await expect(surface).toHaveAttribute("data-edgeless-capture-tool", "false");
      await expect
        .poll(() =>
          page.evaluate(() => (window as Window & { cancelFrames?: number }).cancelFrames),
        )
        .toBeDefined();
      const elapsed = await page.evaluate(
        () => (window as Window & { cancelFrames?: number }).cancelFrames!,
      );
      if (index > 0) {
        samples.push(elapsed);
      }
    }
    console.log(`tool cancellation repeat=${repeat}: ${JSON.stringify(samples)}`);
  });
}
