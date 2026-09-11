/** Browser coverage for responsive Bento layout, widths, shared modal and editing. */
import { expect, test, type Locator, type Page } from "@playwright/test";

const RESIZE_RIGHT = "Resize Bento tile from the right";
const RESIZE_LEFT = "Resize Bento tile from the left";

/**
 * Drags one Bento edge handle by a horizontal pixel delta.
 *
 * @param page - Browser page owning the editor.
 * @param handle - Left or right resize separator.
 * @param dx - Horizontal movement in CSS pixels; positive is rightward.
 * @returns After pointer release.
 */
async function dragResizeHandle(page: Page, handle: Locator, dx: number): Promise<void> {
  await handle.hover();
  const box = (await handle.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y, { steps: 8 });
  await page.mouse.up();
}

for (const mode of ["block", "edgeless"]) {
  test(`Bento editing and layout in ${mode}`, async ({ page }) => {
    await page.goto("/");
    await page.evaluate((mode) => {
      const { editor } = (window as unknown as { __rivtoDemo: { editor: import("@chulane/rivto-react").ReactEditor } }).__rivtoDemo.editor;
      const board = editor.blocks.getBlocks().find((block) => block.type === "bento")!;
      editor.load({ ...editor.dump(), blocks: [board], elements: [] });
      if (mode === "edgeless") editor.elements.insertElement({ type: "block", zIndex: 0,
        frame: { x: 20, y: 20, width: 800, height: 600 }, props: { startBlockId: board.id, endBlockId: board.id } });
    }, mode);
    if (mode === "edgeless") await page.locator('[data-editor-mode="edgeless"]').click();
    const board = page.locator('[data-block-type="bento"]');
    const tiles = board.locator(':scope > [id^="block-children-"] > [data-block-id]');
    await expect(tiles).toHaveCount(3);
    await expect(tiles.first()).toHaveCSS("flex-grow", "0");
    await expect(tiles.first()).toHaveCSS("flex-basis", "220px");
    await board.getByRole("button", { name: "Expand Bento", exact: true }).click();
    await expect(page.locator("dialog:modal")).toBeVisible();
    const first = tiles.first();
    await first.hover();
    const rightHandle = first.getByRole("separator", { name: RESIZE_RIGHT });
    await expect(rightHandle).toBeVisible();
    const startWidth = await first.evaluate((element) => (element as HTMLElement).offsetWidth);
    await dragResizeHandle(page, rightHandle, 80);
    const committed = `${Math.max(160, Math.min(960, startWidth + 80))}px`;
    await expect(first).toHaveCSS("flex-basis", committed);
    const editable = first.getByRole("textbox").first();
    await editable.click();
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await expect(tiles).toHaveCount(4);
    await expect(tiles.nth(1).getByRole("textbox")).toBeFocused();
    await page.keyboard.type("New tile");
    await expect(tiles.nth(1)).toContainText("New tile");
    await board.getByRole("button", { name: "Collapse Bento", exact: true }).click();
    await expect(page.locator("dialog:modal")).toHaveCount(0);
    // Width preferences survive snapshot reload, and tiles shrink to their surface.
    await page.evaluate(() => {
      const { editor } = (window as unknown as { __rivtoDemo: { editor: import("@chulane/rivto-react").ReactEditor } }).__rivtoDemo.editor;
      editor.load(editor.dump());
    });
    await expect(first).toHaveCSS("flex-basis", committed);
    if (mode === "block") await page.setViewportSize({ width: 420, height: 800 });
    const box = (await board.boundingBox())!;
    for (const tile of await tiles.all()) expect((await tile.boundingBox())!.width).toBeLessThanOrEqual(box.width);
    await page.evaluate(() => {
      const { editor } = (window as unknown as { __rivtoDemo: { editor: import("@chulane/rivto-react").ReactEditor } }).__rivtoDemo.editor;
      const board = editor.blocks.getBlocks().find((block) => block.type === "bento")!;
      editor.blocks.removeBlocks(board.children.map((child) => child.id));
    });
    await board.getByRole("textbox").first().click();
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await expect(tiles).toHaveCount(1);
    await expect(tiles.first().getByRole("textbox")).toBeFocused();
    await page.keyboard.type("First tile");
    await expect(tiles.first()).toContainText("First tile");
  });
}

