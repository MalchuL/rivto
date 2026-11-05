import { expect, test, type Page } from "@playwright/test";
import type { DocumentEditorAPI } from "@chulane/rivto";

/** Document state captured before the separator gesture. */
interface PlacementSnapshot {
  readonly ids: string[];
  readonly separators: number;
  readonly sourceId: string | null;
}

/**
 * Creates one card and a visual at the next automatic card position.
 *
 * @param page - Demo whose first card will be split by a separator.
 * @returns Resolves after creating the fixture and clearing its undo history.
 */
async function prepareFixture(page: Page) {
  await page.evaluate(() => {
    const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }).__rivtoDemo
      .editor;
    editor.load({ ...editor.dump(), blocks: [], elements: [], rootElementIds: [] });
    editor.blocks.insertBlock({ id: "first", type: "paragraph", content: "First" });
    editor.blocks.insertBlock({ id: "second", type: "paragraph", content: "Second" });
    editor.elements.insertElement({
      type: "block",
      zIndex: 0,
      frame: { x: 60, y: 60, width: 720, height: 120 },
      props: { startBlockId: "first", endBlockId: "second" },
    });
    editor.elements.insertElement({
      id: "obstacle",
      type: "rectangle",
      zIndex: 1,
      frame: { x: 84, y: 184, width: 100, height: 100 },
    });
    editor.history.clear();
  });
}

/**
 * Waits for the split, the new card and focus on the inserted writing block.
 *
 * @param page - Demo receiving the separator gesture.
 * @param previous - Element IDs, separator count and focused block before the gesture.
 * @returns Resolves after the new card and editor are ready.
 */
async function waitForSplit(page: Page, previous: PlacementSnapshot) {
  await page.waitForFunction(({ ids, separators, sourceId }) => {
    const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }).__rivtoDemo
      .editor;
    const active = document.activeElement;
    return (
      editor.blocks.getBlocks().filter((block) => block.type === "separator").length ===
        separators + 1 &&
      editor.elements
        .getElementNodes()
        .some((element) => element.type === "block" && !ids.includes(element.id)) &&
      active?.matches("[data-block-content]") &&
      active.closest("[data-block-id]")?.getAttribute("data-block-id") !== sourceId
    );
  }, previous);
}

/**
 * Checks whether the newly created card overlaps the fixture's visual obstacle.
 *
 * @param page - Demo containing the projected elements.
 * @param ids - Element IDs present before the split.
 * @returns A promise resolving to overlap, or undefined until both elements exist.
 */
async function newCardOverlapsObstacle(page: Page, ids: string[]) {
  return page.evaluate((previous) => {
    const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }).__rivtoDemo
      .editor;
    const elements = editor.elements.getElementNodes();
    const card = elements.find(
      (element) => element.type === "block" && !previous.includes(element.id),
    );
    const visual = elements.find((element) => element.id === "obstacle");
    if (!card || !visual) {
      return undefined;
    }
    const a = card.frame;
    const b = visual.frame;
    return (
      a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
    );
  }, ids);
}

test("a new automatic card avoids a visual while a separator splits the document", async ({
  page,
}) => {
  await page.goto("/?test_features=1");
  const today = page.locator('[data-journal-document="today"]');
  const root = today.locator(".page-surface").first();
  await root.waitFor();
  await prepareFixture(page);
  await root.locator('[data-block-id="first"] [data-block-content]').first().click();
  const previous = await page.evaluate(() => {
    const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }).__rivtoDemo
      .editor;
    return {
      ids: editor.elements.getElementNodes().map((element) => element.id),
      separators: editor.blocks.getBlocks().filter((block) => block.type === "separator").length,
      sourceId:
        document.activeElement?.closest("[data-block-id]")?.getAttribute("data-block-id") ?? null,
    };
  });
  await page.keyboard.press("Control+Shift+Enter");
  await waitForSplit(page, previous);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await expect.poll(() => newCardOverlapsObstacle(page, previous.ids)).toBe(false);
  await expect(root.locator("[data-block-content]:focus")).toBeVisible();
  await page.keyboard.press("Control+z");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
          ).__rivtoDemo.editor.blocks
            .getBlocks()
            .filter((block) => block.type === "separator").length,
      ),
    )
    .toBe(previous.separators);
});
