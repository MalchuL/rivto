import { expect, test, type Page } from "@playwright/test";
import type { DocumentEditorAPI } from "@chulane/rivto";

/** Demo core access used only to prepare a deterministic two-card document. */
interface DemoWindow extends Window {
  __rivtoDemo: { editor: DocumentEditorAPI };
}

/**
 * Seeds two text cards with a persisted separator and an offscreen second card.
 *
 * @param page - Production demo with its default extensions and virtualization settings.
 * @returns Completion after the visible first card mounts in edgeless mode.
 */
async function seedCards(page: Page): Promise<void> {
  await page.goto("/?test_features=1");
  await expect(
    page.locator('[data-journal-document="today"] [data-block-content]').first(),
  ).toBeVisible();
  await page.evaluate(() => {
    const editor = (window as unknown as DemoWindow).__rivtoDemo.editor;
    editor.history.batchUpdates(() => {
      editor.blocks.removeBlocks([...editor.blocks.getRootIds()]);
      editor.elements.removeElements(editor.elements.getElementNodes().map(({ id }) => id));
      editor.blocks.insertBlock({ id: "nav-first", type: "paragraph", content: "First" });
      editor.blocks.insertBlock({ id: "nav-separator", type: "separator" });
      editor.blocks.insertBlock({ id: "nav-last", type: "paragraph", content: "Last" });
    });
  });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as DemoWindow).__rivtoDemo.editor.elements
            .getElementNodes()
            .filter((element) => element.type === "block").length,
      ),
    )
    .toBe(2);
  await page.evaluate(() => {
    const editor = (window as unknown as DemoWindow).__rivtoDemo.editor;
    editor.selection.clear();
    for (const element of editor.elements.getElementNodes()) {
      if (element.type === "block") {
        editor.elements.updateElement(element.id, {
          frame: {
            x: 60,
            y: element.props.startBlockId === "nav-first" ? 60 : 10000,
            width: 400,
            height: 120,
          },
        });
      }
    }
  });
  await page.locator('[data-editor-mode="edgeless"]').click();
  await expect(page.locator('[data-block-id="nav-first"] [data-block-content]')).toBeVisible();
}

test("navigates to an offscreen card and excludes its separator from a text range", async ({
  page,
}) => {
  await seedCards(page);
  const last = page.locator('[data-block-id="nav-last"] [data-block-content]');
  await expect(last).toHaveCount(0);
  await page.locator('[data-block-id="nav-first"] [data-block-content]').click();
  await page.keyboard.press("End");
  await page.keyboard.press("ArrowDown");
  await expect
    .poll(() =>
      page.evaluate(() =>
        document
          .getSelection()
          ?.focusNode?.parentElement?.closest("[data-block-id]")
          ?.getAttribute("data-block-id"),
      ),
    )
    .toBe("nav-last");
  await expect(last).toHaveCount(1);
  await page.keyboard.press("Shift+ArrowUp");
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as unknown as DemoWindow).__rivtoDemo.editor.selection
          .get()
          ?.blocks.map(({ id }) => id),
      ),
    )
    .toEqual(["nav-first", "nav-last"]);
  await page.locator('[data-editor-mode="block"]').click();
  await expect(page.locator('[data-block-id="nav-separator"]')).toHaveCount(1);
});