test("Bento edge resize freezes siblings until pointer release", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    const { editor } = (window as unknown as { __rivtoDemo: { editor: import("@chulane/rivto-react").ReactEditor } }).__rivtoDemo.editor;
    const board = editor.blocks.getBlocks().find((block) => block.type === "bento")!;
    editor.load({ ...editor.dump(), blocks: [board], elements: [] });
  });
  const board = page.locator('[data-block-type="bento"]');
  await board.getByRole("button", { name: "Expand Bento", exact: true }).click();
  const tiles = board.locator(':scope > [id^="block-children-"] > [data-block-id]');
  const first = tiles.first();
  const sibling = tiles.nth(1);
  await first.hover();
  const handle = first.getByRole("separator", { name: RESIZE_RIGHT });
  await expect(handle).toBeVisible();
  const origin = (await handle.boundingBox())!;
  const before = (await sibling.boundingBox())!;
  const startWidth = await first.evaluate((element) => (element as HTMLElement).offsetWidth);
  await page.mouse.move(origin.x + origin.width / 2, origin.y + origin.height / 2);
  await page.mouse.down();
  await page.mouse.move(origin.x + origin.width / 2 + 90, origin.y + origin.height / 2, { steps: 10 });
  const mid = (await sibling.boundingBox())!;
  expect(mid.x).toBeCloseTo(before.x, 0);
  expect(mid.y).toBeCloseTo(before.y, 0);
  expect(mid.width).toBeCloseTo(before.width, 0);
  await expect(first).toHaveAttribute("data-bento-resizing", "right");
  await page.mouse.up();
  await expect(first).not.toHaveAttribute("data-bento-resizing");
  await expect(first).toHaveCSS("flex-basis", `${Math.max(160, Math.min(960, startWidth + 90))}px`);

  await sibling.hover();
  const leftHandle = sibling.getByRole("separator", { name: RESIZE_LEFT });
  await expect(leftHandle).toBeVisible();
  const siblingBefore = (await first.boundingBox())!;
  const siblingStart = await sibling.evaluate((element) => (element as HTMLElement).offsetWidth);
  const leftBox = (await leftHandle.boundingBox())!;
  await page.mouse.move(leftBox.x + leftBox.width / 2, leftBox.y + leftBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(leftBox.x + leftBox.width / 2 - 60, leftBox.y + leftBox.height / 2, { steps: 8 });
  const firstMid = (await first.boundingBox())!;
  expect(firstMid.x).toBeCloseTo(siblingBefore.x, 0);
  expect(firstMid.width).toBeCloseTo(siblingBefore.width, 0);
  await page.mouse.up();
  await expect(sibling).toHaveCSS("flex-basis", `${Math.max(160, Math.min(960, siblingStart + 60))}px`);
});

for (const edge of ["between", "under", "inside"]) {
  test(`Bento drag placement ${edge}`, async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => {
      const { editor } = (window as unknown as { __rivtoDemo: { editor: import("@chulane/rivto-react").ReactEditor } }).__rivtoDemo.editor;
      const board = editor.blocks.getBlocks().find((block) => block.type === "bento")!;
      editor.load({ ...editor.dump(), blocks: [board], elements: [] });
    });
    const board = page.locator('[data-block-type="bento"]');
    await board.getByRole("button", { name: "Expand Bento", exact: true }).click();
    const tiles = board.locator(':scope > [id^="block-children-"] > [data-block-id]');
    const source = tiles.first();
    const target = tiles.nth(1);
    const sourceId = await source.getAttribute("data-block-id");
    const targetId = await target.getAttribute("data-block-id");
    const rowClass = "page-block-row";
    const handleClass = "page-drag-handle";
    const handle = source.locator(`:scope > .${rowClass} .${handleClass}`);
    await source.hover();
    await handle.hover();
    const from = (await handle.boundingBox())!;
    const to = (await target.boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + 10, from.y + 10, { steps: 3 });
    // Sibling drops aim at the 16px wrap gap, not a strip hugging the tile.
    const destX = edge === "between" ? to.x + to.width + 8 : to.x + to.width / 2;
    const destY = edge === "under" ? to.y + to.height + 8 : to.y + to.height / 2;
    await page.mouse.move(destX, destY, { steps: 15 });
    if (edge === "inside") await expect(target).toHaveAttribute("data-drop-inside", "true");
    else {
      const lineClass = "page-drop-line";
      const line = target.locator(`:scope > .${lineClass}`);
      await expect(line).toBeVisible();
      const lineBox = (await line.boundingBox())!;
      const targetBox = (await target.boundingBox())!;
      const lineMidX = lineBox.x + lineBox.width / 2;
      const lineMidY = lineBox.y + lineBox.height / 2;
      if (edge === "between") expect(Math.abs(lineMidX - (targetBox.x + targetBox.width + 8))).toBeLessThanOrEqual(2);
      else expect(Math.abs(lineMidY - (targetBox.y + targetBox.height + 8))).toBeLessThanOrEqual(2);
    }
    await page.mouse.up();
    if (edge === "inside") await expect(page.locator(`[data-block-id="${targetId}"] [data-block-id="${sourceId}"]`)).toHaveCount(1);
    else await expect(tiles.nth(1)).toHaveAttribute("data-block-id", sourceId!);
  });
}
