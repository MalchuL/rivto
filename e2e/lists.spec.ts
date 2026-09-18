import { expect, test, type Page } from "@playwright/test";
import { BLOCK_ID_SELECTOR, blockIdSelector } from "./dom-markers";

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
  await expect(root("Try the interactive checkbox").locator(":scope > .page-block-row [role=checkbox]")).not.toBeChecked();
  await expect(root("Completed checkbox item").locator(":scope > .page-block-row [role=checkbox]")).toBeChecked();
  const oneMarker = root("Start a numbered sequence").locator(":scope > .page-block-row .page-list-marker");
  const twoMarker = root("Continue the adjacent sequence").locator(":scope > .page-block-row .page-list-marker");
  const threeMarker = root("Continue numbering across the ordinary block").locator(":scope > .page-block-row .page-list-marker");
  await expect(oneMarker).toHaveAttribute("data-list-type", "start_numbered_list");
  await expect(twoMarker).toHaveAttribute("data-list-type", "numbered_list");
  await expect(threeMarker).toHaveAttribute("data-list-type", "continue_numbered_list");
  const [oneImage, twoImage, threeImage] = await Promise.all([
    oneMarker.screenshot(),
    twoMarker.screenshot(),
    threeMarker.screenshot(),
  ]);
  expect(twoImage).not.toEqual(oneImage);
  expect(threeImage).not.toEqual(twoImage);

  const checkboxBlock = root("Try the interactive checkbox");
  const startSlot = checkboxBlock.locator(':scope > .page-block-row > .rivto-slot[data-slot-owner="block"][data-slot-position="start"]');
  const endSlot = checkboxBlock.locator(':scope > .page-block-row > .rivto-slot[data-slot-owner="block"][data-slot-position="end"]');
  const leftTopSlot = checkboxBlock.locator(':scope > .page-block-row > .rivto-slot[data-slot-owner="block"][data-slot-position="left-top"]');
  await expect(startSlot.locator(":scope > *")).toHaveCount(1);
  await expect(startSlot.locator(":scope > *").nth(0)).toHaveClass(/page-list-checkbox/);
  await expect(leftTopSlot.locator(":scope > *")).toHaveCount(1);
  await expect(leftTopSlot.locator(":scope > *").nth(0)).toHaveClass(/page-drag-handle/);
  await expect(endSlot.locator(":scope > .demo-block-id")).toHaveCount(1);

  const checkboxContent = checkboxBlock.locator(":scope > .page-block-row [data-block-content]");
  const checkboxControl = startSlot.locator(".page-list-checkbox");
  const numberedBlock = root("Start a numbered sequence");
  const numberedContent = numberedBlock.locator(":scope > .page-block-row [data-block-content]");
  const numberedMarker = numberedBlock.locator(":scope > .page-block-row .page-list-marker");
  const row = checkboxBlock.locator(":scope > .page-block-row");
  const [checkboxBox, checkboxControlBox, numberedBox, markerBox, rowBox, dragBox] = await Promise.all([
    checkboxContent.boundingBox(),
    checkboxControl.boundingBox(),
    numberedContent.boundingBox(),
    numberedMarker.boundingBox(),
    row.boundingBox(),
    leftTopSlot.locator(".page-drag-handle").boundingBox(),
  ]);
  if (!checkboxBox || !checkboxControlBox || !numberedBox || !markerBox || !rowBox || !dragBox) {
    throw new Error("Expected slot geometry");
  }
  const [checkboxLineHeight, numberedLineHeight] = await Promise.all([
    checkboxContent.evaluate((element) => Number.parseFloat(getComputedStyle(element).lineHeight)),
    numberedContent.evaluate((element) => Number.parseFloat(getComputedStyle(element).lineHeight)),
  ]);
  expect(checkboxBox.x - checkboxControlBox.x - checkboxControlBox.width).toBeGreaterThanOrEqual(3);
  expect(Math.abs(checkboxControlBox.y + checkboxControlBox.height / 2 - (checkboxBox.y + checkboxLineHeight / 2))).toBeLessThanOrEqual(1);
  expect(Math.abs(markerBox.y + markerBox.height / 2 - (numberedBox.y + numberedLineHeight / 2))).toBeLessThanOrEqual(1);
  expect(Math.abs(rowBox.y - dragBox.y)).toBeLessThan(1);
});

