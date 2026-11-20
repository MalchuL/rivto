import { expect, test, type Locator, type Page } from "@playwright/test";
import type { BlockMenuFocusTiming, BlockMenuFocusWindow } from "./types";

for (const mode of ["block", "edgeless"] as const) {
  for (const repeat of [0, 200]) {
    test(`restores handle focus after menu dismissal in ${mode}, repeat=${repeat}`, async ({
      page,
      browserName,
    }) => {
      test.setTimeout(120_000);
      await page.setViewportSize({ width: 1400, height: 1000 });
      await page.goto(`/?repeat=${repeat}`);
      await page.locator('[data-journal-document="today"] > .page-surface').waitFor();
      await page.evaluate(() => {
        const blocks = window.__rivtoDemo.editor.blocks;
        blocks.insertBlock(
          { id: "focus-menu-benchmark", type: "paragraph", content: "Focus menu benchmark" },
          { parentId: null, beforeId: blocks.getRootIds()[0] },
        );
      });
      if (mode === "edgeless") {
        await page.locator('[data-editor-mode="edgeless"]').click();
      }
      const row = page.locator('[data-block-id="focus-menu-benchmark"] > .rivto-block-row').first();
      const handle = row.locator(".block-handle");
      const samples: BlockMenuFocusTiming[] = [];
      for (let index = 0; index < 4; index += 1) {
        await row.hover();
        await handle.click({ button: "right" });
        await expect(page.getByRole("menu").first()).toBeVisible();
        const timing = await measureFocus(page, handle);
        if (index > 0) {
          samples.push(timing);
        }
      }
      console.log(
        JSON.stringify({ interaction: "block-menu-focus", browserName, mode, repeat, samples }),
      );
    });
  }
}

/**
 * Measures focus restoration after an actual Escape key delivery.
 *
 * @param page - Browser page with the handle menu open.
 * @param handle - Original handle that must regain focus.
 * @returns Duration to focus and through the following two animation frames.
 * @throws If focus or the frame marker does not arrive.
 */
async function measureFocus(page: Page, handle: Locator): Promise<BlockMenuFocusTiming> {
  await handle.evaluate((element) => {
    const state = window as unknown as BlockMenuFocusWindow;
    state.blockMenuFocusTiming = null;
    window.addEventListener(
      "keydown",
      () => {
        state.blockMenuFocusStart = performance.now();
      },
      { capture: true, once: true },
    );
    element.addEventListener(
      "focus",
      () => {
        const focus = performance.now() - state.blockMenuFocusStart;
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            state.blockMenuFocusTiming = {
              focus,
              frames: performance.now() - state.blockMenuFocusStart,
            };
          }),
        );
      },
      { once: true },
    );
  });
  await page.keyboard.press("Escape");
  await expect(handle).toBeFocused();
  await page.waitForFunction(
    () => (window as unknown as BlockMenuFocusWindow).blockMenuFocusTiming !== null,
  );
  const timing = await page.evaluate(
    () => (window as unknown as BlockMenuFocusWindow).blockMenuFocusTiming,
  );
  if (!timing) {
    throw new Error("Expected completed block-menu focus timing");
  }
  return timing;
}
