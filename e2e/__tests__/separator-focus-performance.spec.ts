import { expect, test, type Page } from "@playwright/test";
import type { DocumentEditorAPI } from "@chulane/rivto";

for (const mode of ["block", "edgeless"] as const) {
  for (const repeat of [0, 200]) {
    test(`inserts a separator and focuses its continuation in ${mode}, repeat=${repeat}`, async ({
      page,
    }) => {
      test.setTimeout(120_000);
      await seedBlock(page, repeat, mode);
      const content = page.locator('[data-block-id="separator-focus-perf"] [data-block-content]');
      const original = await rootIds(page);
      const samples = [];
      for (let index = 0; index < 3; index++) {
        await content.click();
        await page.evaluate(
          () =>
            new Promise<void>((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
            ),
        );
        await page.keyboard.press("End");
        samples.push(await insertAndMeasure(page));
        await expect.poll(async () => (await rootIds(page)).length).toBe(original.length + 2);
        const selected = await page.evaluate(
          () =>
            (
              window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
            ).__rivtoDemo.editor.selection.get()?.focusBlockId,
        );
        expect(selected).toBeTruthy();
        expect(original).not.toContain(selected);
        await expect(
          page.locator(`[data-block-id="${selected}"] [data-block-content]`),
        ).toBeFocused();
        await page.keyboard.press("ControlOrMeta+z");
        await expect.poll(() => rootIds(page)).toEqual(original);
      }
      console.log(JSON.stringify({ interaction: "separator-focus", mode, repeat, samples }));
    });
  }
}

/**
 * Reads canonical roots for insertion and undo assertions.
 *
 * @param page - Demo retaining its document editor.
 * @returns Current root block IDs.
 */
async function rootIds(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    (
      window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
    ).__rivtoDemo.editor.blocks.getRootIds(),
  );
}

/**
 * Measures the separator shortcut's Enter delivery and two subsequent frames.
 *
 * @param page - Warm editor with the fixture caret focused.
 * @returns Synchronous input and two-frame durations in milliseconds.
 */
async function insertAndMeasure(page: Page) {
  await page.keyboard.down("Control");
  await page.keyboard.down("Shift");
  await page.evaluate(() => {
    const state = window as unknown as { separatorTiming: null | { sync: number; frames: number } };
    state.separatorTiming = null;
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
            state.separatorTiming = { sync, frames: performance.now() - start };
          }),
        );
      },
      { once: true },
    );
  });
  await page.keyboard.press("Enter");
  await page.keyboard.up("Shift");
  await page.keyboard.up("Control");
  await page.waitForFunction(
    () => (window as unknown as { separatorTiming: unknown }).separatorTiming !== null,
  );
  return page.evaluate(
    () =>
      (window as unknown as { separatorTiming: { sync: number; frames: number } }).separatorTiming,
  );
}

/**
 * Creates a text fixture and positions its canvas card when needed.
 *
 * @param page - Demo page retaining its default editor settings.
 * @param repeat - Additional demo content for the large fixture.
 * @param mode - Surface used for insertion.
 * @returns Fixture block is ready on the active surface.
 */
async function seedBlock(page: Page, repeat: number, mode: "block" | "edgeless") {
  await page.goto(`/?repeat=${repeat}`);
  await page.locator('[data-journal-document="today"] [data-block-content]').first().waitFor();
  await page.evaluate(() => {
    const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }).__rivtoDemo
      .editor;
    editor.history.batchUpdates(() => {
      editor.blocks.insertBlock({ id: "separator-focus-leading", type: "separator" });
      editor.blocks.insertBlock({
        id: "separator-focus-perf",
        type: "paragraph",
        content: "Fixture",
      });
    });
    editor.history.stopCapturing();
  });
  if (mode === "block") {
    return;
  }
  await expect
    .poll(() =>
      page.evaluate(() => {
        const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
          .__rivtoDemo.editor;
        return editor.elements
          .getElementNodes()
          .some(
            (element) =>
              element.type === "block" && element.props.startBlockId === "separator-focus-perf",
          );
      }),
    )
    .toBe(true);
  await page.evaluate(() => {
    const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }).__rivtoDemo
      .editor;
    const card = editor.elements
      .getElementNodes()
      .find(
        (element) =>
          element.type === "block" && element.props.startBlockId === "separator-focus-perf",
      )!;
    editor.elements.updateElement(card.id, {
      frame: { x: 60, y: 60, width: 400, height: 120 },
      zIndex: 100000,
    });
    editor.history.stopCapturing();
  });
  await page.locator('[data-editor-mode="edgeless"]').click();
}
