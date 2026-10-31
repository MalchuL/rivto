import { expect, test } from "@playwright/test";

/** Fractional diagonal input, decreasing momentum samples and a final direction reversal. */
const TRACKPAD_DELTAS = [
  [0.5, 1.25],
  [-0.25, 1.5],
  [0.75, -0.25],
  [48, 72],
  [80.25, 100.5],
  [-12, -16],
  [12, 16],
  [8, 12],
  [4, 6],
  [2, 3],
  [0.5, 0.75],
  [-1, -2],
] as const;

for (const repeat of [0, 200]) {
  for (const delta of [100, 120]) {
    test(`line-mode wheel step ${delta} visibly moves the dot grid, repeat=${repeat}`, async ({
      page,
    }) => {
      await page.clock.install({ time: new Date("2026-10-23T10:00:00Z") });
      await page.goto(`/?test_features=1&repeat=${repeat}`);
      const journal = page.locator('[data-journal-document="today"]');
      await journal.locator('[data-editor-mode="edgeless"]').click();
      const canvas = journal.locator(".edgeless-viewport");
      const bounds = (await canvas.boundingBox())!;
      await canvas.hover({ position: { x: bounds.width - 80, y: 180 } });
      await page.clock.pauseAt(new Date("2026-10-23T11:00:00Z"));
      const clip = { x: bounds.x + bounds.width - 120, y: bounds.y + 140, width: 80, height: 80 };
      const before = await page.screenshot({ clip });
      const lineHeight = await canvas.evaluate(
        (root) => Number.parseFloat(getComputedStyle(root).lineHeight) || 16,
      );
      await canvas.dispatchEvent("wheel", { deltaY: delta / lineHeight, deltaMode: 1 });
      await expect(canvas).not.toHaveAttribute("data-edgeless-pan-y", "0");
      await page.clock.runFor(16);
      const during = await page.screenshot({ clip });
      expect(during.equals(before)).toBe(false);
      await page.clock.runFor(500);
      await expect(canvas).toHaveAttribute("data-edgeless-pan-y", String(-delta));
      await expect(canvas).toHaveCSS("background-position", `0px ${-delta}px`);
      await expect(canvas.locator(".edgeless-grid-spotlight")).toHaveCSS(
        "background-position",
        `0px ${-delta}px`,
      );
      await expect(canvas.locator(".edgeless-plane")).toHaveCSS(
        "transform",
        `matrix(1, 0, 0, 1, 0, ${-delta})`,
      );
    });
  }
}

for (const repeat of [0, 200]) {
  test(`fractional diagonal trackpad input moves content and visible dots together, repeat=${repeat}`, async ({
    page,
  }) => {
    await page.goto(`/?test_features=1&repeat=${repeat}`);
    const journal = page.locator('[data-journal-document="today"]');
    await journal.locator('[data-editor-mode="edgeless"]').click();
    const canvas = journal.locator(".edgeless-viewport");
    const bounds = (await canvas.boundingBox())!;
    await canvas.hover({ position: { x: bounds.width - 80, y: 180 } });
    const card = canvas.locator("[data-edgeless-root]").first();
    const originalCard = (await card.boundingBox())!;
    const scrollY = await page.evaluate(() => window.scrollY);
    const clip = { x: bounds.x + bounds.width - 120, y: bounds.y + 140, width: 80, height: 80 };
    const before = await page.screenshot({ clip });
    let x = 0;
    let y = 0;
    for (const [deltaX, deltaY] of TRACKPAD_DELTAS) {
      await page.mouse.wheel(deltaX, deltaY);
      x -= deltaX;
      y -= deltaY;
      await expect(canvas).toHaveAttribute("data-edgeless-pan-x", String(x));
      await expect(canvas).toHaveAttribute("data-edgeless-pan-y", String(y));
      await expect(canvas).toHaveCSS("background-position", `${x}px ${y}px`);
      await expect(canvas.locator(".edgeless-grid-spotlight")).toHaveCSS(
        "background-position",
        `${x}px ${y}px`,
      );
    }
    expect((await page.screenshot({ clip })).equals(before)).toBe(false);
    const movedCard = (await card.boundingBox())!;
    expect(movedCard.x - originalCard.x).toBeCloseTo(x, 2);
    expect(movedCard.y - originalCard.y).toBeCloseTo(y, 2);
    expect(await page.evaluate(() => window.scrollY)).toBe(scrollY);
    await expect(canvas).toHaveAttribute("data-edgeless-zoom", "1");
  });
}
