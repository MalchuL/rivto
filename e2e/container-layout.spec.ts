import { expect, test, type Locator, type Page } from "@playwright/test";
import type { DocumentEditorAPI, EditorBlockInput } from "@chulane/rivto";

type ContainerType = "bento" | "kanban" | "columns" | "todo-storage" | "table";

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
      listProps: { style: { background: { color: "#fcdddd" } } },
    },
  ];
  if (type === "table") {
    return {
      id: "layout-board",
      type,
      children: [{ type: "table-row", children: [{ type: "table-cell", children: cards }] }],
    };
  }
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
  await page.goto("/?test_features=1");
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

test("default container color supports the opacity slider", async ({ page }) => {
  await loadContainer(page, "bento", "block");
  await page.evaluate(() => {
    const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }).__rivtoDemo
      .editor;
    editor.blocks.updateBlock("layout-board", { listProps: { collapsed: true } });
  });
  const board = page.locator('[data-block-id="layout-board"]').first();
  const row = board.locator(":scope > .rivto-block-row");
  await row.hover();
  await row
    .locator(":scope > :is(.rivto-slot, .rivto-block-slot) > .block-handle")
    .click({ button: "right" });
  const opacity = page.getByRole("slider", { name: "Background opacity" });
  await expect(opacity).toHaveAttribute("aria-valuenow", "100");
  await opacity.focus();
  await page.keyboard.press("Home");
  await expect(board).toHaveAttribute("data-block-background", "#eceef600");
  await expect
    .poll(() =>
      page.evaluate(() => {
        const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
          .__rivtoDemo.editor;
        return (
          editor.blocks.getBlockNode("layout-board")?.listProps.style as
            { background?: { color?: string } } | undefined
        )?.background?.color;
      }),
    )
    .toBe("#eceef600");
  await page.keyboard.press("End");
  await expect(board).toHaveAttribute("data-block-background", "#eceef6");
});

