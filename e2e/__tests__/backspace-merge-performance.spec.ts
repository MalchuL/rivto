import { expect, test, type Page } from "@playwright/test";

for (const repeat of [0, 200]) {
  test(`merges adjacent root blocks with Backspace, repeat=${repeat}`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto(`/?repeat=${repeat}`);
    await page.locator('[data-journal-document="today"] [data-block-content]').first().waitFor();
    const [previousId, blockId] = await page.evaluate(() =>
      window.__rivtoDemo.editor.blocks.getRootIds().slice(0, 2),
    );
    const samples = [];
    for (let index = 0; index < 3; index += 1) {
      const content = page.locator(`[data-block-id="${blockId}"] [data-block-content]`).first();
      await content.click();
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
          page.evaluate((id) => !!window.__rivtoDemo.editor.blocks.getBlockNode(id), blockId),
        )
        .toBe(false);
      await expect
        .poll(() => page.evaluate(() => window.__rivtoDemo.editor.selection.get()?.focusBlockId))
        .toBe(previousId);
      await page.keyboard.press("ControlOrMeta+z");
      await expect
        .poll(() =>
          page.evaluate((id) => !!window.__rivtoDemo.editor.blocks.getBlockNode(id), blockId),
        )
        .toBe(true);
    }
    console.log(JSON.stringify({ interaction: "backspace-merge", repeat, samples }));
  });
}

/**
 * Measures a real Backspace delivery and the following two browser frames.
 *
 * @param page - Warm editor with a caret at the beginning of the second root block.
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
