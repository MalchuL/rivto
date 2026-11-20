import { expect, test } from "@playwright/test";

for (const repeat of [0, 200]) {
  test(`ordinary pointer selection focuses editable content, repeat=${repeat}`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.goto(`/?repeat=${repeat}`);
    const editor = page.locator('[data-journal-document="today"] > .page-surface');
    const content = editor.locator("[data-block-content][contenteditable]").first();
    await expect(content).toBeVisible();
    const samples = [];
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => {
        const state = window as unknown as {
          pointerTiming: null | { sync: number; frames: number };
        };
        state.pointerTiming = null;
        let start = 0;
        window.addEventListener(
          "pointerdown",
          () => {
            start = performance.now();
          },
          { capture: true, once: true },
        );
        window.addEventListener(
          "pointerdown",
          () => {
            const sync = performance.now() - start;
            requestAnimationFrame(() =>
              requestAnimationFrame(() => {
                state.pointerTiming = { sync, frames: performance.now() - start };
              }),
            );
          },
          { once: true },
        );
      });
      await content.click({ position: { x: 5 + i, y: 5 } });
      await expect(content).toBeFocused();
      await page.waitForFunction(
        () => (window as unknown as { pointerTiming: unknown }).pointerTiming !== null,
      );
      samples.push(
        await page.evaluate(() => (window as unknown as { pointerTiming: unknown }).pointerTiming),
      );
    }
    console.log(JSON.stringify({ interaction: "page-pointer-selection", repeat, samples }));
    expect(await page.evaluate(() => window.getSelection()?.anchorNode !== null)).toBe(true);
  });
}
