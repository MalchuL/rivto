import { expect, test, type Page } from "@playwright/test";
import type { DocumentEditorAPI } from "@chulane/rivto";

for (const mode of ["block", "edgeless"] as const) {
  for (const repeat of [0, 200]) {
    test(`extends selection in ${mode}, repeat=${repeat}`, async ({ page }) => {
      test.setTimeout(120_000);
      await seedBlocks(page, repeat, mode);
      const first = page.locator('[data-block-id="extension-perf-first"] [data-block-content]');
      const last = page.locator('[data-block-id="extension-perf-last"] [data-block-content]');
      const samples = [];
      const moveSamples = [];
      for (let index = 0; index < 3; index++) {
        await expect(first).toBeVisible();
        await first.click();
        await page.keyboard.press("End");
        moveSamples.push(await measureKey(page, "ArrowDown", false));
        await expect(last).toHaveCount(1);
        await expect(last).toBeFocused();
        samples.push(await measureKey(page, "ArrowUp", true));
        await expect
          .poll(() =>
            page.evaluate(() => {
              const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
                .__rivtoDemo.editor;
              return editor.selection.get()?.blocks.map(({ id }) => id);
            }),
          )
          .toEqual(
            mode === "block"
              ? ["extension-perf-first", "extension-perf-separator", "extension-perf-last"]
              : ["extension-perf-first", "extension-perf-last"],
          );
      }
      console.log(
        JSON.stringify({ interaction: "caret-extension", mode, repeat, samples, moveSamples }),
      );
    });
  }
}

/**
 * Measures one arrow-key delivery and the following two frames.
 *
 * @param page - Warm editor with the relevant block's caret focused.
 * @param key - Arrow key to deliver.
 * @param extend - Whether Shift extends the selection during this key.
 * @returns Synchronous input and two-frame durations in milliseconds.
 */
async function measureKey(page: Page, key: "ArrowUp" | "ArrowDown", extend: boolean) {
  if (extend) {
    await page.keyboard.down("Shift");
  }
  await page.evaluate(() => {
    const state = window as unknown as { extensionTiming: null | { sync: number; frames: number } };
    state.extensionTiming = null;
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
            state.extensionTiming = { sync, frames: performance.now() - start };
          }),
        );
      },
      { once: true },
    );
  });
  await page.keyboard.press(key);
  if (extend) {
    await page.keyboard.up("Shift");
  }
  await page.waitForFunction(
    () => (window as unknown as { extensionTiming: unknown }).extensionTiming !== null,
  );
  return page.evaluate(
    () =>
      (window as unknown as { extensionTiming: { sync: number; frames: number } }).extensionTiming,
  );
}

/**
 * Creates text blocks and places their cards when testing the canvas.
 *
 * @param page - Demo page retaining its default editor configuration.
 * @param repeat - Additional demo content for the large fixture.
 * @param mode - Surface used for the keyboard interaction.
 * @returns Both blocks exist; canvas cards are positioned when applicable.
 */
async function seedBlocks(page: Page, repeat: number, mode: "block" | "edgeless"): Promise<void> {
  await page.goto(`/?repeat=${repeat}`);
  await page.locator('[data-journal-document="today"] [data-block-content]').first().waitFor();
  await page.evaluate(() => {
    const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }).__rivtoDemo
      .editor;
    editor.history.batchUpdates(() => {
      editor.blocks.insertBlock({ id: "extension-perf-leading", type: "separator" });
      editor.blocks.insertBlock({
        id: "extension-perf-first",
        type: "paragraph",
        content: "First",
      });
      editor.blocks.insertBlock({ id: "extension-perf-separator", type: "separator" });
      editor.blocks.insertBlock({ id: "extension-perf-last", type: "paragraph", content: "Last" });
    });
  });
  if (mode === "block") {
    return;
  }
  await waitForCards(page);
  await positionCards(page);
  await page.locator('[data-editor-mode="edgeless"]').click();
}

/**
 * Waits for the demo's two block-card projections.
 *
 * @param page - Demo containing the seeded blocks.
 * @returns Both cards have been created by the host projection.
 */
async function waitForCards(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
          .__rivtoDemo.editor;
        return editor.elements
          .getElementNodes()
          .filter(
            (element) =>
              element.type === "block" &&
              ["extension-perf-first", "extension-perf-last"].includes(
                String(element.props.startBlockId),
              ),
          ).length;
      }),
    )
    .toBe(2);
}

/**
 * Places the second card outside the viewport before entering canvas mode.
 *
 * @param page - Demo containing both projected cards.
 * @returns The fixture geometry is ready for virtualized navigation.
 */
async function positionCards(page: Page): Promise<void> {
  await page.evaluate(() => {
    const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }).__rivtoDemo
      .editor;
    editor.selection.clear();
    for (const element of editor.elements.getElementNodes()) {
      if (
        element.type === "block" &&
        ["extension-perf-first", "extension-perf-last"].includes(String(element.props.startBlockId))
      ) {
        editor.elements.updateElement(element.id, {
          frame: {
            x: 60,
            y: element.props.startBlockId === "extension-perf-first" ? 60 : 10000,
            width: 400,
            height: 120,
          },
          zIndex: 100000,
        });
      }
    }
  });
}
