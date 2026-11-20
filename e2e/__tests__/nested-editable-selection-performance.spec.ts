import { expect, test, type Page } from "@playwright/test";
import { BLOCK_ROW_SELECTOR, blockTypeSelector } from "../dom-markers";

/**
 * Opens an equivalent code-block fixture outside interaction timing.
 *
 * @param page - Browser page showing the production demo.
 * @param mode - Page or edgeless surface under test.
 * @param repeat - Number of additional demo blocks.
 * @returns The editable, its preview, and its measured pointer coordinates.
 */
async function prepare(page: Page, mode: "block" | "edgeless", repeat: number) {
  await page.goto(repeat ? `/?repeat=${repeat}` : "/");
  if (mode === "edgeless") {
    await page.locator('[data-editor-mode="edgeless"]').click();
  }
  const block = page.locator(blockTypeSelector("paragraph")).first();
  const editor = block.locator(`:scope > ${BLOCK_ROW_SELECTOR} .markdown-editor`);
  const preview = block.locator(`:scope > ${BLOCK_ROW_SELECTOR} .markdown-preview`);
  await editor.click();
  await editor.evaluate((element) => {
    element.textContent = `\`\`\`text\n${"const value = 42; ".repeat(40)}\n\`\`\``;
    element.dispatchEvent(new InputEvent("input", { bubbles: true }));
    (element as HTMLElement).blur();
  });
  const code = preview.locator("pre");
  await expect
    .poll(() => code.evaluate((element) => element.scrollWidth - element.clientWidth))
    .toBeGreaterThan(100);
  if (mode === "block") {
    const codeBox = await code.boundingBox();
    if (!codeBox) {
      throw new Error("Expected the rendered code block");
    }
    await page.mouse.move(codeBox.x + codeBox.width / 2, codeBox.y + codeBox.height / 2);
    await page.mouse.wheel(300, 0);
    await expect.poll(() => code.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  }
  await expect(preview).toBeVisible();
  const editable = code.locator(".markdown-code-editor");
  await code.evaluate((element) => {
    element.scrollLeft = 0;
  });
  await expect.poll(async () => (await editable.boundingBox())?.height ?? 0).toBeGreaterThan(0);
  const box = await editable.boundingBox();
  if (!box) {
    throw new Error("Expected the nested code editor");
  }
  return { editable, preview, box };
}

for (const mode of ["block", "edgeless"] as const) {
  for (const repeat of [0, 200]) {
    test(`selects nested code text in ${mode}, repeat=${repeat}`, async ({ page }) => {
      test.setTimeout(120_000);
      const samples: { sync: number; rendered: number }[] = [];
      for (let index = 0; index < 4; index += 1) {
        const { editable, preview, box } = await prepare(page, mode, repeat);
        await page.mouse.move(box.x + 10, box.y + box.height / 2);
        await page.mouse.down();
        await page.evaluate(() => {
          const win = window as unknown as Window & {
            nestedSelectionTiming: { sync: number; rendered: number } | undefined;
          };
          win.nestedSelectionTiming = undefined;
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
                      win.nestedSelectionTiming = { sync, rendered: performance.now() - start };
                    }),
                  );
                },
                { once: true },
              );
            },
            { capture: true, once: true },
          );
        });
        await page.mouse.move(box.x + 130, box.y + box.height / 2);
        await page.mouse.up();
        await expect(editable).toBeFocused();
        await expect(preview).toBeVisible();
        await expect
          .poll(() => page.evaluate(() => document.getSelection()?.toString().length ?? 0))
          .toBeGreaterThan(0);
        await expect
          .poll(() =>
            page.evaluate(
              () =>
                (window as unknown as Window & { nestedSelectionTiming?: unknown })
                  .nestedSelectionTiming,
            ),
          )
          .toBeDefined();
        const timing = await page.evaluate(
          () =>
            (
              window as unknown as Window & {
                nestedSelectionTiming: { sync: number; rendered: number };
              }
            ).nestedSelectionTiming,
        );
        if (index > 0) {
          samples.push(timing);
        }
      }
      console.log(
        JSON.stringify({ interaction: "nested-editable-selection", mode, repeat, samples }),
      );
    });
  }
}
