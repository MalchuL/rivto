import { expect, test, type Page } from "@playwright/test";
import type { DocumentEditorAPI } from "@chulane/rivto";

for (const mode of ["block", "edgeless"] as const) {
  for (const repeat of [0, 200]) {
    test(`undoes selected text deletion and restores its caret in ${mode}, repeat=${repeat}`, async ({
      page,
    }) => {
      test.setTimeout(120_000);
      await seedBlock(page, repeat, mode);
      const content = page.locator('[data-block-id="delete-focus-perf"] [data-block-content]');
      const samples = [];
      for (let index = 0; index < 3; index++) {
        await expect(content).toBeVisible();
        await content.focus();
        await page.evaluate(
          () =>
            new Promise<void>((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
            ),
        );
        await content.evaluate((element) => {
          const text = element.firstChild!;
          element.ownerDocument.getSelection()!.setBaseAndExtent(text, 1, text, 4);
        });
        await expect
          .poll(() =>
            page.evaluate(() => {
              const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
                .__rivtoDemo.editor;
              return editor.selection.get()?.blocks.find(({ id }) => id === "delete-focus-perf");
            }),
          )
          .toEqual({ id: "delete-focus-perf", start: 1, end: 4 });
        await page.keyboard.press("Backspace");
        await expect.poll(() => readText(page)).toBe("aef");
        await expect(content).toBeFocused();
        await expect
          .poll(() =>
            content.evaluate((element) => element.ownerDocument.getSelection()?.focusOffset),
          )
          .toBe(1);
        samples.push(await undoAndMeasure(page));
        await expect.poll(() => readText(page)).toBe("abcdef");
        await expect(content).toBeFocused();
      }
      console.log(JSON.stringify({ interaction: "history-undo-focus", mode, repeat, samples }));
    });
  }
}

/**
 * Reads the fixture's canonical text after deletion or undo.
 *
 * @param page - Demo retaining its document editor.
 * @returns Current fixture text, or undefined if the block is missing.
 */
async function readText(page: Page) {
  return page.evaluate(
    () =>
      (
        window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
      ).__rivtoDemo.editor.blocks.getBlockNode("delete-focus-perf")?.content,
  );
}

/**
 * Measures undo shortcut delivery and two subsequent animation frames.
 *
 * @param page - Warm editor after deleting the fixture's selected text.
 * @returns Synchronous input and two-frame durations in milliseconds.
 */
async function undoAndMeasure(page: Page) {
  await page.evaluate(() => {
    const state = window as unknown as { undoTiming: null | { sync: number; frames: number } };
    state.undoTiming = null;
    const startUndo = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "z") {
        return;
      }
      window.removeEventListener("keydown", startUndo, true);
      const start = performance.now();
      window.addEventListener(
        "keydown",
        () => {
          const sync = performance.now() - start;
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              state.undoTiming = { sync, frames: performance.now() - start };
            }),
          );
        },
        { once: true },
      );
    };
    window.addEventListener("keydown", startUndo, true);
  });
  await page.keyboard.press("ControlOrMeta+z");
  await page.waitForFunction(
    () => (window as unknown as { undoTiming: unknown }).undoTiming !== null,
  );
  return page.evaluate(
    () => (window as unknown as { undoTiming: { sync: number; frames: number } }).undoTiming,
  );
}

/**
 * Creates a text fixture and positions its canvas card when needed.
 *
 * @param page - Demo page retaining its default editor configuration.
 * @param repeat - Additional demo content for the large fixture.
 * @param mode - Surface used for deletion.
 * @returns The fixture block is ready on its active surface.
 */
async function seedBlock(page: Page, repeat: number, mode: "block" | "edgeless") {
  await page.goto(`/?repeat=${repeat}`);
  await page.locator('[data-journal-document="today"] [data-block-content]').first().waitFor();
  await page.evaluate(() => {
    const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }).__rivtoDemo
      .editor;
    editor.history.batchUpdates(() => {
      editor.blocks.insertBlock({ id: "delete-focus-leading", type: "separator" });
      editor.blocks.insertBlock({ id: "delete-focus-perf", type: "paragraph", content: "abcdef" });
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
              element.type === "block" && element.props.startBlockId === "delete-focus-perf",
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
        (element) => element.type === "block" && element.props.startBlockId === "delete-focus-perf",
      )!;
    editor.elements.updateElement(card.id, {
      frame: { x: 60, y: 60, width: 400, height: 120 },
      zIndex: 100000,
    });
    editor.history.stopCapturing();
  });
  await page.locator('[data-editor-mode="edgeless"]').click();
}
