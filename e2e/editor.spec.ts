import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Reset document" }).click();
});

test("edits, persists, and converts a block from the slash plugin", async ({ page }) => {
  const paragraph = page.getByRole("textbox", { name: "Paragraph" }).first();
  await paragraph.fill("Persistent text");
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Paragraph" }).first()).toHaveText("Persistent text");

  await page.getByRole("button", { name: "Add block" }).click();
  const empty = page.getByRole("textbox", { name: "Paragraph" }).last();
  await empty.focus();
  await empty.press("/");
  await expect(page.getByRole("menu", { name: "Block types" })).toBeVisible();
  await page.getByRole("menuitem", { name: "Heading 2" }).click();
  await expect(page.locator('[data-type="heading2"]').last()).toBeVisible();
});

test("handles enter, backspace, arrows, and tab through the keyboard plugin", async ({ page }) => {
  const first = page.getByRole("textbox", { name: "Paragraph" }).first();
  await first.fill("Hello world");
  await first.press("Home");
  await first.press("ArrowRight");
  await first.press("ArrowRight");
  await first.press("ArrowRight");
  await first.press("ArrowRight");
  await first.press("ArrowRight");
  await first.press("Enter");
  await expect(page.getByRole("textbox", { name: "Paragraph" }).nth(1)).toHaveText(" world");
  await page.getByRole("textbox", { name: "Paragraph" }).nth(1).press("Backspace");
  await expect(page.getByRole("textbox", { name: "Paragraph" }).first()).toHaveText("Hello world");

  const second = page.getByRole("textbox", { name: "Paragraph" }).nth(1);
  await second.focus();
  await second.press("Tab");
  await expect(page.locator(".rv-block-children [data-rivto-block-id]").first()).toBeVisible();
  await second.press("Shift+Tab");
});

test("selects block ranges and reorders with the page drag plugin", async ({ page }) => {
  const blocks = page.locator(".rv-page [data-rivto-block-id]");
  const handles = page.getByRole("button", { name: "Drag block" });
  await handles.nth(0).click();
  await handles.nth(2).click({ modifiers: ["Shift"] });
  await expect(blocks.nth(0)).toHaveAttribute("data-rivto-selected", "true");
  await expect(blocks.nth(1)).toHaveAttribute("data-rivto-selected", "true");
  await expect(blocks.nth(2)).toHaveAttribute("data-rivto-selected", "true");

  const source = await handles.nth(0).boundingBox();
  const target = await blocks.nth(4).boundingBox();
  if (!source || !target) throw new Error("Expected drag bounds");
  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x + 20, target.y + target.height / 2, { steps: 8 });
  await expect(page.locator(".rv-drag-overlay")).toBeVisible();
  await page.mouse.up();
  await expect.poll(() => page.locator(".snapshot pre").textContent()).toContain("# Rivto, block by block");
});

test("copies and pastes through editor clipboard commands", async ({ page }) => {
  const paragraph = page.getByRole("textbox", { name: "Paragraph" }).first();
  await paragraph.fill("Hello");
  await paragraph.focus();
  await paragraph.press("ControlOrMeta+A");
  await paragraph.evaluate((element) => {
    const data = new DataTransfer();
    data.setData("text/plain", "Pasted");
    const event = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", { value: data });
    element.dispatchEvent(event);
  });
  await expect(paragraph).toHaveText("Pasted");
});

test("copies a native selection across independent block editors", async ({ page }) => {
  const paragraphs = page.getByRole("textbox", { name: "Paragraph" });
  await paragraphs.nth(0).fill("First block");
  await paragraphs.nth(1).fill("Second block");
  const copied = await page.evaluate(() => {
    const contents = document.querySelectorAll<HTMLElement>("[data-rivto-block-content]");
    const first = contents[0]?.firstChild;
    const second = contents[1]?.firstChild;
    if (!first || !second) throw new Error("Expected two text blocks");
    const range = document.createRange();
    range.setStart(first, 2);
    range.setEnd(second, 6);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
    const data = new DataTransfer();
    const event = new Event("copy", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", { value: data });
    contents[0]?.dispatchEvent(event);
    return data.getData("text/plain");
  });
  expect(copied).toBe("rst block\nSecond");
});

test("rectangle-selects page blocks", async ({ page }) => {
  const surface = page.locator("[data-rivto-selection-field='block']");
  const first = page.locator(".rv-page [data-rivto-block-id]").first();
  const second = page.locator(".rv-page [data-rivto-block-id]").nth(1);
  const surfaceBox = await surface.boundingBox();
  const firstBox = await first.boundingBox();
  const secondBox = await second.boundingBox();
  if (!surfaceBox || !firstBox || !secondBox) throw new Error("Expected page bounds");
  await page.mouse.move(surfaceBox.x + 4, firstBox.y);
  await page.mouse.down();
  await page.mouse.move(secondBox.x + secondBox.width - 4, secondBox.y + secondBox.height - 2, { steps: 5 });
  await expect(page.locator(".rv-selection-rect")).toBeVisible();
  await page.mouse.up();
  await expect(page.locator(".rv-page [data-rivto-selected='true']")).toHaveCount(2);
});

test("switches to edgeless and moves the same block", async ({ page }) => {
  const text = "Shared between surfaces";
  await page.getByRole("textbox", { name: "Paragraph" }).first().fill(text);
  await page.getByRole("button", { name: /Mode: block/ }).click();
  const canvas = page.locator(".rv-canvas");
  await expect(canvas).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Paragraph" }).first()).toHaveText(text);
  const card = page.locator(".rv-canvas-block").first();
  const before = await card.evaluate((element) => getComputedStyle(element).left);
  await card.getByRole("button", { name: "Drag block" }).click();
  await card.focus();
  await card.press("ArrowRight");
  await expect.poll(() => card.evaluate((element) => getComputedStyle(element).left)).not.toBe(before);
  await page.getByRole("button", { name: /Mode: edgeless/ }).click();
  await expect(page.getByRole("textbox", { name: "Paragraph" }).first()).toHaveText(text);
});

test("rectangle-selects multiple edgeless objects", async ({ page }) => {
  await page.getByRole("button", { name: /Mode: block/ }).click();
  const canvas = page.locator(".rv-canvas");
  const box = await canvas.boundingBox();
  const second = await page.locator(".rv-canvas-block").nth(1).boundingBox();
  if (!box || !second) throw new Error("Expected canvas bounds");
  await page.mouse.move(box.x + 4, box.y + 4);
  await page.mouse.down();
  await page.mouse.move(second.x + second.width - 2, second.y + second.height - 2, { steps: 6 });
  await expect(page.locator(".rv-selection-rect")).toBeVisible();
  await page.mouse.up();
  await expect(page.locator(".rv-canvas [data-rivto-selected='true']")).toHaveCount(2);
});
