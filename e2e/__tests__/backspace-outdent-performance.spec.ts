import { expect, test, type Page } from "@playwright/test";

for (const repeat of [0, 200]) {
  test(`outdents a nested block with Backspace, repeat=${repeat}`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto(`/?repeat=${repeat}`);
    await page.locator('[data-journal-document="today"] [data-block-content]').first().waitFor();
    const [parentId, blockId] = await page.evaluate(() =>
      window.__rivtoDemo.editor.blocks.getRootIds().slice(0, 2),
    );
    const content = page.locator(`[data-block-id="${blockId}"] [data-block-content]`).first();
    const samples = [];
    for (let index = 0; index < 3; index += 1) {
      await content.click();
      await page.keyboard.press("Tab");
      await expect
        .poll(() =>
          page.evaluate((id) => window.__rivtoDemo.editor.blocks.getParentId(id), blockId),
        )
        .toBe(parentId);
      await expect(content).toBeFocused();
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );
      await content.evaluate((element) => {
        (element as HTMLElement).focus();
        const range = document.createRange();
        range.selectNodeContents(element);
        range.collapse(true);
        const selection = window.getSelection()!;
        selection.removeAllRanges();
        selection.addRange(range);
      });
      samples.push(await measureBackspace(page));
      await expect
        .poll(() =>
          page.evaluate((id) => window.__rivtoDemo.editor.blocks.getParentId(id), blockId),
        )
        .toBeNull();
      await expect
        .poll(() => page.evaluate(() => window.__rivtoDemo.editor.selection.get()?.focusBlockId))
        .toBe(blockId);
      await expect(content).toBeFocused();
    }
    console.log(JSON.stringify({ interaction: "backspace-outdent", repeat, samples }));
  });
}

/**
 * Measures a real Backspace delivery and the following two browser frames.
 *
 * @param page - Warm editor with a caret at the beginning of a nested block.
 * @returns Synchronous and two-frame durations in milliseconds.
 */
async function measureBackspace(page: Page) {
  await page.evaluate(() => {
    performance.clearMarks("outdent-start");
    performance.clearMarks("outdent-sync");
    performance.clearMarks("outdent-rendered");
    const start = (event: KeyboardEvent) => {
      if (event.key !== "Backspace") {
        return;
      }
      window.removeEventListener("keydown", start, true);
      performance.mark("outdent-start");
    };
    const finish = (event: KeyboardEvent) => {
      if (event.key !== "Backspace") {
        return;
      }
      window.removeEventListener("keydown", finish);
      performance.mark("outdent-sync");
      requestAnimationFrame(() =>
        requestAnimationFrame(() => performance.mark("outdent-rendered")),
      );
    };
    window.addEventListener("keydown", start, true);
    window.addEventListener("keydown", finish);
  });
  await page.keyboard.press("Backspace");
  await page.waitForFunction(() => performance.getEntriesByName("outdent-rendered").length > 0);
  return page.evaluate(() => {
    const start = performance.getEntriesByName("outdent-start")[0].startTime;
    return {
      sync: performance.getEntriesByName("outdent-sync")[0].startTime - start,
      frames: performance.getEntriesByName("outdent-rendered")[0].startTime - start,
    };
  });
}
