import { expect, test } from "@playwright/test";

/**
 * Plain mode is another view of the same journal document.
 *
 * Hidden blocks stay in the block editor. Text entered here, including a new
 * block from Enter and a newline from Shift+Enter, is still there after
 * switching back to Page.
 */
test("plain mode edits the same blocks as the page editor", async ({ page }) => {
  await page.goto("/");
  const today = page.locator('[data-journal-document="today"]');
  const yesterday = page.locator('[data-journal-document="yesterday"]');

  await today.getByRole("button", { name: "Plain", exact: true }).click();
  const plain = today.locator("[data-plain-editor]");
  await expect(plain).toBeVisible();
  await expect(today.locator(".page-surface")).toHaveCount(0);
  await expect(yesterday.locator(".page-surface")).toHaveCount(1);

  await expect(plain.getByText("This paragraph renders").first()).toBeVisible();
  await expect(plain.getByText("Level 2: this child owns another nested branch.").first()).toBeVisible();
  await expect(plain.locator(".plain-bullet").first()).toBeVisible();
  await expect(plain.getByText("Drag me between columns or back into the editor")).toHaveCount(0);
  await expect(plain.getByText("const selectedBlocks")).toHaveCount(0);
  await expect(plain.locator('[data-block-type="demo.slider"]')).toHaveCount(0);
  await expect(plain.locator('[data-block-type="demo.counter"]')).toHaveCount(0);

  const sample = plain.locator(".plain-document > [data-block-id]").first();
  await expect(sample).toHaveCSS("border-top-width", "0px");
  await expect(sample).toHaveCSS("outline-style", "none");

  const introId = await sample.getAttribute("data-block-id");
  const next = plain.locator(".plain-document > [data-block-id]").nth(1);
  const nextBox = (await next.boundingBox())!;
  const handle = sample.locator(":scope > .page-block-row .page-drag-handle");
  await sample.locator(":scope > .page-block-row").hover();
  await handle.hover();
  const from = (await handle.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + 8, from.y + 8, { steps: 3 });
  await page.mouse.move(nextBox.x + 48, nextBox.y + nextBox.height - 2, { steps: 12 });
  await page.mouse.up();
  await expect.poll(async () => page.evaluate(() => {
    const editor = (window as unknown as {
      __rivtoDemo: { editor: { blocks: { getRootIds(): string[] } } };
    }).__rivtoDemo.editor;
    return editor.blocks.getRootIds()[0];
  })).not.toBe(introId);

  await today.getByRole("button", { name: "Separators", exact: true }).click();
  await expect(plain).toHaveAttribute("data-separators", "true");
  const separated = plain.locator(".plain-document > [data-block-id]").nth(1);
  await expect(separated).toHaveCSS("border-top-width", "1px");
  await today.getByRole("button", { name: "Separators", exact: true }).click();
  await expect(plain).not.toHaveAttribute("data-separators", "true");

  const finish = plain.locator("[data-block-content]").filter({
    hasText: "Finish the selection in the middle of this sentence",
  });
  await finish.click();
  await page.keyboard.press("Tab");

  const slash = plain.locator("[data-block-content]").filter({
    hasText: "Type `/` anywhere here",
  });
  await slash.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Created from plain");
  await page.keyboard.press("Shift+Enter");
  await page.keyboard.type("same block");

  await today.getByRole("button", { name: "Page", exact: true }).click();
  await expect(today.locator(".page-surface")).toBeVisible();
  const created = today.locator("[data-block-id]").filter({ hasText: "Created from plain" });
  await expect(created).toContainText("same block");
  await expect(created.locator("[data-block-content]")).toHaveCount(1);
  await expect(today.locator('[data-block-type="demo.counter"] [data-block-id]').filter({
    hasText: "Finish the selection",
  })).toHaveCount(0);
  const finishBlock = today.locator('[data-block-type="paragraph"]').filter({
    hasText: "Finish the selection in the middle of this sentence",
  });
  await expect(finishBlock.locator("xpath=ancestor::*[@data-block-id][1]")).toHaveAttribute("data-block-type", "paragraph");
  await expect(today.getByText("Drag me between columns or back into the editor").first()).toBeVisible();
});
