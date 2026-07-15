import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Reset document" }).click();
});

test("selects and drags edgeless blocks through the drag handle", async ({ page }) => {
  await page.getByRole("button", { name: "Mode: block" }).click();
  await expect(page.locator(".rv-canvas")).toBeVisible();

  const block = page.locator(".rv-canvas-block").first();
  const handle = block.locator(".rv-block-handle");
  await expect(handle).toBeVisible();

  await handle.click();
  await expect(block).toHaveAttribute("data-selected", "true");

  const leftBeforeKey = await block.evaluate((element) => getComputedStyle(element).left);
  await block.press("ArrowRight");
  await expect.poll(() => block.evaluate((element) => getComputedStyle(element).left)).not.toBe(leftBeforeKey);
  const revisionBeforePointerDrag = await page.getByLabel("Runtime inspector").locator("code").nth(1).textContent();

  const box = await block.boundingBox();
  if (!box) throw new Error("Expected edgeless block bounds");
  const leftBeforeDrag = await block.evaluate((element) => getComputedStyle(element).left);
  const handleBox = await handle.boundingBox();
  if (!handleBox) throw new Error("Expected drag handle bounds");

  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleBox.x + handleBox.width / 2 + 32, handleBox.y + handleBox.height / 2 + 12, { steps: 4 });
  await expect(block).toHaveCSS("transform", /matrix/);
  await expect(page.getByLabel("Runtime inspector").locator("code").nth(1)).toHaveText(revisionBeforePointerDrag ?? "");
  await page.mouse.up();

  await expect.poll(() => block.evaluate((element) => getComputedStyle(element).left)).not.toBe(leftBeforeDrag);
  await expect(page.getByLabel("Runtime inspector").locator("code").nth(1)).not.toHaveText(revisionBeforePointerDrag ?? "");
});

test("shows edgeless rectangle selection and commits after pointerup", async ({ page }) => {
  await page.getByRole("button", { name: "Mode: block" }).click();
  const canvas = page.locator(".rv-canvas");
  await expect(canvas).toBeVisible();
  const revisionBefore = await page.getByLabel("Runtime inspector").locator("code").nth(1).textContent();
  const box = await canvas.boundingBox();
  if (!box) throw new Error("Expected canvas bounds");

  await page.mouse.move(box.x + 16, box.y + 16);
  await page.mouse.down();
  await page.mouse.move(box.x + 420, box.y + 240, { steps: 4 });

  await expect(page.locator(".rv-selection-rect")).toBeVisible();
  await expect(page.locator(".rv-canvas-block[data-selected='true']").first()).toBeVisible();
  await expect(page.getByLabel("Runtime inspector").locator("code").nth(1)).toHaveText(revisionBefore ?? "");

  await page.mouse.up();

  await expect(page.locator(".rv-selection-rect")).toBeHidden();
  await expect(page.getByLabel("Runtime inspector").locator("code").nth(1)).not.toHaveText(revisionBefore ?? "");
  await expect(page.locator(".rv-canvas-block[data-selected='true']").first()).toBeVisible();
});
