import { expect, test, type Page, type Locator } from "@playwright/test";
import type { DocumentEditorAPI, EditorBlockInput } from "@chulane/rivto";

/** Borrows a browser page for real pointer gestures over production container layouts. */
class ContainerPointerFixture {
  /**
   * Retains the test-owned page without creating another browser or editor.
   *
   * @param page - Browser page released by Playwright after the test.
   */
  constructor(readonly page: Page) {}

  /**
   * Loads the ordinary demo and replaces only its document fixture.
   *
   * @param blocks - Native block hierarchy inserted through the editor's command manager.
   * @returns Resolves when the replacement blocks are visible in the production Page.
   */
  async load(blocks: EditorBlockInput[]): Promise<void> {
    await this.page.goto("/");
    await expect(
      this.page.locator('[data-journal-document="today"] > .page-surface'),
    ).toBeVisible();
    await this.page.evaluate((input) => {
      const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
        .__rivtoDemo.editor;
      editor.load({ ...editor.dump(), blocks: [], elements: [], rootElementIds: [] });
      for (const block of input) {
        editor.blocks.insertBlock(block);
      }
      editor.history.clear();
    }, blocks);
    await expect(this.page.locator('[data-block-id="source"]')).toBeVisible();
  }

  /**
   * Drags the source handle to the center of an actual mounted target region.
   *
   * @param target - Explicit Page region to hit after activating the pointer.
   * @returns Resolves after pointer release and the synchronous grouped command.
   */
  async move(target: Locator): Promise<void> {
    const source = this.page.locator('[data-block-id="source"]');
    await source.locator(":scope > .rivto-block-row").hover();
    const from = (await source.locator(".block-handle").boundingBox())!;
    const to = (await target.boundingBox())!;
    await this.page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await this.page.mouse.down();
    await this.page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 });
    await expect(this.page.locator(".rivto-block-drag-preview")).toBeVisible();
    const line = this.page.locator(".rivto-block-drop-line");
    if ((await target.getAttribute("data-drop-gap")) !== null) {
      await expect(line).toBeVisible();
      const vertical = await target.evaluate(
        (element) =>
          element.dataset.dropAxis === "horizontal" || element.dataset.dropEdge === "inline",
      );
      const box = (await line.boundingBox())!;
      const item = (await target
        .locator("xpath=ancestor::*[@data-block-item-id][1]")
        .boundingBox())!;
      const before = (await target.getAttribute("data-drop-placement")) === "before";
      const edgeX = before ? item.x : item.x + item.width;
      const edgeY = before ? item.y : item.y + item.height;
      expect(box.x + box.width / 2).toBeCloseTo(vertical ? edgeX : item.x + item.width / 2, 0);
      expect(box.y + box.height / 2).toBeCloseTo(vertical ? item.y + item.height / 2 : edgeY, 0);
      expect(vertical ? box.width : box.height).toBe(4);
    } else {
      await expect(line).not.toBeVisible();
    }
    await this.page.mouse.up();
    await expect(line).toHaveCount(0);
  }
}

for (const type of ["bento", "kanban-column", "columns-column"]) {
  test(`Page pointer inserts into an empty ${type}`, async ({ page }) => {
    const fixture = new ContainerPointerFixture(page);
    let container: EditorBlockInput = { id: "target", type, content: "" };
    if (type !== "bento") {
      container = {
        id: "container",
        type: type === "kanban-column" ? "kanban" : "columns",
        children: [container],
      };
    }
    await fixture.load([{ id: "source", type: "paragraph", content: "Moving text" }, container]);
    const target = page.locator('[data-block-id="target"]');
    await fixture.move(
      target.locator(
        type === "columns-column" ? ":scope > .rivto-block-row" : ":scope > .rivto-block-children",
      ),
    );
    await expect(target.locator('[data-block-id="source"]')).toHaveCount(1);
    await page.keyboard.press("Control+z");
    await expect(
      page.locator(
        '.page-surface > .rivto-virtual-tree > div > [data-virtual-block-id] > [data-block-id="source"]',
      ),
    ).toHaveCount(1);
  });
}

test("Page pointer reorders Bento tiles through their inline boundary", async ({ page }) => {
  const fixture = new ContainerPointerFixture(page);
  await fixture.load([
    {
      id: "board",
      type: "bento",
      children: [
        { id: "source", type: "paragraph", content: "First tile" },
        { id: "second", type: "paragraph", content: "Second tile" },
        { id: "third", type: "paragraph", content: "Third tile" },
      ],
    },
  ]);
  const tile = page
    .locator(".rivto-bento-tile")
    .filter({ has: page.locator('[data-block-id="third"]') });
  await fixture.move(
    tile.locator(':scope > [data-drop-placement="after"][data-drop-edge="inline"]'),
  );
  await expect
    .poll(() =>
      page.evaluate(() =>
        (
          window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
        ).__rivtoDemo.editor.blocks.getChildIds("board"),
      ),
    )
    .toEqual(["second", "third", "source"]);
  await page.keyboard.press("Control+z");
  await expect
    .poll(() =>
      page.evaluate(() =>
        (
          window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
        ).__rivtoDemo.editor.blocks.getChildIds("board"),
      ),
    )
    .toEqual(["source", "second", "third"]);
});

