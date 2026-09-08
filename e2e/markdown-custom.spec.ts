import { expect, test } from "@playwright/test";
import {
  blockIdSelector,
  blockTypeSelector,
  BLOCK_ID_ATTRIBUTE,
  BLOCK_ID_SELECTOR,
} from "./dom-markers";

const BLOCK_ANCESTOR_XPATH = `xpath=ancestor::*[@${BLOCK_ID_ATTRIBUTE}][1]`;

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("shows full GFM at rest and raw source while editing", async ({ page }) => {
  const block = page.locator(blockTypeSelector("paragraph")).first();
  const editor = block.locator(":scope > .page-block-row .markdown-editor");
  const preview = block.locator(":scope > .page-block-row .markdown-preview");

  await expect(preview.locator("strong")).toHaveText("Rivto editor");
  await expect(editor).toHaveText("**Rivto editor**");
  await editor.click();
  await expect(editor).toBeFocused();
  await expect(preview).toHaveCount(0);

  const source = [
    "# Heading",
    "",
    "- [x] task",
    "",
    "| A | B |",
    "| - | - |",
    "| 1 | 2 |",
    "",
    "~~done~~",
    "",
    "```bash",
    'echo "hello"',
    "```",
    "",
    "```src/example.js",
    "const value = 42;",
    "```",
  ].join("\n");
  await editor.evaluate((element, value) => {
    element.textContent = value;
    element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
  }, source);
  await editor.evaluate((element) => (element as HTMLElement).blur());

  await expect(editor).not.toBeFocused();
  await expect(preview.locator("h1")).toHaveText("Heading");
  await expect(preview.locator('input[type="checkbox"]')).toBeChecked();
  await expect(preview.locator("table")).toBeVisible();
  await expect(preview.locator("del")).toHaveText("done");
  await expect(preview.locator(".markdown-code-label").nth(0)).toHaveText("bash");
  await expect(preview.locator("code.language-bash")).toContainText('echo "hello"');
  await expect(preview.locator(".markdown-code-label").nth(1)).toHaveText("src/example.js");
  await expect(preview.locator(".markdown-code-language").nth(0)).toHaveText("JavaScript");
  await expect(preview.locator("code.language-javascript .hljs-keyword")).toHaveText("const");
});

