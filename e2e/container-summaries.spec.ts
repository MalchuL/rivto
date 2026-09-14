/** Browser regression for contentless container headers and collapsed summaries. */
import { expect, test } from "@playwright/test";

const ROW_CLASS = "page-block-row";
const CONTENT_FLOW_CLASS = "rivto-block-content-flow";
const PAGE_SURFACE_CLASS = "page-surface";

test("slash converts the current root to each structural container", async ({ page }) => {
  for (const [query, command, type] of [
    ["bento", "block.bento.insert", "bento"],
    ["table", "block.table.insert", "table"],
    ["kanban", "block.kanban.insert", "kanban"],
    ["columns", "block.columns.insert", "columns"],
  ] as const) {
    await page.goto("/");
    const content = page.locator(
      `.${PAGE_SURFACE_CLASS} > [data-block-id] > .${ROW_CLASS} [data-block-content]`,
    ).first();
    const blockId = await content.locator("xpath=ancestor::*[@data-block-id][1]").getAttribute("data-block-id");
    if (!blockId) throw new Error("Expected an editable root block");
    const before = await page.evaluate(() => {
      const { editor } = (window as unknown as {
        __rivtoDemo: { editor: import("@chulane/rivto-react").ReactEditor };
      }).__rivtoDemo.editor;
      return editor.blocks.getBlocks().map((block) => block.id);
    });
    const block = page.locator(`[data-block-id="${blockId}"]`);
    await content.click();
    await page.keyboard.press("End");
    await page.keyboard.type(`/${query}`);
    await page.locator(`[data-slash-command="${command}"]`).click();
    await expect(block).toHaveAttribute("data-block-type", type);
    await expect.poll(() => page.evaluate(() => {
      const { editor } = (window as unknown as {
        __rivtoDemo: { editor: import("@chulane/rivto-react").ReactEditor };
      }).__rivtoDemo.editor;
      return editor.blocks.getBlocks().map((candidate) => candidate.id);
    })).toEqual(before);
    await page.evaluate(() => {
      const { editor } = (window as unknown as {
        __rivtoDemo: { editor: import("@chulane/rivto-react").ReactEditor };
      }).__rivtoDemo.editor;
      editor.history.undo();
    });
    await expect(block).toHaveAttribute("data-block-type", "paragraph");
    await expect(block.locator("[data-block-content]")).toContainText(`/${query}`);
  }
});

test("renders aligned contentless container summaries from reactive block snapshots", async ({ page }) => {
  await page.goto("/");

  const containers = [
    { type: "bento", name: "Bento", stats: "3 tiles" },
    { type: "table", name: "Table", stats: "3 × 3" },
    { type: "kanban", name: "Kanban", stats: "3 columns · 1 card" },
    { type: "columns", name: "Columns", stats: "2 columns" },
  ] as const;
  const referenceToggle = page.locator(`[data-block-type="paragraph"] > .${ROW_CLASS} [data-collapse-toggle]`).first();
  const referenceToggleBox = (await referenceToggle.boundingBox())!;

  for (const { type, name, stats } of containers) {
    const block = page.locator(`[data-block-type="${type}"]`).first();
    const row = block.locator(`:scope > .${ROW_CLASS}`);
    const summary = row.locator(`:scope > .${CONTENT_FLOW_CLASS} > [data-block-selection-anchor]`);
    const toggle = row.locator("[data-collapse-toggle]");
    await block.scrollIntoViewIfNeeded();
    await expect(summary).not.toHaveAttribute("contenteditable");
    await expect(summary).toHaveCSS("height", "0px");
    await expect(row).toHaveCSS("height", "24px");

    const blockBox = (await block.boundingBox())!;
    const childrenBox = (await block.locator(":scope > .page-block-children").boundingBox())!;
    const topInset = childrenBox.y - blockBox.y;
    const bottomInset = blockBox.y + blockBox.height - childrenBox.y - childrenBox.height;
    expect(topInset, `${type} top inset`).toBeCloseTo(bottomInset, 0);
    if (type === "table" || type === "kanban" || type === "columns") {
      expect(topInset, `${type} outer inset`).toBeCloseTo(2, 0);
    }

    const toggleBox = (await toggle.boundingBox())!;
    expect(toggleBox.x, `${type} collapse offset`).toBeCloseTo(referenceToggleBox.x, 0);

    await toggle.click();
    await expect(row.getByText(name, { exact: true })).toBeVisible();
    await expect(row.getByText(stats, { exact: true })).toBeVisible();
  }

  await expect.poll(() => page.evaluate(() => {
    const { editor } = (window as unknown as {
      __rivtoDemo: { editor: import("@chulane/rivto-react").ReactEditor };
    }).__rivtoDemo.editor;
    return ["bento", "table", "kanban", "columns"].map((type) => (
      editor.blocks.getBlocks().find((block) => block.type === type)?.content
    ));
  })).toEqual(["", "", "", ""]);

  await page.evaluate(() => {
    const { editor } = (window as unknown as {
      __rivtoDemo: { editor: import("@chulane/rivto-react").ReactEditor };
    }).__rivtoDemo.editor;
    const bento = editor.blocks.getBlocks().find((block) => block.type === "bento")!;
    const tile = editor.blocks.insertBlock({ type: "paragraph", content: "Fourth tile" });
    editor.blocks.moveBlocks([tile], bento.id, "inside");
  });
  await expect(page.locator('[data-block-type="bento"]').first().getByText("4 tiles", { exact: true })).toBeVisible();

  await page.evaluate(() => {
    const { editor } = (window as unknown as {
      __rivtoDemo: { editor: import("@chulane/rivto-react").ReactEditor };
    }).__rivtoDemo.editor;
    for (const type of ["bento", "kanban", "table"]) {
      const block = editor.blocks.getBlocks().find((candidate) => candidate.type === type)!;
      editor.blocks.updateBlock(block.id, { listProps: { collapsed: false } });
      editor.blocks.removeBlocks(block.children.map((child) => child.id));
    }
  });
  for (const [type, minimumHeight] of [["bento", 128], ["kanban", 192], ["table", 96]] as const) {
    const block = page.locator(`[data-block-type="${type}"]`).first();
    await expect(block.locator(":scope > .page-block-children")).toHaveCount(0);
    expect((await block.boundingBox())!.height, `${type} empty height`).toBeGreaterThanOrEqual(minimumHeight);
  }
});
