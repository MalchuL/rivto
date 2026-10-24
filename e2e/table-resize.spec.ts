import { expect, test, type Page } from "@playwright/test";
import type { DocumentEditorAPI } from "@chulane/rivto";

/** Exercises the shared Table resize owner in actual Page and Edgeless occurrences. */
class TableResizeBrowserFixture {
  /**
   * Borrows the Playwright-owned browser page for this fixture's interactions.
   *
   * @param page - Page destroyed by the test runner after its test completes.
   */
  constructor(readonly page: Page) {}

  /**
   * Installs a two-row document and optionally presents it inside an Edgeless card.
   *
   * @param mode - Initial surface used for the same persisted table.
   * @returns Resolves when the first column's separator is mounted and visible.
   */
  async load(mode: "block" | "edgeless"): Promise<void> {
    await this.page.goto("/");
    await this.page.evaluate((mode) => {
      const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
        .__rivtoDemo.editor;
      editor.load({ ...editor.dump(), blocks: [], elements: [], rootElementIds: [] });
      editor.blocks.insertBlock({
        id: "table",
        type: "table",
        children: ["r1", "r2"].map((id) => ({
          id,
          type: "table-row",
          children: ["c1", "c2"].map((column) => ({
            id: `${id}-${column}`,
            type: "table-cell",
            content: `${id} ${column}`,
            props: { tableColumnWidth: 180 },
          })),
        })),
      });
      if (mode === "edgeless") {
        editor.elements.insertElement({
          type: "block",
          zIndex: 0,
          frame: { x: 20, y: 20, width: 800, height: 400 },
          props: { startBlockId: "table", endBlockId: "table" },
        });
      }
      editor.history.clear();
    }, mode);
    if (mode === "edgeless") {
      await this.page.locator('[data-editor-mode="edgeless"]').click();
    }
    await expect(this.page.locator('[data-block-id="r1-c1"]')).toBeVisible();
  }

  /**
   * Begins a real captured pointer resize and leaves the pointer held for cancellation.
   *
   * @param dx - Horizontal movement in viewport CSS pixels.
   * @returns Resolves after the preview movement; the caller releases the pointer.
   */
  async preview(dx: number): Promise<void> {
    const cell = this.page.locator('[data-block-id="r1-c1"]');
    await cell.scrollIntoViewIfNeeded();
    const handle = cell.getByRole("separator", { name: "Resize table column" });
    const rect = (await handle.boundingBox())!;
    const x = rect.x + rect.width / 2;
    const y = rect.y + rect.height - 3;
    await this.page.mouse.move(x, y);
    await this.page.mouse.down();
    await this.page.mouse.move(x + dx, y, { steps: 5 });
  }

  /**
   * Reads current persisted widths without using preview styles as document state.
   *
   * @returns The first column's widths in row order.
   */
  async widths(): Promise<unknown[]> {
    return this.page.evaluate(() => {
      const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
        .__rivtoDemo.editor;
      return ["r1-c1", "r2-c1"].map((id) => editor.blocks.getBlockNode(id)?.props.tableColumnWidth);
    });
  }
}

for (const mode of ["block", "edgeless"] as const) {
  test(`Table resize commits once and cancels Escape in ${mode}`, async ({ page }) => {
    const fixture = new TableResizeBrowserFixture(page);
    await fixture.load(mode);
    await fixture.preview(40);
    expect(await fixture.widths()).toEqual([180, 180]);
    await page.mouse.up();
    await expect.poll(() => fixture.widths()).toEqual([220, 220]);
    await page.keyboard.press("Control+z");
    await expect.poll(() => fixture.widths()).toEqual([180, 180]);
    await fixture.preview(30);
    await page.keyboard.press("Escape");
    await page.mouse.up();
    await expect.poll(() => fixture.widths()).toEqual([180, 180]);
    await expect(page.locator('[data-resizing="true"]')).toHaveCount(0);
    const handle = page
      .locator('[data-block-id="r1-c1"]')
      .getByRole("separator", { name: "Resize table column" });
    await handle.focus();
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => fixture.widths()).toEqual([190, 190]);
    await page.keyboard.press("Control+z");
    await expect.poll(() => fixture.widths()).toEqual([180, 180]);
  });

  test(`Table resize releases its preview when ${mode} detaches`, async ({ page }) => {
    const fixture = new TableResizeBrowserFixture(page);
    await fixture.load(mode);
    await fixture.preview(30);
    const other = mode === "block" ? "edgeless" : "block";
    await page
      .locator(`[data-editor-mode="${other}"]`)
      .evaluate((button: HTMLButtonElement) => button.click());
    await page.mouse.up();
    expect(await fixture.widths()).toEqual([180, 180]);
    await expect(page.locator('[data-resizing="true"]')).toHaveCount(0);
    await page.locator(`[data-editor-mode="${mode}"]`).click();
    await fixture.preview(20);
    await page.mouse.up();
    await expect.poll(() => fixture.widths()).toEqual([200, 200]);
  });
}
