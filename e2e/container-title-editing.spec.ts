import { expect, test } from "@playwright/test";

for (const [type, name] of [
  ["bento", "Bento"],
  ["kanban", "Kanban"],
  ["todo-storage", "TODO storage"],
  ["columns", "Columns"],
  ["table", "Table"],
]) {
  test(`edits and pastes into a collapsed ${name} title`, async ({ page }) => {
    await page.goto("/?test_features=1");
    const block = page.locator(`[data-block-type="${type}"]`).first();
    await block.locator(":scope > .rivto-block-row [data-collapse-toggle]").click();
    const title = block.getByRole("textbox", { name: `${name} name` });
    await title.click();
    await expect(title).toBeFocused();
    await expect(block).not.toHaveAttribute("data-block-selected", "true");
    await page.keyboard.press("ControlOrMeta+a");
    await expect.poll(() => page.evaluate(() => window.getSelection()?.toString())).toBe(name);
    await page.keyboard.type("Alpha beta");
    await expect(title).toHaveText("Alpha beta");
    await page.keyboard.press("ControlOrMeta+a");
    await expect
      .poll(() => page.evaluate(() => window.getSelection()?.toString()))
      .toBe("Alpha beta");
    await page.keyboard.type("Replaced");
    await expect(title).toHaveText("Replaced");
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.press("ControlOrMeta+c");
    await page.keyboard.press("End");
    await page.keyboard.press("ControlOrMeta+v");
    await expect(title).toHaveText("ReplacedReplaced");
    await page.keyboard.press("ControlOrMeta+z");
    await expect(title).toHaveText("Replaced");
    await title.evaluate((element) => {
      const data = new DataTransfer();
      data.setData("text/plain", " pasted");
      const event = new ClipboardEvent("paste", { bubbles: true, cancelable: true });
      Object.defineProperty(event, "clipboardData", { value: data });
      element.dispatchEvent(event);
    });
    await expect(title).toHaveText("Replaced pasted");
    await title.evaluate((element) => element.scrollIntoView({ block: "center" }));
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    const points = await title.evaluate((element) => {
      const node = element.firstChild!;
      return [2, 6].map((offset) => {
        const range = document.createRange();
        range.setStart(node, offset);
        range.collapse(true);
        const rect = range.getBoundingClientRect();
        return { x: rect.left, y: rect.top + rect.height / 2 };
      });
    });
    await page.mouse.move(points[0].x, points[0].y);
    await page.mouse.down();
    await page.mouse.move(points[1].x, points[1].y, { steps: 8 });
    await page.mouse.up();
    await expect.poll(() => page.evaluate(() => window.getSelection()?.toString())).toBe("plac");
    await page.keyboard.type("X");
    await expect(title).toHaveText("ReXed pasted");
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.press("ControlOrMeta+x");
    await expect(title).toHaveText("");
    await page.keyboard.press("ControlOrMeta+v");
    await expect(title).toHaveText("ReXed pasted");
  });
}

for (const [type, name] of [
  ["bento", "Bento"],
  ["columns", "Columns"],
  ["table", "Table"],
]) {
  test(`copies and pastes a collapsed ${name} title in edgeless mode`, async ({ page }) => {
    await page.goto("/?test_features=1");
    await expect(page.locator('[data-journal-document="today"] > .page-surface')).toBeVisible();
    await page.evaluate((type) => {
      const editor = (
        window as unknown as { __rivtoDemo: { editor: import("@chulane/rivto").DocumentEditorAPI } }
      ).__rivtoDemo.editor;
      const board = editor.blocks.getBlocks().find((block) => block.type === type)!;
      editor.elements.insertElement({
        type: "block",
        zIndex: 0,
        frame: { x: 20, y: 20, width: 700, height: 500 },
        props: { startBlockId: board.id, endBlockId: board.id },
      });
    }, type);
    await page.locator('[data-editor-mode="edgeless"]').click();
    const block = page.locator(`[data-block-type="${type}"]:visible`).first();
    await block.locator(":scope > .rivto-block-row [data-collapse-toggle]").click();
    const button = block.locator(":scope > .rivto-block-row .rivto-container-summary > span");
    await button.scrollIntoViewIfNeeded();
    const box = (await button.boundingBox())!;
    await page.mouse.move(box.x + 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width - 2, box.y + box.height / 2, { steps: 8 });
    await page.mouse.up();
    await expect(block).toHaveAttribute("data-block-selected", "true");
    const title = block.getByRole("textbox", { name: `${name} name` });
    await title.click();
    await expect(block).not.toHaveAttribute("data-block-selected", "true");
    await title.fill("Board");
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.press("ControlOrMeta+c");
    await page.keyboard.press("End");
    await page.keyboard.press("ControlOrMeta+v");
    await expect(title).toHaveText("BoardBoard");
  });
}

test("selects the default name by dragging the visible text", async ({ page }) => {
  await page.goto("/?test_features=1");
  const block = page.locator('[data-block-type="bento"]').first();
  await block.locator(":scope > .rivto-block-row [data-collapse-toggle]").click();
  const name = block.locator(".rivto-container-summary-title");
  await name.evaluate((element) => element.scrollIntoView({ block: "center" }));
  const rect = (await name.boundingBox())!;
  await page.mouse.move(rect.x + 1, rect.y + rect.height / 2);
  await page.mouse.down();
  await page.mouse.move(rect.x + rect.width - 1, rect.y + rect.height / 2, { steps: 10 });
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => window.getSelection()?.toString())).toBe("Bento");
  await expect(block).not.toHaveAttribute("data-block-selected", "true");
});

for (const [type, name] of [
  ["bento", "Bento"],
  ["kanban", "Kanban"],
  ["todo-storage", "TODO storage"],
  ["columns", "Columns"],
  ["table", "Table"],
]) {
  test(`dragging a collapsed ${name} selects the container`, async ({ page }) => {
    await page.goto("/?test_features=1");
    const block = page.locator(`[data-block-type="${type}"]`).first();
    await block.locator(":scope > .rivto-block-row [data-collapse-toggle]").click();
    const button = block.locator(":scope > .rivto-block-row .rivto-container-summary > span");
    await button.evaluate((element) => element.scrollIntoView({ block: "center" }));
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    const box = (await button.boundingBox())!;
    await page.mouse.move(box.x + 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width - 2, box.y + box.height / 2, { steps: 8 });
    await page.mouse.up();
    await expect(block).toHaveAttribute("data-block-selected", "true");
    await expect(button).toBeVisible();
    const title = block.getByRole("textbox", { name: `${name} name` });
    await title.click();
    await expect(title).toBeFocused();
    await expect(block).not.toHaveAttribute("data-block-selected", "true");
  });
}
