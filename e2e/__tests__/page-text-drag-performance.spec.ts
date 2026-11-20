import { expect, test, type Locator } from "@playwright/test";

for (const repeat of [0, 200]) {
  test(`drags a partial text selection, repeat=${repeat}`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.goto(`/?repeat=${repeat}`);
    const contents = page.locator(
      '[data-journal-document="today"] [data-block-content]:not(:empty):not([data-rivto-panel] [data-rivto-panel] [data-block-content])',
    );
    const first = contents.nth(0);
    const second = contents.nth(1);
    const firstId = await first
      .locator("xpath=ancestor::*[@data-block-id][1]")
      .getAttribute("data-block-id");
    const secondId = await second
      .locator("xpath=ancestor::*[@data-block-id][1]")
      .getAttribute("data-block-id");
    await expect(second).toBeVisible();
    const samples = [];
    for (let index = 0; index < 3; index++) {
      await page.keyboard.down("Alt");
      await page.keyboard.down("Shift");
      const start = await textPoint(first, 2);
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      const end = await textPoint(second, 8);
      await page.evaluate(() => {
        const state = window as unknown as { dragTiming: unknown };
        state.dragTiming = null;
        window.addEventListener(
          "pointermove",
          () => {
            const start = performance.now();
            window.addEventListener(
              "pointermove",
              () => {
                const sync = performance.now() - start;
                requestAnimationFrame(() =>
                  requestAnimationFrame(() => {
                    state.dragTiming = { sync, frames: performance.now() - start };
                  }),
                );
              },
              { once: true },
            );
          },
          { capture: true, once: true },
        );
      });
      await page.mouse.move(end.x, end.y);
      await page.waitForFunction(() => (window as unknown as { dragTiming: unknown }).dragTiming);
      samples.push(
        await page.evaluate(() => (window as unknown as { dragTiming: unknown }).dragTiming),
      );
      await page.mouse.up();
      await page.keyboard.up("Shift");
      await page.keyboard.up("Alt");
      await expect
        .poll(() =>
          page.evaluate(() => {
            const selection = document.getSelection();
            const blockId = (node: Node | null) => {
              const element = node instanceof Element ? node : node?.parentElement;
              return element?.closest("[data-block-id]")?.getAttribute("data-block-id");
            };
            return [blockId(selection?.anchorNode ?? null), blockId(selection?.focusNode ?? null)];
          }),
        )
        .toEqual([firstId, secondId]);
    }
    console.log(JSON.stringify({ interaction: "page-text-drag", repeat, samples }));
  });
}

/**
 * Finds a visible point at a text offset for a real pointer drag.
 *
 * @param content - Editable block content.
 * @param offset - UTF-16 text offset within its first node.
 * @returns Client coordinates inside the requested character.
 */
async function textPoint(content: Locator, offset: number): Promise<{ x: number; y: number }> {
  return content.evaluate((element, requestedOffset) => {
    const node = element.firstChild!;
    const range = document.createRange();
    range.setStart(node, requestedOffset);
    range.setEnd(node, Math.min(node.textContent?.length ?? 0, requestedOffset + 1));
    const rect = range.getBoundingClientRect();
    return { x: rect.left + 1, y: rect.top + rect.height / 2 };
  }, offset);
}
