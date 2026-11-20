import { expect, test, type Locator, type Page } from "@playwright/test";

for (const repeat of [0, 200]) {
  test(`moves a selected canvas card with the keyboard, repeat=${repeat}`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto(`/?repeat=${repeat}`);
    await page.locator('[data-journal-document="today"] [data-block-content]').first().waitFor();
    await page.locator('[data-editor-mode="edgeless"]').click();
    const card = page.locator("[data-edgeless-root]").first();
    const point = await cardChromePoint(card);
    await page.mouse.click(point.x, point.y);
    await expect(card).toHaveAttribute("data-block-selected", "true");
    const samples = [];
    for (let index = 0; index < 3; index++) {
      const before = await cardLeft(card);
      samples.push(await measureMove(page));
      await expect.poll(() => cardLeft(card)).toBe(before + 1);
    }
    console.log(JSON.stringify({ interaction: "canvas-keyboard-move", repeat, samples }));
  });
}

/**
 * Finds visible card chrome without hitting block content or editor controls.
 *
 * @param card - Rendered card inside the canvas viewport.
 * @returns Client coordinates for selecting the card.
 * @throws If no unobstructed chrome is visible.
 */
async function cardChromePoint(card: Locator): Promise<{ x: number; y: number }> {
  return card.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const viewport = element.closest(".edgeless-viewport")!.getBoundingClientRect();
    for (
      let y = Math.min(rect.bottom - 2, viewport.bottom - 2);
      y >= Math.max(rect.top + 2, viewport.top + 2);
      y -= 6
    ) {
      for (
        let x = Math.min(rect.right - 2, viewport.right - 2);
        x >= Math.max(rect.left + 2, viewport.left + 2);
        x -= 6
      ) {
        const hit = document.elementFromPoint(x, y);
        if (
          hit &&
          element.contains(hit) &&
          !hit.closest("[data-block-id], button, input, textarea, select, a, [data-edgeless-ui]")
        ) {
          return { x, y };
        }
      }
    }
    throw new Error("Expected visible card chrome");
  });
}

/**
 * Reads the card's displayed horizontal position from its left and transform.
 *
 * @param card - Rendered selected card.
 * @returns Horizontal position in CSS pixels.
 */
async function cardLeft(card: Locator): Promise<number> {
  return card.evaluate(
    (element) =>
      Number.parseFloat((element as HTMLElement).style.left) +
      new DOMMatrix((element as HTMLElement).style.transform || undefined).e,
  );
}

/**
 * Measures one ArrowRight delivery and the following two animation frames.
 *
 * @param page - Warm demo with a selected card.
 * @returns Synchronous delivery and two-frame timings in milliseconds.
 */
async function measureMove(page: Page): Promise<unknown> {
  await page.evaluate(() => {
    const state = window as unknown as { canvasMoveTiming: unknown };
    state.canvasMoveTiming = null;
    window.addEventListener(
      "keydown",
      () => {
        const start = performance.now();
        window.addEventListener(
          "keydown",
          () => {
            const sync = performance.now() - start;
            requestAnimationFrame(() =>
              requestAnimationFrame(() => {
                state.canvasMoveTiming = { sync, frames: performance.now() - start };
              }),
            );
          },
          { once: true },
        );
      },
      { capture: true, once: true },
    );
  });
  await page.keyboard.press("ArrowRight");
  await page.waitForFunction(
    () => (window as unknown as { canvasMoveTiming: unknown }).canvasMoveTiming,
  );
  return page.evaluate(() => (window as unknown as { canvasMoveTiming: unknown }).canvasMoveTiming);
}