test("creates interactive checkboxes from a shortcut and inherits them with Enter", async ({ page }) => {
  const roots = page.locator(`.page-surface > ${BLOCK_ID_SELECTOR}`);
  const block = roots.first();
  const editor = block.locator(":scope > .page-block-row [data-block-content]");
  await editor.click();
  await replaceContent(page, "[ ] ");

  await expect(editor).toHaveText("");
  const checkbox = block.locator(":scope > .page-block-row .page-list-checkbox");
  await expect(checkbox).not.toBeChecked();
  await page.keyboard.type("Task");
  await checkbox.check();
  await expect(checkbox).toBeChecked();
  await expect(editor).toHaveCSS("text-decoration-line", "line-through");

  await editor.click();
  await page.keyboard.press("End");
  const beforeEnter = await roots.count();
  await page.keyboard.press("Enter");
  await expect(roots).toHaveCount(beforeEnter + 1);
  const inherited = roots.nth(1);
  await expect(inherited.locator(":scope > .page-block-row .page-list-checkbox")).not.toBeChecked();
  await expect(inherited.locator(":scope > .page-block-row [data-block-content]")).toBeFocused();

  await page.keyboard.press("Enter");
  await expect(roots).toHaveCount(beforeEnter + 1);
  await expect(inherited.locator(":scope > .page-block-row .page-list-checkbox")).toHaveCount(0);
  await expect(inherited.locator(":scope > .page-block-row .page-list-marker")).toHaveCount(0);
});

test("numbers adjacent blocks and resumes through a list gap from slash commands", async ({ page }) => {
  const roots = page.locator(`.page-surface > ${BLOCK_ID_SELECTOR}`);
  const first = roots.first();
  const editor = first.locator(":scope > .page-block-row [data-block-content]");
  await editor.click();
  await replaceContent(page, "1. ");
  await page.keyboard.type("One");
  await page.keyboard.press("Enter");
  await expect(roots.nth(1).locator(":scope > .page-block-row [data-block-content]")).toBeFocused();
  await page.keyboard.type("Two");
  await page.keyboard.press("Enter");
  await expect(roots.nth(2).locator(":scope > .page-block-row [data-block-content]")).toBeFocused();

  const oneImage = await roots.nth(0).locator(":scope > .page-block-row .page-list-marker").screenshot();
  const twoImage = await roots.nth(1).locator(":scope > .page-block-row .page-list-marker").screenshot();
  expect(twoImage).not.toEqual(oneImage);

  await page.keyboard.type("/list");
  await page.locator('[data-slash-command="list.list"]').click();
  await page.keyboard.type("Gap");
  await page.keyboard.press("Enter");
  await expect(roots.nth(3).locator(":scope > .page-block-row [data-block-content]")).toBeFocused();
  await page.keyboard.type("/continue");
  await page.locator('[data-slash-command="list.continue_numbered_list"]').click();

  await expect(roots.nth(2).locator(":scope > .page-block-row .page-list-marker")).toHaveCount(0);
  const threeImage = await roots.nth(3).locator(":scope > .page-block-row .page-list-marker").screenshot();
  expect(threeImage).not.toEqual(twoImage);
});

