import { expect, test, type Locator, type Page } from "@playwright/test";
import type { DocumentEditorAPI, EditorBlockInput } from "@chulane/rivto";

type ContainerType = "bento" | "kanban" | "columns" | "todo-storage";

/**
 * Builds the same writing subtrees under each container's native hierarchy.
 *
 * @param type - Layout under test; structural lanes remain real persisted blocks.
 * @returns One portable container with stable card identities for browser assertions.
 */
function containerInput(type: ContainerType): EditorBlockInput {
  const cards: EditorBlockInput[] = [
    {
      id: "layout-card-one",
      type: "paragraph",
      content: "First card",
      children: [{ type: "paragraph", content: "Nested child" }],
    },
    {
      id: "layout-card-two",
      type: "paragraph",
      content: "Second card",
      listProps: { backgroundColor: "red" },
    },
  ];
  if (type === "kanban" || type === "columns") {
    return {
      id: "layout-board",
      type,
      children: cards.map((card, index) => ({
        id: `layout-lane-${index}`,
        type: `${type}-column`,
        content: type === "kanban" ? `Lane ${index}` : "",
        children: [card],
      })),
    };
  }
  if (type === "todo-storage") {
    cards.push({
      id: "priority-task",
      type: "todo-item",
      content: "Priority task",
      props: { priority: 1 },
    });
  }
  return { id: "layout-board", type, children: cards };
}

/**
 * Reads a rendered screenshot pixel in an opaque or blank part of a child surface.
 *
 * Browser canvas decodes the screenshot so the assertion covers actual composited
 * paint, including opaque container backgrounds, rather than only shell CSS values.
 *
 * @param page - Test-owned browser page used to decode the image.
 * @param board - Selected parent whose screenshot contains the sampled child.
 * @param sample - Child surface with empty space near its right edge.
 * @returns RGBA bytes for the visible pixel eight pixels below that surface's top.
 */
async function selectionPixel(page: Page, board: Locator, sample: Locator): Promise<number[]> {
  const outer = (await board.boundingBox())!;
  const inner = (await sample.boundingBox())!;
  const png = await board.screenshot({ animations: "disabled" });
  return page.evaluate(
    async ({ source, x, y }) => {
      const image = new Image();
      image.src = source;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d")!;
      context.drawImage(image, 0, 0);
      return Array.from(context.getImageData(x, y, 1, 1).data);
    },
    {
      source: `data:image/png;base64,${png.toString("base64")}`,
      x: Math.round(inner.x + inner.width - 20 - outer.x),
      y: Math.round(inner.y + 8 - outer.y),
    },
  );
}

/**
 * Loads one native container hierarchy into the main demo and activates its surface.
 *
 * @param page - Browser page owning the fixture and editor instance.
 * @param type - Container whose native layout is exercised.
 * @param mode - Surface in which pointer selection is tested.
 * @returns Resolves after the surface mode control has been clicked.
 */
async function loadContainer(page: Page, type: ContainerType, mode: "block" | "edgeless") {
  await page.setViewportSize({ width: 1400, height: 1000 });
  await page.goto("/");
  await page.locator('[data-journal-document="today"] > .page-surface').waitFor();
  await page.evaluate(
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
          props: { startBlockId: input.id, endBlockId: input.id },
        });
      }
    },
    { input: containerInput(type), mode },
  );
  await page.locator(`[data-editor-mode="${mode}"]`).click();
}

for (const type of ["bento", "kanban", "columns", "todo-storage"] as const) {
  for (const mode of ["block", "edgeless"] as const) {
    test(`${type} layout paints one selected subtree in ${mode}`, async ({ page }) => {
      await loadContainer(page, type, mode);
      const board = page.locator('[data-block-id="layout-board"]');
      const child = page.locator('[data-block-id="layout-card-one"]');
      const content = child.locator(":scope > .rivto-block-row [data-block-content]");
      const colored = page.locator('[data-block-id="layout-card-two"] > .rivto-block-row');
      const before = await selectionPixel(page, board, colored);
      const foreground = await content.evaluate((element) => getComputedStyle(element).color);
      await content.click({ modifiers: ["Control"] });
      const row = (await board.locator(":scope > .rivto-block-row").boundingBox())!;
      await page.keyboard.down("Control");
      await page.mouse.click(row.x + 10, row.y + 4);
      await page.keyboard.up("Control");
      await expect(board).toHaveAttribute("data-block-selected", "true");
      await expect(child).toHaveAttribute("data-block-selected", "true");
      await expect(child).toHaveCSS("outline-style", "none");
      await page.mouse.move(0, 0);
      const sample =
        type === "kanban"
          ? board.locator(".rivto-kanban-add-card").first()
          : child.locator(":scope > .rivto-block-row");
      const pixel = await selectionPixel(page, board, sample);
      expect(pixel).toEqual([229, 223, 255, 255]);
      expect(await selectionPixel(page, board, colored)).toEqual([229, 223, 255, 255]);
      if (type === "todo-storage") {
        expect(await selectionPixel(page, board, board.locator(".rivto-todo-item"))).toEqual([
          229, 223, 255, 255,
        ]);
      }
      await expect(content).toHaveCSS("color", foreground);
      await content.click();
      await expect(board).not.toHaveAttribute("data-block-selected", "true");
      await expect(content).toBeFocused();
      await page.mouse.move(0, 0);
      expect(await selectionPixel(page, board, colored)).toEqual(before);
    });
  }
}
