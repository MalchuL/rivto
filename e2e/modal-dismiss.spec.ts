import type { DocumentEditorAPI } from "@chulane/rivto";
import { expect, test } from "@playwright/test";

for (const type of ["Bento", "Kanban", "Table"]) {
  for (const repeat of [1, 200]) {
    test(`${type} modal closes only on backdrop press (repeat=${repeat})`, async ({ page }) => {
      await page.goto(`/?repeat=${repeat}`);
      const id = await page
        .locator(`[data-block-type="${type.toLowerCase()}"]`)
        .first()
        .getAttribute("data-block-id");
      const board = page.locator(`[data-block-id="${id}"]`);
      const expand = board.getByRole("button", { name: `Expand ${type}`, exact: true });
      await expand.scrollIntoViewIfNeeded();
      const panelCount = await page.locator("[data-rivto-panel]").count();
      await expand.click();
      const modal = page.getByRole("dialog", { name: `Expanded ${type}`, exact: true });
      await expect(modal).toBeVisible();
      await expect(page.locator("[data-rivto-panel]")).toHaveCount(panelCount + 1);
      await expect(modal.locator("[data-rivto-panel]")).toHaveCount(1);
      const box = await modal.boundingBox();
      if (!box) {
        throw new Error("Expected modal bounds");
      }
      // Empty padding belongs to the dialog, not its backdrop.
      await page.mouse.click(box.x + box.width / 2, box.y + 10);
      await expect(modal).toBeVisible();
      await page.mouse.move(box.x + box.width / 2, box.y + 10);
      await page.mouse.down();
      await page.mouse.move(2, 2);
      await page.mouse.up();
      await expect(modal).toBeVisible();
      const started = performance.now();
      await page.mouse.click(2, 2);
      await expect(modal).toHaveCount(0);
      await expect(expand).toBeVisible();
      await expect(expand).toBeFocused();
      await expect(page.locator("[data-rivto-panel]")).toHaveCount(panelCount);
      console.log(`${type} repeat=${repeat} dismiss: ${performance.now() - started} ms`);
      await expand.click();
      await page.keyboard.press("Escape");
      await expect(modal).toHaveCount(0);
      await expect(expand).toBeVisible();
    });
  }
}

for (const type of ["Bento", "Kanban", "Table"]) {
  test(`${type} preserves edits and undo across dialog remounts`, async ({ page }) => {
    await page.goto("/");
    const id = await page
      .locator(`[data-block-type="${type.toLowerCase()}"]`)
      .first()
      .getAttribute("data-block-id");
    const board = page.locator(`[data-block-id="${id}"]`);
    const expand = board.getByRole("button", { name: `Expand ${type}`, exact: true });
    await expand.scrollIntoViewIfNeeded();
    await expand.click();
    const modal = page.getByRole("dialog", { name: `Expanded ${type}`, exact: true });
    const editable = modal.getByRole("textbox").first();
    await editable.click();
    await page.keyboard.press("End");
    await page.keyboard.type(" modal-edit");
    await expect(editable).toContainText("modal-edit");
    await board.getByRole("button", { name: `Collapse ${type}`, exact: true }).click();
    await expect(modal).toHaveCount(0);
    await expect(board).toContainText("modal-edit");
    await page.keyboard.press("Control+z");
    await expect(board).not.toContainText("modal-edit");
    await page.keyboard.press("Control+Shift+z");
    await expect(board).toContainText("modal-edit");
    await expand.click();
    await expect(modal).toContainText("modal-edit");
  });
}

for (const repeat of [1, 200]) {
  test(`modifier clicks select blocks without dismissing the modal (repeat=${repeat})`, async ({
    page,
  }) => {
    await page.goto(`/?repeat=${repeat}`);
    const expand = page.getByRole("button", { name: "Expand Bento", exact: true }).first();
    await expand.scrollIntoViewIfNeeded();
    await expand.click();
    const modal = page.getByRole("dialog", { name: "Expanded Bento", exact: true });
    const block = modal.locator('[data-block-type="paragraph"]').first();
    const durations: number[] = [];
    for (const modifier of ["Meta", "Control", "Meta", "Control"] as const) {
      const started = performance.now();
      await block.click({ modifiers: [modifier] });
      await expect(modal).toBeVisible();
      await expect(block).toHaveAttribute("data-block-selected", "true");
      await block.click({ modifiers: [modifier] });
      await expect(modal).toBeVisible();
      await expect(block).not.toHaveAttribute("data-block-selected");
      durations.push(performance.now() - started);
    }
    console.log(`modifier toggle repeat=${repeat}: ${JSON.stringify(durations)} ms`);
    await page.mouse.click(2, 2);
    await expect(modal).toHaveCount(0);
  });
}

for (const mode of ["block", "edgeless"]) {
  for (const repeat of mode === "block" ? [1, 200] : [1]) {
    test(`deletes selected modal blocks in ${mode} mode (repeat=${repeat})`, async ({ page }) => {
      await page.goto(`/?repeat=${repeat}`);
      if (mode === "edgeless") {
        await page.evaluate(() => {
          const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
            .__rivtoDemo.editor;
          const board = editor.blocks.getBlocks().find((block) => block.type === "bento")!;
          editor.load({ ...editor.dump(), rootElementIds: [], blocks: [board], elements: [] });
          editor.elements.insertElement({
            type: "block",
            zIndex: 0,
            frame: { x: 20, y: 20, width: 800, height: 600 },
            props: { startBlockId: board.id, endBlockId: board.id },
          });
        });
        await page.locator('[data-editor-mode="edgeless"]').click();
      }
      const expand = page.getByRole("button", { name: "Expand Bento", exact: true }).first();
      await expand.scrollIntoViewIfNeeded();
      await expand.click();
      const modal = page.getByRole("dialog", { name: "Expanded Bento", exact: true });
      const paragraphs = modal.locator('[data-block-type="paragraph"]');
      const count = await paragraphs.count();
      const id = await paragraphs.first().getAttribute("data-block-id");
      const selected = modal.locator(`[data-block-id="${id}"]`);
      const durations: number[] = [];
      for (const key of ["Delete", "Backspace", "Delete", "Backspace"]) {
        await selected.click({ modifiers: ["Meta"] });
        await expect(selected).toHaveAttribute("data-block-selected", "true");
        await expect(modal.locator("[data-rivto-panel]")).toBeFocused();
        await modal.getByRole("button", { name: "Collapse Bento", exact: true }).focus();
        await page.keyboard.press(key);
        await expect(selected).toHaveCount(1);
        await modal.locator("[data-rivto-panel]").focus();
        const started = performance.now();
        await page.keyboard.press(key);
        await expect(selected).toHaveCount(0);
        await expect(paragraphs).toHaveCount(count - 1);
        await expect(modal).toBeVisible();
        durations.push(performance.now() - started);
        await page.keyboard.press("Control+z");
        await expect(selected).toHaveCount(1);
        await expect(paragraphs).toHaveCount(count);
        await selected.click();
      }
      console.log(`modal delete ${mode} repeat=${repeat}: ${JSON.stringify(durations)} ms`);
    });
  }
}