for (const type of ["kanban", "columns"]) {
  test(`Page pointer reorders ${type} lanes through the horizontal gap`, async ({ page }) => {
    const fixture = new ContainerPointerFixture(page);
    const laneType = type === "kanban" ? "kanban-column" : "columns-column";
    await fixture.load([
      {
        id: "board",
        type,
        children: [
          { id: "first", type: laneType, content: "First" },
          { id: "second", type: laneType, content: "Second" },
          { id: "source", type: laneType, content: "Moving lane" },
        ],
      },
    ]);
    const source = page.locator('[data-block-id="source"]');
    await source.locator(":scope > .rivto-block-row").hover();
    await page.locator('[data-block-id="second"]').evaluate((lane) => {
      const host = lane.parentElement!;
      host.scrollLeft += lane.getBoundingClientRect().left - host.getBoundingClientRect().left - 32;
    });
    const from = (await source.locator(".block-handle").first().boundingBox())!;
    const second = (await page.locator('[data-block-id="second"]').boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(second.x - 8, second.y + second.height / 2, { steps: 12 });
    await expect(page.locator(".rivto-block-drag-preview")).toBeVisible();
    await page.mouse.up();
    await expect
      .poll(() =>
        page.evaluate(() =>
          (
            window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
          ).__rivtoDemo.editor.blocks.getChildIds("board"),
        ),
      )
      .toEqual(["first", "source", "second"]);
    await page.keyboard.press("Control+z");
    await expect
      .poll(() =>
        page.evaluate(() =>
          (
            window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
          ).__rivtoDemo.editor.blocks.getChildIds("board"),
        ),
      )
      .toEqual(["first", "second", "source"]);
  });
}

test("Page pointer reorders table cells through their horizontal boundary", async ({ page }) => {
  const fixture = new ContainerPointerFixture(page);
  await fixture.load([
    {
      id: "table",
      type: "table",
      children: [
        {
          id: "row",
          type: "table-row",
          children: [
            { id: "first", type: "table-cell", content: "First" },
            { id: "second", type: "table-cell", content: "Second" },
            { id: "source", type: "table-cell", content: "Moving cell" },
          ],
        },
      ],
    },
  ]);
  const source = page.locator('[data-block-id="source"]');
  await source.locator(":scope > .rivto-block-row").hover();
  const from = (await source.locator(".block-handle").boundingBox())!;
  const second = (await page
    .locator(".rivto-table-cell-item")
    .filter({ has: page.locator('[data-block-id="second"]') })
    .boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(second.x - 4, second.y + second.height / 4, { steps: 12 });
  await expect(page.locator(".rivto-block-drag-preview")).toBeVisible();
  await page.mouse.up();
  await expect
    .poll(() =>
      page.evaluate(() =>
        (
          window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
        ).__rivtoDemo.editor.blocks.getChildIds("row"),
      ),
    )
    .toEqual(["first", "source", "second"]);
  await page.keyboard.press("Control+z");
  await expect
    .poll(() =>
      page.evaluate(() =>
        (
          window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
        ).__rivtoDemo.editor.blocks.getChildIds("row"),
      ),
    )
    .toEqual(["first", "second", "source"]);
  const first = page.locator('[data-block-id="first"]');
  const resize = (await first
    .getByRole("separator", { name: "Resize table column" })
    .boundingBox())!;
  await page.mouse.move(resize.x + resize.width / 2, resize.y + resize.height - 3);
  await page.mouse.down();
  await page.mouse.move(resize.x + resize.width / 2 + 20, resize.y + resize.height - 3);
  await page.mouse.up();
  await expect.poll(() => first.evaluate((cell) => cell.getBoundingClientRect().width)).toBe(200);
  await page.keyboard.press("Control+z");
  await expect.poll(() => first.evaluate((cell) => cell.getBoundingClientRect().width)).toBe(180);
  await first.locator("[data-block-content]").click({ modifiers: ["Control"] });
  await expect(first).toHaveAttribute("data-block-selected", "true");
  await page.mouse.move(resize.x + resize.width / 2, resize.y + resize.height - 3);
  await page.mouse.down();
  await page.mouse.move(resize.x + resize.width / 2 + 30, resize.y + resize.height - 3);
  await expect(first).toHaveAttribute("data-block-selected", "true");
  await expect.poll(() => first.evaluate((cell) => cell.getBoundingClientRect().width)).toBe(210);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect.poll(() => first.evaluate((cell) => cell.getBoundingClientRect().width)).toBe(180);
  await first.getByRole("button", { name: "Add table column to the right" }).click();
  await expect(page.locator('[data-block-id="row"] [data-block-type="table-cell"]')).toHaveCount(4);
  await page.keyboard.press("Control+z");
  await expect(page.locator('[data-block-id="row"] [data-block-type="table-cell"]')).toHaveCount(3);
});
