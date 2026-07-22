import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("shows formatted Markdown at rest and raw source while editing", async ({ page }) => {
  const block = page.locator('[data-block-type="paragraph"]').first();
  const editor = block.locator(":scope > .page-block-row [data-block-content]");
  const preview = block.locator(":scope > .page-block-row .markdown-preview");

  await expect(editor).toHaveText("**Rivto editor**");
  await expect(preview.locator("strong")).toHaveText("Rivto editor");
  await expect(preview).toHaveCSS("visibility", "visible");
  await editor.click();
  await expect(editor).toBeFocused();
  await expect(preview).toHaveCSS("visibility", "hidden");
});

test("filters typo queries, converts in place, and undoes query removal with conversion", async ({ page }) => {
  const editor = page.locator("[data-block-content]").last();
  const block = editor.locator("xpath=ancestor::*[@data-block-id][1]");
  const id = await block.getAttribute("data-block-id");
  const initial = await editor.textContent();
  if (!id) throw new Error("Expected block ID");

  await editor.click();
  await page.keyboard.press("End");
  await page.keyboard.type("/sloder");
  const menu = page.locator("[data-slash-menu]");
  await expect(menu).toBeVisible();
  await expect(menu.locator('[data-slash-command="type.demo.slider"]')).toBeVisible();
  await page.keyboard.press("Enter");

  const converted = page.locator(`[data-block-id="${id}"]`);
  await expect(converted).toHaveAttribute("data-block-type", "demo.slider");
  await expect(converted.locator("[data-block-content]")).toHaveText(initial ?? "");
  await expect(menu).toHaveCount(0);

  await page.keyboard.press("Control+z");
  await expect(converted).toHaveAttribute("data-block-type", "paragraph");
  await expect(converted.locator("[data-block-content]")).toHaveText(`${initial}/sloder`);
});

test("Escape preserves slash text and custom controls update or select their block", async ({ page }) => {
  const editor = page.locator("[data-block-content]").last();
  await editor.click();
  await page.keyboard.press("End");
  await page.keyboard.type(" /count");
  await expect(page.locator("[data-slash-menu]")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-slash-menu]")).toHaveCount(0);
  await expect(editor).toContainText("/count");

  await page.keyboard.type(" /xx");
  await expect(page.locator("[data-slash-menu]")).toContainText("No matching commands");
  await page.keyboard.type("x");
  await expect(page.locator("[data-slash-menu]")).toHaveCount(0);
  await expect(editor).toContainText("/xxx");

  const counter = page.locator('[data-block-id][data-block-type="demo.counter"]');
  const button = counter.locator(".custom-counter-block");
  await expect(button).toHaveText("Count: 2");
  await button.click();
  await expect(button).toHaveText("Count: 3");
  await page.keyboard.press("Control+z");
  await expect(button).toHaveText("Count: 2");
  await page.keyboard.press("Control+y");
  await expect(button).toHaveText("Count: 3");
  await button.click({ modifiers: ["Control"] });
  await expect(counter).toHaveAttribute("data-selected", "true");
  await expect(button).toHaveText("Count: 3");
});

test("mouse slash execution creates a contentless Counter and undo restores dormant text", async ({ page }) => {
  const editor = page.locator("[data-block-content]").last();
  const block = editor.locator("xpath=ancestor::*[@data-block-id][1]");
  const id = await block.getAttribute("data-block-id");
  const initial = await editor.textContent();
  if (!id) throw new Error("Expected block ID");

  await editor.click();
  await page.keyboard.press("End");
  await page.keyboard.type(" /count");
  await page.locator('[data-slash-command="type.demo.counter"]').click();
  const converted = page.locator(`[data-block-id="${id}"]`);
  await expect(converted).toHaveAttribute("data-block-type", "demo.counter");
  await expect(converted.locator("[data-block-content]")).toHaveCount(0);

  await page.keyboard.press("Control+z");
  await expect(converted).toHaveAttribute("data-block-type", "paragraph");
  await expect(converted.locator("[data-block-content]")).toHaveText(`${initial} /count`);
});

test("Slider property changes use editor history", async ({ page }) => {
  const slider = page.locator('[data-block-id][data-block-type="demo.slider"] input[type="range"]');
  await expect(slider).toHaveValue("35");
  await slider.focus();
  await page.keyboard.press("ArrowRight");
  await expect(slider).toHaveValue("36");
  await page.keyboard.press("Control+z");
  await expect(slider).toHaveValue("35");
  await page.keyboard.press("Control+Shift+z");
  await expect(slider).toHaveValue("36");
});
