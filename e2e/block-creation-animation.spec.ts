import { expect, test } from "@playwright/test";

test("fades a newly created block without animating the initial document", async ({ page }) => {
  await page.goto("/?test_features=1");
  const editor = page.locator('[data-journal-document="today"] > .page-surface');
  const content = editor.locator("[data-block-content]").first();
  const original = content.locator("xpath=ancestor::*[@data-block-id][1]");
  const originalId = await original.getAttribute("data-block-id");
  expect(await original.evaluate((element) => element.getAnimations().length)).toBe(0);
  await content.click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  const created = editor
    .locator("[data-block-content]:focus")
    .locator("xpath=ancestor::*[@data-block-id][1]");
  await expect(created).not.toHaveAttribute("data-block-id", originalId!);
  expect(await created.evaluate((element) => element.getAnimations().length)).toBeGreaterThan(0);
  await expect
    .poll(() => created.evaluate((element) => getComputedStyle(element).opacity))
    .toBe("1");
});

test("fades new Kanban cards and columns including their backgrounds", async ({ page }) => {
  await page.goto("/?test_features=1");
  const board = page.locator('[data-block-type="kanban"]').first();
  const column = board.locator('[data-block-type="kanban-column"]').first();
  await column.getByRole("button", { name: /Add card to/ }).click();
  const card = column.locator(".rivto-kanban-card").last();
  await expect(card).toBeVisible();
  expect(await card.evaluate((element) => element.getAnimations().length)).toBeGreaterThan(0);
  await board.getByRole("button", { name: "Add Kanban column" }).click();
  const addedColumn = board.locator('[data-block-type="kanban-column"]').last();
  await expect(addedColumn).toBeVisible();
  expect(await addedColumn.evaluate((element) => element.getAnimations().length)).toBeGreaterThan(
    0,
  );
});
