import { expect, test, type Page } from "@playwright/test";
import type { DocumentEditorAPI } from "@chulane/rivto";

for (const repeat of [0, 200]) {
  test(`navigates to a virtualized canvas card, repeat=${repeat}`, async ({ page }) => {
    test.setTimeout(120_000);
    await seedCards(page, repeat);
    const first = page.locator('[data-block-id="nav-perf-first"] [data-block-content]');
    const last = page.locator('[data-block-id="nav-perf-last"] [data-block-content]');
    await expect(first).toBeVisible();
    await expect(last).toHaveCount(0);
    await first.click();
    await page.keyboard.press("End");
    const sample = await measureNavigation(page);
    await expect
      .poll(() =>
        page.evaluate(() =>
          document
            .getSelection()
            ?.focusNode?.parentElement?.closest("[data-block-id]")
            ?.getAttribute("data-block-id"),
        ),
      )
      .toBe("nav-perf-last");
    await expect(last).toHaveCount(1);
    console.log(JSON.stringify({ interaction: "canvas-navigation", repeat, sample }));
    await page.keyboard.press("Shift+ArrowUp");
    await expect
      .poll(() =>
        page.evaluate(() =>
          (
            window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
          ).__rivtoDemo.editor.selection
            .get()
            ?.blocks.map(({ id }) => id),
        ),
      )
      .toEqual(["nav-perf-first", "nav-perf-last"]);
  });
}

/**
 * Measures the real ArrowDown delivery and the following two frames.
 *
 * @param page - Warm demo with the first card focused at its text end.
 * @returns Synchronous input and two-frame durations in milliseconds.
 */
async function measureNavigation(page: Page) {
  await page.evaluate(() => {
    const state = window as unknown as {
      navigationTiming: null | { sync: number; frames: number };
    };
    state.navigationTiming = null;
    let start = 0;
    window.addEventListener(
      "keydown",
      () => {
        start = performance.now();
      },
      { capture: true, once: true },
    );
    window.addEventListener(
      "keydown",
      () => {
        const sync = performance.now() - start;
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            state.navigationTiming = { sync, frames: performance.now() - start };
          }),
        );
      },
      { once: true },
    );
  });
  await page.keyboard.press("ArrowDown");
  await page.waitForFunction(
    () => (window as unknown as { navigationTiming: unknown }).navigationTiming !== null,
  );
  return page.evaluate(() => (window as unknown as { navigationTiming: unknown }).navigationTiming);
}

/**
 * Adds adjacent text cards separated by a non-rendered separator, with the second card offscreen.
 *
 * @param page - Demo page used for the production navigation path.
 * @param repeat - Additional demo content retained for the large fixture.
 * @returns Both card projections are placed and the first is mounted.
 */
async function seedCards(page: Page, repeat: number) {
  await page.goto(`/?repeat=${repeat}`);
  await page.locator('[data-journal-document="today"] [data-block-content]').first().waitFor();
  await page.evaluate(() => {
    const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }).__rivtoDemo
      .editor;
    editor.history.batchUpdates(() => {
      editor.blocks.insertBlock({ id: "nav-perf-leading", type: "separator" });
      editor.blocks.insertBlock({ id: "nav-perf-first", type: "paragraph", content: "First" });
      editor.blocks.insertBlock({ id: "nav-perf-separator", type: "separator" });
      editor.blocks.insertBlock({ id: "nav-perf-last", type: "paragraph", content: "Last" });
    });
  });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
          ).__rivtoDemo.editor.elements
            .getElementNodes()
            .filter(
              (element) =>
                element.type === "block" &&
                ["nav-perf-first", "nav-perf-last"].includes(String(element.props.startBlockId)),
            ).length,
      ),
    )
    .toBe(2);
  await positionCards(page);
  await page.locator('[data-editor-mode="edgeless"]').click();
}

/**
 * Places one fixture card onscreen and the other beyond the canvas viewport.
 *
 * @param page - Demo with both fixture card projections already created.
 * @returns Card geometry is updated before entering edgeless mode.
 */
async function positionCards(page: Page) {
  await page.evaluate(() => {
    const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }).__rivtoDemo
      .editor;
    editor.selection.clear();
    for (const element of editor.elements.getElementNodes()) {
      if (
        element.type === "block" &&
        ["nav-perf-first", "nav-perf-last"].includes(String(element.props.startBlockId))
      ) {
        editor.elements.updateElement(element.id, {
          frame: {
            x: 60,
            y: element.props.startBlockId === "nav-perf-first" ? 60 : 10000,
            width: 400,
            height: 120,
          },
          zIndex: 100000,
        });
      }
    }
  });
}