test("opens ordinary Markdown links and delegates custom protocols", async ({ page }) => {
  const block = page.locator(blockTypeSelector("paragraph")).first();
  const editor = block.locator(":scope > .page-block-row .markdown-editor");
  const preview = block.locator(":scope > .page-block-row .markdown-preview");
  await editor.click();
  await editor.evaluate((element) => {
    element.textContent = "[Browser](#markdown-target) [Local](chulane:page/example)";
    element.dispatchEvent(new InputEvent("input", { bubbles: true }));
    (element as HTMLElement).blur();
  });
  await page.evaluate(() => {
    window.addEventListener("rivto:markdown-link", ((event: CustomEvent<string>) => {
      (window as typeof window & { markdownLink?: string }).markdownLink = event.detail;
    }) as EventListener, { once: true });
  });

  await preview.getByRole("link", { name: "Browser" }).click();
  await expect(page).toHaveURL(/#markdown-target$/);
  await preview.getByRole("link", { name: "Local" }).click();
  await expect.poll(() => page.evaluate(() => (
    window as typeof window & { markdownLink?: string }
  ).markdownLink)).toBe("chulane:page/example");
  await expect(page).toHaveURL(/#markdown-target$/);
});

test("scrolls Markdown code without opening the raw editor", async ({ page }) => {
  const block = page.locator(blockTypeSelector("paragraph")).first();
  const editor = block.locator(":scope > .page-block-row .markdown-editor");
  const preview = block.locator(":scope > .page-block-row .markdown-preview");

  await editor.click();
  await editor.evaluate((element) => {
    element.textContent = `\`\`\`text\n${"const value = 42; ".repeat(40)}\n\`\`\``;
    element.dispatchEvent(new InputEvent("input", { bubbles: true }));
    (element as HTMLElement).blur();
  });

  const code = preview.locator("pre");
  await expect.poll(() => code.evaluate((element) => element.scrollWidth - element.clientWidth))
    .toBeGreaterThan(100);
  const box = await code.boundingBox();
  if (!box) throw new Error("Expected rendered code block");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(300, 0);

  await expect(preview).toBeVisible();
  await expect.poll(() => code.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);

  const sourceBeforeEdit = await editor.textContent();
  const editableCode = code.locator(".markdown-code-editor");
  await code.evaluate((element) => { element.scrollLeft = 0; });
  const codeBox = await editableCode.boundingBox();
  if (!codeBox) throw new Error("Expected editable code");
  await page.mouse.move(codeBox.x + 10, codeBox.y + codeBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(codeBox.x + 130, codeBox.y + codeBox.height / 2);
  await page.mouse.up();
  await expect(editableCode).toBeFocused();
  await expect(preview).toBeVisible();
  await expect.poll(() => page.evaluate(() => getSelection()?.toString().length ?? 0))
    .toBeGreaterThan(0);
  await page.keyboard.insertText("Z");
  await page.keyboard.type("ABC");
  await expect(editableCode).toBeFocused();
  await expect.poll(() => editor.textContent()).toContain("ZABC");
  await expect.poll(async () => (await editor.textContent())?.length)
    .toBeLessThanOrEqual((sourceBeforeEdit?.length ?? 0) + 3);
});

test("filters typo queries, converts in place, and undoes query removal with conversion", async ({ page }) => {
  const content = page.locator("[data-block-content]").last();
  const block = content.locator(BLOCK_ANCESTOR_XPATH);
  const id = await block.getAttribute(BLOCK_ID_ATTRIBUTE);
  if (!id) throw new Error("Expected block ID");

  await content.click();
  const editor = block.locator("[data-block-content]");
  const initial = await editor.textContent();
  await page.keyboard.press("End");
  await page.keyboard.type("/sloder");
  const menu = page.locator("[data-slash-menu]");
  await expect(menu).toBeVisible();
  await expect(menu.locator('[data-slash-command="type.demo.slider"]')).toBeVisible();
  await page.keyboard.press("Enter");

  const converted = page.locator(blockIdSelector(id));
  await expect(converted).toHaveAttribute("data-block-type", "demo.slider");
  await converted.locator("[data-block-content]").click();
  await expect(converted.locator("[data-block-content]")).toHaveText(initial ?? "");
  await expect(menu).toHaveCount(0);

  await page.keyboard.press("Control+z");
  await expect(converted).toHaveAttribute("data-block-type", "paragraph");
  await converted.locator("[data-block-content]").click();
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

  await page.keyboard.type(" /qq");
  await expect(page.locator("[data-slash-menu]")).toContainText("No matching commands");
  await page.keyboard.type("x");
  await expect(page.locator("[data-slash-menu]")).toHaveCount(0);
  await expect(editor).toContainText("/qqx");

  const counter = page.locator(`${BLOCK_ID_SELECTOR}${blockTypeSelector("demo.counter")}`);
  const button = counter.locator(".custom-counter-block");
  await expect(button).toHaveText("Count: 2");
  await button.click();
  await expect(button).toHaveText("Count: 3");
  await page.keyboard.press("Control+z");
  await expect(button).toHaveText("Count: 2");
  await page.keyboard.press("Control+y");
  await expect(button).toHaveText("Count: 3");
  await button.click({ modifiers: ["Control"] });
  await expect(counter).toHaveAttribute("data-block-selected", "true");
  await expect(button).toHaveText("Count: 3");
});

test("mouse slash execution creates a contentless Counter and undo restores dormant text", async ({ page }) => {
  const content = page.locator("[data-block-content]").last();
  const block = content.locator(BLOCK_ANCESTOR_XPATH);
  const id = await block.getAttribute(BLOCK_ID_ATTRIBUTE);
  if (!id) throw new Error("Expected block ID");

  await content.click();
  const editor = block.locator("[data-block-content]");
  const initial = await editor.textContent();
  await page.keyboard.press("End");
  await page.keyboard.type(" /count");
  await page.locator('[data-slash-command="type.demo.counter"]').click();
  const converted = page.locator(blockIdSelector(id));
  await expect(converted).toHaveAttribute("data-block-type", "demo.counter");
  await expect(converted.locator("[data-block-content]")).toHaveCount(0);

  await page.keyboard.press("Control+z");
  await expect(converted).toHaveAttribute("data-block-type", "paragraph");
  await converted.locator("[data-block-content]").click();
  await expect(converted.locator("[data-block-content]")).toHaveText(`${initial} /count`);
});

test("Slider property changes use editor history", async ({ page }) => {
  const slider = page.locator(`${BLOCK_ID_SELECTOR}${blockTypeSelector("demo.slider")} input[type="range"]`);
  await expect(slider).toHaveValue("35");
  await slider.focus();
  await page.keyboard.press("ArrowRight");
  await expect(slider).toHaveValue("36");
  await page.keyboard.press("Control+z");
  await expect(slider).toHaveValue("35");
  await page.keyboard.press("Control+Shift+z");
  await expect(slider).toHaveValue("36");
});