for (const type of ["bento", "kanban", "columns", "todo-storage", "table"] as const) {
  for (const mode of ["block", "edgeless"] as const) {
    test(`${type} renders its own background in ${mode}`, async ({ page }) => {
      await loadContainer(page, type, mode);
      const board = page.locator('[data-block-id="layout-board"]').first();
      let surface = board;
      if (type === "bento") {
        surface = board.locator(":scope > .rivto-bento-tiles");
      } else if (type === "kanban") {
        surface = board.locator(":scope > .rivto-kanban-columns");
      } else if (type === "todo-storage") {
        surface = board.locator(":scope > .rivto-todo-storage-children");
      }
      const original = await surface.evaluate(
        (element) => getComputedStyle(element).backgroundColor,
      );
      await page.evaluate(() => {
        const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
          .__rivtoDemo.editor;
        editor.blocks.updateBlock("layout-board", {
          listProps: { style: { background: { color: "#123456" } } },
        });
      });
      await expect(surface).toHaveCSS("background-color", "rgb(18, 52, 86)");
      await page.evaluate(() => {
        const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
          .__rivtoDemo.editor;
        editor.blocks.updateBlock("layout-board", {
          listProps: { style: { background: { color: "#12345680" } } },
        });
      });
      await expect(surface).toHaveCSS("background-color", "rgba(18, 52, 86, 0.5)");
      if (type === "bento" || type === "kanban" || type === "todo-storage") {
        await expect(board).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
      }
      await page.evaluate(() => {
        const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
          .__rivtoDemo.editor;
        editor.blocks.updateBlock("layout-board", {
          listProps: { style: { background: { color: "#00000000" } } },
        });
      });
      await expect(surface).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");

      if (type === "kanban" || type === "columns") {
        const lane = page.locator('[data-block-id="layout-lane-0"]').first();
        await page.evaluate(() => {
          const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
            .__rivtoDemo.editor;
          editor.blocks.updateBlock("layout-lane-0", {
            listProps: { style: { background: { color: "#654321" } } },
          });
        });
        await expect(lane).toHaveCSS("background-color", "rgb(101, 67, 33)");
      }

      await page.evaluate(() => {
        const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
          .__rivtoDemo.editor;
        editor.blocks.deleteListProps("layout-board", ["style"]);
      });
      await expect(surface).toHaveCSS("background-color", original);
    });
  }
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
      expect(pixel).toEqual([222, 217, 247, 255]);
      expect(await selectionPixel(page, board, colored)).toEqual([222, 217, 247, 255]);
      if (type === "todo-storage") {
        expect(await selectionPixel(page, board, board.locator(".rivto-todo-item"))).toEqual([
          222, 217, 247, 255,
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

for (const type of ["bento", "kanban"] as const) {
  for (const mode of ["block", "edgeless"] as const) {
    test(`${type} keeps card and descendant controls inside their rows in ${mode}`, async ({
      page,
    }) => {
      await loadContainer(page, type, mode);
      const card = page.locator('[data-block-id="layout-card-one"]');
      const row = card.locator(":scope > .rivto-block-row");
      await expect(row).toHaveAttribute("data-controls-placement", "inside");
      const nested = card.locator(".rivto-block-children .rivto-block-row").first();
      await expect(nested).toHaveAttribute("data-controls-placement", "inside");
      const content = row.locator(".rivto-block-content");
      const initial = (await content.boundingBox())!;
      await row.hover();
      const handle = row.locator(".block-handle");
      await expect(handle).toHaveCSS("opacity", "1");
      const bounds = (await card.boundingBox())!;
      for (const control of [
        handle,
        row.getByRole("button", { name: "Collapse block: First card", exact: true }),
      ]) {
        const box = (await control.boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(bounds.x);
        expect(box.x + box.width).toBeLessThanOrEqual(initial.x);
        expect(box.y + box.height).toBeLessThanOrEqual(bounds.y + bounds.height);
      }
      expect((await content.boundingBox())!.x).toBe(initial.x);
      await row.getByRole("button", { name: "Collapse block: First card", exact: true }).click();
      await expect(nested).toHaveCount(0);
      await row.getByRole("button", { name: "Expand block: First card", exact: true }).click();
      await expect(nested).toBeVisible();
      await row.hover();
      await handle.click({ button: "right" });
      await expect(page.getByRole("menu")).toBeVisible();
    });
  }
}

for (const mode of ["block", "edgeless"] as const) {
  test(`Columns hides expanded headers and restores collapsed controls in ${mode}`, async ({
    page,
  }) => {
    await loadContainer(page, "columns", mode);
    const board = page.locator('[data-block-id="layout-board"]');
    const boardRow = board.locator(":scope > .rivto-block-row");
    const lane = page.locator('[data-block-id="layout-lane-0"]');
    const row = lane.locator(":scope > .rivto-block-row");
    const child = page.locator('[data-block-id="layout-card-one"]');
    await expect(boardRow.locator(".rivto-columns")).toHaveText("");
    await expect(row).toHaveCount(0);
    const childRow = child.locator(":scope > .rivto-block-row");
    await childRow.hover();
    await childRow.locator(".block-handle").click({ button: "right" });
    await expect(page.getByRole("menu")).toBeVisible();
    await page.keyboard.press("Escape");
    await boardRow.getByRole("button", { name: "Collapse block: columns", exact: true }).click();
    await expect(boardRow.getByRole("textbox", { name: "Columns name" })).toHaveAttribute(
      "data-placeholder",
      "Columns",
    );
    await expect(boardRow.locator(".rivto-columns")).toHaveText("2 columns");
    await expect(child).toHaveCount(0);
    await boardRow.getByRole("button", { name: "Expand block: columns", exact: true }).click();
    await expect(child).toBeVisible();
    await expect(boardRow.locator(".rivto-columns")).toHaveText("");
    // A saved collapsed lane must remain expandable even though expanded lanes have no row.
    await page.evaluate(() => {
      const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
        .__rivtoDemo.editor;
      editor.blocks.updateBlock("layout-lane-0", { listProps: { collapsed: true } });
    });
    await expect(row).toContainText("1 blocks");
    await expect(child).toHaveCount(0);
    await row.getByRole("button", { name: "Expand block: columns-column", exact: true }).click();
    await expect(child).toBeVisible();
    await expect(row).toHaveCount(0);
  });
}

for (const type of ["bento", "kanban", "columns", "todo-storage"] as const) {
  for (const mode of ["block", "edgeless"] as const) {
    test(`${type} retains compact child spacing in ${mode}`, async ({ page }) => {
      await loadContainer(page, type, mode);
      const card = page.locator('[data-block-id="layout-card-one"]');
      const nested = card.locator(".rivto-block-children .rivto-block-row").first();
      await expect(nested).toHaveCSS("padding", "2px 8px");
      if (type === "bento") {
        await expect(card).toHaveCSS("padding", "12px");
      } else if (type === "kanban") {
        await expect(card).toHaveCSS("padding", "12px 10px");
      } else {
        await expect(card.locator(":scope > .rivto-block-row")).toHaveCSS("padding", "2px 8px");
      }
      await expect(card.locator("[data-block-id]")).toHaveCount(1);
    });
  }
}

for (const type of ["bento", "kanban", "todo-storage"] as const) {
  for (const mode of ["block", "edgeless"] as const) {
    test(`${type} palette reflects the saved default background in ${mode}`, async ({ page }) => {
      await loadContainer(page, type, mode);
      await page.evaluate(() => {
        const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
          .__rivtoDemo.editor;
        editor.blocks.updateBlock("layout-board", { listProps: { collapsed: true } });
      });
      const board = page.locator('[data-block-id="layout-board"]').first();
      await board.evaluate(
        (element, { blockType, surface }) => {
          const tokens = {
            bento: "--rivto-bento-background",
            kanban: "--rivto-kanban-board-background",
            "todo-storage": "--rivto-todo-storage-background",
          };
          element.style.setProperty(
            tokens[blockType],
            surface === "block" ? "#a1b2c3" : "rgb(161, 178, 195)",
          );
        },
        { blockType: type, surface: mode },
      );
      const row = board.locator(":scope > .rivto-block-row");
      await row.hover();
      await row
        .locator(":scope > :is(.rivto-slot, .rivto-block-slot) > .block-handle")
        .click({ button: "right" });
      const picker = page.getByLabel("Custom background color");
      const custom = page.locator(".block-color-custom");
      await expect(picker).toHaveValue("#eceef6");
      await expect(custom).toHaveAttribute("data-selected", "true");
      await expect(page.locator(".block-color-custom-palette")).toBeVisible();
      await page.getByRole("button", { name: "red", exact: true }).click();
      await expect(picker).toHaveValue("#d1d5db");
      await expect(custom).not.toHaveAttribute("data-selected", "true");
    });
  }
}