test("renumbers unchanged blocks after root and nested hierarchy moves", async ({ page }) => {
  const root = (text: string) => page.locator(`.page-surface > ${BLOCK_ID_SELECTOR}`).filter({
    has: page.getByText(text, { exact: true }),
  });
  const start = root("Start a numbered sequence");
  const next = root("Continue the adjacent sequence");
  const gap = root("Ordinary content between numbered items");
  const continued = root("Continue numbering across the ordinary block");
  const oneImage = await start.locator(":scope > .page-block-row .page-list-marker").screenshot();
  const twoImage = await next.locator(":scope > .page-block-row .page-list-marker").screenshot();
  const threeImage = await continued
    .locator(":scope > .page-block-row .page-list-marker")
    .screenshot();
  const [startId, nextId, gapId] = await Promise.all([
    start.getAttribute("data-block-id"),
    next.getAttribute("data-block-id"),
    gap.getAttribute("data-block-id"),
  ]);
  if (!startId || !nextId || !gapId) throw new Error("Expected numbered root IDs");

  await page.evaluate(({ movingId, targetId }) => {
    const editor = (window as unknown as {
      __rivtoDemo: { editor: import("@chulane/rivto").RivtoEditorApi };
    }).__rivtoDemo.editor;
    editor.blocks.moveBlock(movingId, targetId, "before");
  }, { movingId: nextId, targetId: startId });
  await expect.poll(() => start.evaluate((element) => element.previousElementSibling?.getAttribute("data-block-id")))
    .toBe(nextId);
  expect(await next.locator(":scope > .page-block-row .page-list-marker").screenshot()).toEqual(oneImage);
  expect(await continued.locator(":scope > .page-block-row .page-list-marker").screenshot()).toEqual(twoImage);

  await page.evaluate((blockId) => {
    const editor = (window as unknown as {
      __rivtoDemo: { editor: import("@chulane/rivto").RivtoEditorApi };
    }).__rivtoDemo.editor;
    editor.blocks.updateBlock(blockId, { listProps: { type: "numbered_list" } });
  }, gapId);
  await expect(gap.locator(":scope > .page-block-row .page-list-marker"))
    .toHaveAttribute("data-list-type", "numbered_list");
  expect(await continued.locator(":scope > .page-block-row .page-list-marker").screenshot()).toEqual(threeImage);

  const nested = await page.evaluate(() => {
    const editor = (window as unknown as {
      __rivtoDemo: { editor: import("@chulane/rivto").RivtoEditorApi };
    }).__rivtoDemo.editor;
    const leftParent = editor.blocks.insertBlock({ type: "paragraph", content: "Numbered left parent" });
    const leftStart = editor.blocks.insertBlock({
      type: "paragraph",
      content: "Nested left one",
      listProps: { type: "start_numbered_list" },
    }, leftParent);
    editor.blocks.indentBlock(leftStart);
    const leftNext = editor.blocks.insertBlock({
      type: "paragraph",
      content: "Nested left two",
      listProps: { type: "numbered_list" },
    }, leftStart);
    const rightParent = editor.blocks.insertBlock({ type: "paragraph", content: "Numbered right parent" });
    const rightStart = editor.blocks.insertBlock({
      type: "paragraph",
      content: "Nested right one",
      listProps: { type: "start_numbered_list" },
    }, rightParent);
    editor.blocks.indentBlock(rightStart);
    const rightNext = editor.blocks.insertBlock({
      type: "paragraph",
      content: "Nested right two",
      listProps: { type: "numbered_list" },
    }, rightStart);
    return { leftParent, leftStart, leftNext, rightParent, rightNext };
  });
  const nestedNext = page.locator(blockIdSelector(nested.leftNext));
  expect(await nestedNext.locator(":scope > .page-block-row .page-list-marker").screenshot()).toEqual(twoImage);

  await page.evaluate(({ movingId, targetId }) => {
    const editor = (window as unknown as {
      __rivtoDemo: { editor: import("@chulane/rivto").RivtoEditorApi };
    }).__rivtoDemo.editor;
    editor.blocks.moveBlock(movingId, targetId, "before");
  }, { movingId: nested.leftNext, targetId: nested.leftStart });
  await expect.poll(() => page.locator(blockIdSelector(nested.leftStart)).evaluate(
    (element) => element.previousElementSibling?.getAttribute("data-block-id"),
  )).toBe(nested.leftNext);
  expect(await nestedNext.locator(":scope > .page-block-row .page-list-marker").screenshot()).toEqual(oneImage);

  await page.evaluate(({ movingId, parentId }) => {
    const editor = (window as unknown as {
      __rivtoDemo: { editor: import("@chulane/rivto").RivtoEditorApi };
    }).__rivtoDemo.editor;
    editor.blocks.moveBlock(movingId, parentId, "inside");
  }, { movingId: nested.leftNext, parentId: nested.rightParent });
  await expect.poll(() => page.locator(blockIdSelector(nested.rightNext)).evaluate(
    (element) => element.nextElementSibling?.getAttribute("data-block-id"),
  )).toBe(nested.leftNext);
  expect(await nestedNext.locator(":scope > .page-block-row .page-list-marker").screenshot()).toEqual(threeImage);
});

test("uses the shared list and checkbox rendering in edgeless cards", async ({ page }) => {
  await page.locator('[data-editor-mode="edgeless"]').click();
  const block = (text: string) => page.locator("[data-edgeless-root] [data-block-content]")
    .filter({ hasText: new RegExp(`^${text}$`) })
    .locator("xpath=ancestor::*[@data-block-id][1]");

  const checkbox = block("Try the interactive checkbox").locator(":scope > .page-block-row [role=checkbox]");
  await expect(checkbox).not.toBeChecked();
  await checkbox.evaluate((element: HTMLElement) => element.click());
  await expect(checkbox).toBeChecked();
  await page.locator('[data-editor-action="undo"]').click();
  await expect(checkbox).not.toBeChecked();
  await expect(block("Completed checkbox item").locator(":scope > .page-block-row [role=checkbox]")).toBeChecked();
  const oneImage = await block("Start a numbered sequence").locator(":scope > .page-block-row .page-list-marker").screenshot();
  const twoImage = await block("Continue the adjacent sequence").locator(":scope > .page-block-row .page-list-marker").screenshot();
  const threeImage = await block("Continue numbering across the ordinary block").locator(":scope > .page-block-row .page-list-marker").screenshot();
  expect(twoImage).not.toEqual(oneImage);
  expect(threeImage).not.toEqual(twoImage);
});
