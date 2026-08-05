import { expect, test, type Page } from "@playwright/test";
import { BLOCK_ID_SELECTOR } from "./dom-markers";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

const replaceContent = async (page: Page, content: string): Promise<void> => {
  await page.keyboard.press("Control+a");
  await page.keyboard.type(content);
};

test("shows checkbox and numbered-list examples in the demo", async ({ page }) => {
  const root = (text: string) => page.locator(`.page-surface > ${BLOCK_ID_SELECTOR}`).filter({
    has: page.getByText(text, { exact: true }),
  });
  await expect(root("Try the interactive checkbox").locator(":scope > .page-block-row > input[type=checkbox]")).not.toBeChecked();
  await expect(root("Completed checkbox item").locator(":scope > .page-block-row > input[type=checkbox]")).toBeChecked();
  await expect(root("Start a numbered sequence").locator(":scope > .page-block-row > .page-list-marker")).toHaveText("1.");
  await expect(root("Continue the adjacent sequence").locator(":scope > .page-block-row > .page-list-marker")).toHaveText("2.");
  await expect(root("Continue numbering across the ordinary block").locator(":scope > .page-block-row > .page-list-marker")).toHaveText("3.");
});

test("creates interactive checkboxes from a shortcut and inherits them with Enter", async ({ page }) => {
  const roots = page.locator(`.page-surface > ${BLOCK_ID_SELECTOR}`);
  const block = roots.first();
  const editor = block.locator(":scope > .page-block-row [data-block-content]");
  await editor.click();
  await replaceContent(page, "[ ] ");

  await expect(block).toHaveAttribute("data-block-list-type", "checkbox");
  await expect(editor).toHaveText("");
  const checkbox = block.locator(":scope > .page-block-row > .page-list-checkbox");
  await expect(checkbox).not.toBeChecked();
  await page.keyboard.type("Task");
  await checkbox.check();
  await expect(block).toHaveAttribute("data-block-checked", "true");
  await expect(editor).toHaveCSS("text-decoration-line", "line-through");

  await editor.click();
  await page.keyboard.press("End");
  const beforeEnter = await roots.count();
  await page.keyboard.press("Enter");
  await expect(roots).toHaveCount(beforeEnter + 1);
  const inherited = roots.nth(1);
  await expect(inherited).toHaveAttribute("data-block-list-type", "checkbox");
  await expect(inherited.locator(":scope > .page-block-row > .page-list-checkbox")).not.toBeChecked();

  await page.keyboard.press("Enter");
  await expect(roots).toHaveCount(beforeEnter + 1);
  await expect(inherited).toHaveAttribute("data-block-list-type", "list");
  await expect(inherited.locator(":scope > .page-block-row > .page-list-marker")).toHaveCount(0);
});

test("numbers adjacent blocks and resumes through a list gap from slash commands", async ({ page }) => {
  const roots = page.locator(`.page-surface > ${BLOCK_ID_SELECTOR}`);
  const first = roots.first();
  const editor = first.locator(":scope > .page-block-row [data-block-content]");
  await editor.click();
  await replaceContent(page, "1. ");
  await page.keyboard.type("One");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Two");
  await page.keyboard.press("Enter");

  await expect(roots.nth(0).locator(":scope > .page-block-row > .page-list-marker")).toHaveText("1.");
  await expect(roots.nth(1).locator(":scope > .page-block-row > .page-list-marker")).toHaveText("2.");

  await page.keyboard.type("/list");
  await page.locator('[data-slash-command="list.list"]').click();
  await page.keyboard.type("Gap");
  await page.keyboard.press("Enter");
  await page.keyboard.type("/continue");
  await page.locator('[data-slash-command="list.continue_numbered_list"]').click();

  await expect(roots.nth(2).locator(":scope > .page-block-row > .page-list-marker")).toHaveCount(0);
  await expect(roots.nth(3).locator(":scope > .page-block-row > .page-list-marker")).toHaveText("3.");
});

test("uses the shared list and checkbox rendering in edgeless cards", async ({ page }) => {
  await page.locator('[data-editor-mode="edgeless"]').click();
  const block = (text: string) => page.locator("[data-edgeless-root] [data-block-content]")
    .filter({ hasText: new RegExp(`^${text}$`) })
    .locator("xpath=ancestor::*[@data-block-id][1]");

  await expect(block("Try the interactive checkbox").locator(":scope > .page-block-row > input[type=checkbox]")).not.toBeChecked();
  await expect(block("Completed checkbox item").locator(":scope > .page-block-row > input[type=checkbox]")).toBeChecked();
  await expect(block("Start a numbered sequence").locator(":scope > .page-block-row > .page-list-marker")).toHaveText("1.");
  await expect(block("Continue the adjacent sequence").locator(":scope > .page-block-row > .page-list-marker")).toHaveText("2.");
  await expect(block("Continue numbering across the ordinary block").locator(":scope > .page-block-row > .page-list-marker")).toHaveText("3.");
});
