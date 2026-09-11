/** Browser regression for headerless columns layout and column-count settings. */
import { expect, test } from "@playwright/test";

test("keeps nested blocks when settings remove a column and does not scroll horizontally", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  await page.evaluate(() => {
    const { editor } = (window as unknown as { __rivtoDemo: { editor: import("@chulane/rivto-react").ReactEditor } }).__rivtoDemo.editor;
    const board = editor.blocks.getBlocks().find((block) => block.type === "columns")!;
    editor.load({ ...editor.dump(), blocks: [board], elements: [] });
  });
  const board = page.locator('[data-block-type="columns"]').first();
  await board.scrollIntoViewIfNeeded();
  const lanes = board.locator(":scope > .page-block-children");
  const columns = page.locator('[data-block-type="columns-column"]');
  await expect(columns).toHaveCount(2);
  await expect(board).toContainText("Left column");
  await expect(board).toContainText("Right column");
  await expect.poll(() => lanes.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);

  await board.getByRole("button", { name: "Columns settings" }).click();
  await page.getByRole("button", { name: "Remove column" }).click();
  await expect(columns).toHaveCount(1);
  await expect(columns.first()).toContainText("Left column");
  await expect(columns.first()).toContainText("Right column");
  await expect.poll(() => lanes.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);

  await page.getByRole("button", { name: "Add column" }).click();
  await expect(columns).toHaveCount(2);
  await expect(columns.first()).toContainText("Left column");
  await expect(columns.first()).toContainText("Right column");
});
