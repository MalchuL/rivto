import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Reset document" }).click();
});

test("selects blocks from handles with range and toggle modifiers", async ({ page }) => {
  const blocks = page.locator("[data-rivto-surface-content='block'] [data-rivto-block-id]");
  const first = blocks.nth(0);
  const second = blocks.nth(1);
  const third = blocks.nth(2);

  await first.locator(".rv-block-handle").click();
  await expect(first).toHaveAttribute("data-rivto-selected", "true");

  await third.locator(".rv-block-handle").click({ modifiers: ["Shift"] });
  await expect(first).toHaveAttribute("data-rivto-selected", "true");
  await expect(second).toHaveAttribute("data-rivto-selected", "true");
  await expect(third).toHaveAttribute("data-rivto-selected", "true");

  await page.keyboard.down("Control");
  const secondHandleBox = await second.locator(".rv-block-handle").boundingBox();
  if (!secondHandleBox) throw new Error("Expected second handle bounds");
  await page.mouse.click(secondHandleBox.x + secondHandleBox.width / 2, secondHandleBox.y + secondHandleBox.height / 2);
  await page.keyboard.up("Control");
  await expect(second).not.toHaveAttribute("data-rivto-selected", "true");
});

test("reorders blocks by dragging the block handle", async ({ page }) => {
  const blocks = page.locator("[data-rivto-selection-column='block'] [data-rivto-block-id]");
  await expect(blocks.first()).toBeVisible();
  const before = await page.locator(".snapshot pre").textContent();
  const firstHandle = blocks.nth(0).locator(".rv-block-handle");
  const third = blocks.nth(2);
  const handleBox = await firstHandle.boundingBox();
  const thirdBox = await third.boundingBox();
  if (!handleBox || !thirdBox) throw new Error("Expected block bounds");

  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(thirdBox.x + thirdBox.width / 2, thirdBox.y + thirdBox.height / 2, { steps: 8 });
  await page.mouse.up();

  await expect.poll(() => page.locator(".snapshot pre").textContent()).not.toBe(before);
});

test("drags selected blocks as one group", async ({ page, browserName }) => {
  test.skip(browserName === "firefox", "Firefox Playwright reports this selected-group drag over the active block itself.");
  const blocks = page.locator("[data-rivto-selection-column='block'] [data-rivto-block-id]");
  await expect(blocks.nth(4)).toBeVisible();

  await blocks.nth(0).locator(".rv-block-handle").click();
  await blocks.nth(1).locator(".rv-block-handle").click({ modifiers: ["Shift"] });

  const handleBox = await blocks.nth(0).locator(".rv-block-handle").boundingBox();
  const targetBox = await blocks.nth(4).boundingBox();
  if (!handleBox || !targetBox) throw new Error("Expected block bounds");

  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 8 });

  await expect(page.locator("[data-rivto-multi-drag-overlay='true']")).toContainText("(+1)");
  await expect.poll(() => blocks.evaluateAll((elements) => elements.every((element) => getComputedStyle(element).transform === "none"))).toBe(true);

  await page.mouse.up();

  const content = page.locator("[data-rivto-selection-column='block'] [data-rivto-block-content]");
  await expect.poll(async () => {
    const values = await content.evaluateAll((elements) => elements.map((element) => element.textContent ?? ""));
    const first = values.indexOf("# Rivto, block by block");
    const second = values.indexOf("This demo uses the new React EditorView path.");
    return first > 0 && second === first + 1;
  }).toBe(true);
});

test("shows block rectangle selection from blank field and highlights immediately", async ({ page }) => {
  const surface = page.locator("[data-rivto-selection-field='block']");
  const blank = page.locator("[data-rivto-selection-blank='bottom']");
  const firstBlock = surface.locator("[data-rivto-block-id]").first();
  const lastBlock = surface.locator("[data-rivto-block-id]").last();
  await expect(firstBlock).toBeVisible();
  await expect(blank).toBeVisible();
  await blank.hover();
  await page.mouse.down();
  const lastBox = await lastBlock.boundingBox();
  if (!lastBox) throw new Error("Expected block surface bounds");
  await page.mouse.move(lastBox.x + 8, lastBox.y + 8, { steps: 4 });

  await expect(page.locator(".rv-selection-rect")).toBeVisible();
  await expect(surface.locator("[data-rivto-selected='true']").first()).toBeVisible();

  await page.mouse.up();

  await expect(page.locator(".rv-selection-rect")).toBeHidden();
  await expect(surface.locator("[data-rivto-selected='true']").first()).toBeVisible();
});

test("starts block rectangle selection from top and side gutters", async ({ page }) => {
  const surface = page.locator("[data-rivto-selection-field='block']");
  const top = page.locator("[data-rivto-selection-blank='top']");
  const block = surface.locator("[data-rivto-block-id]").first();
  await expect(top).toBeVisible();
  await top.hover();
  await page.mouse.down();
  const blockBox = await block.boundingBox();
  if (!blockBox) throw new Error("Expected block bounds");
  await page.mouse.move(blockBox.x + 8, blockBox.y + 8, { steps: 4 });
  await expect(page.locator(".rv-selection-rect")).toBeVisible();
  await page.mouse.up();
  await expect(surface.locator("[data-rivto-selected='true']").first()).toBeVisible();

  const surfaceBox = await surface.boundingBox();
  const selectedBox = await block.boundingBox();
  if (!surfaceBox || !selectedBox) throw new Error("Expected surface bounds");
  await page.mouse.move(surfaceBox.x + 8, selectedBox.y + selectedBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(selectedBox.x + 8, selectedBox.y + 8, { steps: 4 });
  await expect(page.locator(".rv-selection-rect")).toBeVisible();
  await page.mouse.up();
  await expect(surface.locator("[data-rivto-selected='true']").first()).toBeVisible();
});
