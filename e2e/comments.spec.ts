/**
 * Browser coverage for the independent comments sidebar and its entry points.
 *
 * Persistence semantics stay in fast unit tests; this suite verifies the
 * slash/selection interactions, minimized controls, and surface separation.
 *
 * @module
 */
import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("edits and manages a block comment in the hideable sidebar", async ({ page }) => {
  const document = page.locator('[data-journal-document="today"]');
  const content = page.locator('[data-journal-document="today"] [data-block-content]').last();
  const block = content.locator("xpath=ancestor::*[@data-block-id][1]");
  await content.click();
  await page.keyboard.press("End");
  await page.keyboard.type(" /comment");
  const command = page.locator('[data-slash-command="comment.create"]');
  await expect(command).toBeVisible();
  await command.click();

  const sidebar = document.locator('[data-comment-sidebar="true"]');
  const draft = sidebar.locator('[data-comment-draft="true"]');
  await expect(draft).toBeVisible();
  await draft.getByRole("textbox", { name: "New comment" }).fill("Please clarify this block");
  await draft.getByRole("button", { name: "Comment", exact: true }).click();

  const thread = sidebar.locator("[data-comment-thread-id]");
  await expect(thread).toContainText("Please clarify this block");
  await expect(thread).toContainText("Demo User");
  await expect(block.locator("[data-comment-thread-id]")).toHaveCount(0);
  const surfaceBox = await document.locator(".page-surface").boundingBox();
  const sidebarBox = await sidebar.boundingBox();
  expect(surfaceBox && sidebarBox && sidebarBox.x >= surfaceBox.x + surfaceBox.width).toBe(true);
  await expect.poll(async () => {
    const blockBox = await block.boundingBox();
    const threadBox = await thread.boundingBox();
    return blockBox && threadBox ? Math.abs(blockBox.y - threadBox.y) : null;
  }).toBeLessThan(2);
  await expect.poll(async () => {
    const rowBox = await block.locator(":scope > .page-block-row").boundingBox();
    const threadBox = await thread.boundingBox();
    return rowBox && threadBox ? rowBox.height - threadBox.height : null;
  }).toBeGreaterThanOrEqual(11);

  await expect(thread.getByRole("textbox", { name: "Reply to comment" })).toHaveCount(0);
  await thread.getByRole("button", { name: "Reply" }).click();
  await thread.getByRole("textbox", { name: "Reply to comment" }).fill("A reply");
  await thread.getByRole("button", { name: "Send reply" }).click();
  await expect(thread).toContainText("A reply");

  await thread.getByText("A reply", { exact: true }).click();
  const editBox = thread.getByRole("textbox", { name: "Edit comment" });
  await editBox.fill("An edited reply");
  await editBox.press("Control+Enter");
  await expect(thread).toContainText("An edited reply");

  await thread.getByRole("button", { name: "Resolve" }).click();
  await expect(thread).toHaveAttribute("data-comment-resolved", "true");
  await thread.getByRole("button", { name: "Reopen comment" }).click();
  await expect(thread.getByRole("button", { name: "Reply", exact: true })).toBeVisible();

  await sidebar.getByRole("button", { name: "Hide comments" }).click();
  await expect(sidebar).toHaveCount(0);
  await document.getByRole("button", { name: "Show comments" }).click();
  await expect(document.locator('[data-comment-sidebar="true"]')).toBeVisible();
});

test("comments on a selected edgeless element in a top-layer sidebar", async ({ page }) => {
  const document = page.locator('[data-journal-document="today"]');
  await page.locator('[data-editor-mode="edgeless"]').click();
  const visual = page.locator('[data-edgeless-visual-kind="rectangle"]').nth(1);
  await visual.click();
  await expect(visual).toHaveAttribute("data-selected", "true");
  const sidebar = document.locator('[data-comment-sidebar="true"]');
  await sidebar.getByRole("button", { name: "Comment on selection" }).click();

  const draft = sidebar.locator('[data-comment-draft="true"]');
  await expect(draft).toBeVisible();
  await draft.getByRole("textbox", { name: "New comment" }).fill("Canvas feedback");
  await draft.getByRole("button", { name: "Comment", exact: true }).click();
  const thread = sidebar.locator("[data-comment-thread-id]");
  await expect(thread).toContainText("Canvas feedback");
  await expect(visual.locator("[data-comment-thread-id]")).toHaveCount(0);
  expect(await sidebar.evaluate((element) => Number(getComputedStyle(element).zIndex))).toBeGreaterThan(20);
});
