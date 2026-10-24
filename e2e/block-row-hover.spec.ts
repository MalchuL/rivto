import { expect, test, type Page } from "@playwright/test";
import type { DocumentEditorAPI, EditorBlockInput } from "@chulane/rivto";

type Layout = "columns" | "kanban" | "bento" | "table";

/** Uses the same ordinary subtree in four different production child layouts. */
class HoverLayoutFixture {
  /**
   * Borrows the Playwright page without creating editor or browser resources.
   *
   * @param page - Test-owned browser page.
   */
  constructor(readonly page: Page) {}

  /**
   * Loads two adjacent layout items, retaining default demo virtualization settings.
   *
   * @param layout - Native layout arranging the same nested writing blocks.
   * @param mode - Surface whose native pointer path is tested.
   * @returns Resolves after the left nested row is mounted.
   */
  async load(layout: Layout, mode: "block" | "edgeless"): Promise<void> {
    await this.page.setViewportSize({ width: 1400, height: 1000 });
    await this.page.goto("/");
    await this.page.locator('[data-journal-document="today"] > .page-surface').waitFor();
    await this.page.evaluate(
      ({ input, mode }) => {
        const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
          .__rivtoDemo.editor;
        editor.load({ ...editor.dump(), blocks: [], elements: [], rootElementIds: [] });
        editor.blocks.insertBlock(input);
        if (mode === "edgeless") {
          editor.elements.insertElement({
            type: "block",
            zIndex: 0,
            frame: { x: 20, y: 20, width: 950, height: 600 },
            props: { startBlockId: "board", endBlockId: "board" },
          });
        }
      },
      { input: this.input(layout), mode },
    );
    if (mode === "edgeless") {
      await this.page.locator('[data-editor-mode="edgeless"]').click();
    }
    await expect(this.page.locator('[data-block-id="child"]')).toBeVisible();
  }

  /**
   * Hovers indentation whitespace, enters the actual handle, and crosses into a neighbor.
   *
   * @returns Both the row marker and visible/native handle ownership remain local.
   */
  async check(): Promise<void> {
    const child = this.page.locator('[data-block-id="child"] > .rivto-block-row');
    const parent = (await this.page
      .locator('[data-block-id="parent"] > .rivto-block-row')
      .boundingBox())!;
    const row = (await child.boundingBox())!;
    const handle = child.locator(".block-handle");
    await this.page.mouse.move(parent.x + 2, row.y + row.height / 2);
    await expect(handle).toHaveCSS("opacity", "1");
    await expect(
      this.page.locator('[data-block-id="board"] > .rivto-block-row .block-handle'),
    ).toHaveCSS("opacity", "0");
    await handle.hover();
    const box = (await handle.boundingBox())!;
    expect(
      await this.page.evaluate(
        ({ x, y }) => !!document.elementFromPoint(x, y)?.closest(".block-handle"),
        { x: box.x + box.width / 2, y: box.y + box.height / 2 },
      ),
    ).toBe(true);
    const neighbor = (await this.page
      .locator('[data-block-id="neighbor-child"] > .rivto-block-row')
      .boundingBox())!;
    await this.page.mouse.move(neighbor.x + neighbor.width - 3, neighbor.y + neighbor.height / 2);
    await expect(handle).toHaveCSS("opacity", "0");
    await expect(
      this.page.locator('[data-block-id="neighbor-child"] > .rivto-block-row .block-handle'),
    ).toHaveCSS("opacity", "1");
  }

  /**
   * Wraps ordinary subtrees in native layout shells without adding another tree renderer.
   *
   * @param layout - Container whose existing layout is used for the fixture.
   * @returns Portable hierarchy with stable test identities.
   */
  private input(layout: Layout): EditorBlockInput {
    const children: EditorBlockInput[] = [
      {
        id: "parent",
        type: "paragraph",
        content: "Parent",
        children: [{ id: "child", type: "paragraph", content: "Child" }],
      },
      {
        id: "neighbor",
        type: "paragraph",
        content: "Neighbor",
        children: [{ id: "neighbor-child", type: "paragraph", content: "Other child" }],
      },
    ];
    if (layout === "columns" || layout === "kanban") {
      return {
        id: "board",
        type: layout,
        children: children.map((block) => ({
          type: `${layout}-column`,
          content: layout === "kanban" ? "Lane" : "",
          children: [block],
        })),
      };
    }
    if (layout === "table") {
      return {
        id: "board",
        type: layout,
        children: [
          {
            type: "table-row",
            children: children.map((block) => ({ type: "table-cell", children: [block] })),
          },
        ],
      };
    }
    return {
      id: "board",
      type: layout,
      children: children.map((block) => ({ ...block, props: { bentoWidth: 400 } })),
    };
  }
}

for (const layout of ["columns", "kanban", "bento", "table"] as const) {
  for (const mode of ["block", "edgeless"] as const) {
    test(`nested row hover stays inside ${layout} in ${mode}`, async ({ page }) => {
      const fixture = new HoverLayoutFixture(page);
      await fixture.load(layout, mode);
      await fixture.check();
    });
  }
}

test("CSS grid bounds hover without drag-axis metadata", async ({ page }) => {
  const fixture = new HoverLayoutFixture(page);
  await fixture.load("bento", "block");
  await page.locator('[data-block-id="board"] > .rivto-block-children').evaluate((element) => {
    element.style.display = "grid";
    element.style.gridTemplateColumns = "repeat(2, minmax(0, 1fr))";
    element.removeAttribute("data-block-drop-axis");
  });
  await fixture.check();
});

for (const mode of ["block", "edgeless"] as const) {
  test(`placement item padding reveals its own handle in ${mode}`, async ({ page }) => {
    const fixture = new HoverLayoutFixture(page);
    await fixture.load("bento", mode);
    const item = page.locator('[data-block-item-id="parent"]');
    const parent = page.locator('[data-block-id="parent"] > .rivto-block-row');
    const child = page.locator('[data-block-id="child"] > .rivto-block-row');
    const handle = parent.locator(".block-handle");
    const box = (await item.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height - 2);
    await expect(handle).toHaveCSS("opacity", "1");
    await expect(child.locator(".block-handle")).toHaveCSS("opacity", "0");
    await handle.hover();
    await expect(parent).toHaveAttribute("data-block-row-hover", "");
    await child.locator("[data-block-content]").hover();
    await expect(handle).toHaveCSS("opacity", "0");
    await expect(child.locator(".block-handle")).toHaveCSS("opacity", "1");
    await page.mouse.move(0, 0);
    await expect(child.locator(".block-handle")).toHaveCSS("opacity", "0");
  });
}

for (const layout of ["columns", "kanban", "bento", "table"] as const) {
  for (const mode of ["block", "edgeless"] as const) {
    test(`cold handle entry works inside ${layout} in ${mode}`, async ({ page }) => {
      const fixture = new HoverLayoutFixture(page);
      await fixture.load(layout, mode);
      const row = page.locator('[data-block-id="parent"] > .rivto-block-row');
      const handle = row.locator(".block-handle");
      await page.mouse.move(0, 0);
      await expect(handle).toHaveCSS("opacity", "0");
      const box = (await handle.boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await expect(handle).toHaveCSS("opacity", "1");
      await expect(row).toHaveAttribute("data-block-row-hover", "");
    });
  }
}
