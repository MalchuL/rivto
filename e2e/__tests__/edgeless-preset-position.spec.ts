import { expect, test, type Page } from "@playwright/test";

/**
 * Measures one real preset pointer movement and the following two paint frames.
 *
 * @param page - Warm demo with the preset pointer captured.
 * @param x - Client X coordinate of the next pointer sample.
 * @param y - Client Y coordinate of the next pointer sample.
 * @returns Synchronous delivery and two-frame durations in milliseconds.
 */
async function measurePresetDrag(page: Page, x: number, y: number) {
  await page.evaluate(() => {
    performance.clearMarks("preset-start");
    performance.clearMarks("preset-sync");
    performance.clearMarks("preset-rendered");
    (window as Window & { presetMeasurementArmed?: boolean }).presetMeasurementArmed = true;
  });
  await page.mouse.move(x, y);
  await page.waitForFunction(() => performance.getEntriesByName("preset-rendered").length > 0);
  return page.evaluate(() => {
    const start = performance.getEntriesByName("preset-start")[0].startTime;
    return {
      sync: performance.getEntriesByName("preset-sync")[0].startTime - start,
      rendered: performance.getEntriesByName("preset-rendered")[0].startTime - start,
    };
  });
}

for (const repeat of [0, 200]) {
  test(`toolbar preview matches committed placement after pan and zoom, repeat=${repeat}`, async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const state = window as Window & { presetMeasurementArmed?: boolean };
      window.addEventListener(
        "pointermove",
        () => {
          if (state.presetMeasurementArmed) {
            performance.mark("preset-start");
          }
        },
        true,
      );
      window.addEventListener("pointermove", () => {
        if (state.presetMeasurementArmed) {
          state.presetMeasurementArmed = false;
          performance.mark("preset-sync");
          requestAnimationFrame(() =>
            requestAnimationFrame(() => performance.mark("preset-rendered")),
          );
        }
      });
    });
    await page.goto(`/?repeat=${repeat}`);
    await page.locator('[data-editor-mode="edgeless"]').click();
    const canvas = page.locator(".edgeless-viewport");
    await canvas.hover({ position: { x: 24, y: 24 } });
    await page.mouse.wheel(48, 72);
    await expect(canvas).toHaveAttribute("data-edgeless-pan-x", "-48");
    await page.getByRole("button", { name: "Zoom in", exact: true }).click();
    await expect(canvas).toHaveAttribute("data-edgeless-zoom", "1.1");
    const toolbar = page.getByRole("toolbar", { name: "Visual objects" });
    await toolbar.getByRole("button", { name: "Shapes", exact: true }).click();
    const button = (await toolbar
      .getByRole("button", { name: "Ellipse", exact: true })
      .boundingBox())!;
    const area = (await canvas.boundingBox())!;
    const ellipse = page.locator('[data-edgeless-visual-kind="ellipse"]');
    const count = await ellipse.count();
    await page.mouse.move(button.x + button.width / 2, button.y + button.height / 2);
    await page.mouse.down();
    await page.mouse.move(area.x + 650, area.y + 400, { steps: 8 });
    const ghost = page.locator(".edgeless-preset-ghost");
    await expect(ghost).toBeVisible();
    const timing = await measurePresetDrag(page, area.x + 655, area.y + 400);
    console.log(`preset-drag repeat=${repeat}: ${JSON.stringify(timing)}`);
    const preview = (await ghost.boundingBox())!;
    await page.mouse.up();
    await expect(ellipse).toHaveCount(count + 1);
    const placed = (await ellipse.last().boundingBox())!;
    expect(placed.x).toBeCloseTo(preview.x, 0);
    expect(placed.y).toBeCloseTo(preview.y, 0);
    expect(placed.width).toBeCloseTo(preview.width, 0);
    expect(placed.height).toBeCloseTo(preview.height, 0);
  });
}
