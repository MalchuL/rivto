import { expect, test, type Locator, type Page } from "@playwright/test";
import type { DocumentEditorAPI, EditorBlockInput } from "@chulane/rivto";

type ContainerType = "bento" | "kanban" | "columns" | "todo-storage" | "table";

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
 * Every layout receives the same two writing subtrees. Tables wrap them in a cell,
 * column layouts place one in each lane, and task storage adds a prioritized task.
 *
 * @param page - Browser page owning the fixture and editor instance.
 * @param type - Container whose native layout is exercised.
 * @param mode - Surface in which pointer selection is tested.
 * @param card - Optional Edgeless card appearance; omit to use the normal single-root default.
 * @param card.borderless - Set to false for tests that click controls in the outer gutter.
 * @returns Resolves after the surface mode control has been clicked.
 */
async function loadContainer(
  page: Page,
  type: ContainerType,
  mode: "block" | "edgeless",
  card: { borderless?: boolean } = {},
) {
  // Keep card identities stable across layouts. Only their structural parents differ.
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
  if (type === "todo-storage") {
    cards.push({
      id: "priority-task",
      type: "todo-item",
      content: "Priority task",
      props: { priority: 1 },
    });
  }
  let children = cards;
  if (type === "table") {
    children = [{ type: "table-row", children: [{ type: "table-cell", children: cards }] }];
  } else if (type === "kanban" || type === "columns") {
    children = cards.map((card, index) => ({
      id: `layout-lane-${index}`,
      type: `${type}-column`,
      content: type === "kanban" ? `Lane ${index}` : "",
      children: [card],
    }));
  }
  await page.setViewportSize({ width: 1400, height: 1000 });
  await page.goto("/?test_features=1");
  await page.locator('[data-journal-document="today"] > .page-surface').waitFor();
  await page.evaluate(
    ({ input, mode, card }) => {
      const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
        .__rivtoDemo.editor;
      editor.load({ ...editor.dump(), blocks: [], elements: [], rootElementIds: [] });
      editor.blocks.insertBlock(input);
      if (mode === "edgeless") {
        editor.elements.insertElement({
          type: "block",
          zIndex: 0,
          frame: { x: 20, y: 20, width: 950, height: 600 },
          props: { startBlockId: input.id, endBlockId: input.id, ...card },
        });
      }
    },
    { input: { id: "layout-board", type, children }, mode, card },
  );
  await page.locator(`[data-editor-mode="${mode}"]`).click();
}

test("container opacity edits apply to a chosen color", async ({ page }) => {
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
  await expect(opacity).toHaveAttribute("data-disabled", "");
  await page.getByLabel("Custom background color").fill("#123456");
  await expect(opacity).toHaveAttribute("aria-valuenow", "100");
  await opacity.focus();
  await page.keyboard.press("Home");
  await expect(board).toHaveAttribute("data-block-background", "#12345600");
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
    .toBe("#12345600");
  await page.keyboard.press("End");
  await expect(board).toHaveAttribute("data-block-background", "#123456");
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
      if (type === "bento" || type === "kanban" || type === "todo-storage") {
        await expect(board).not.toHaveAttribute("data-block-background", /.+/);
        await board.evaluate((element) => {
          element.style.setProperty("--rivto-secondary", "#242535");
          element.style.setProperty("--rivto-background", "#161722");
          element.style.setProperty("--rivto-foreground", "#eeeeff");
        });
        await expect(surface).toHaveCSS("background-color", "rgb(36, 37, 53)");
        if (type === "todo-storage") {
          const task = board.locator(".rivto-todo-item");
          const tint = await task.evaluate((element) => getComputedStyle(element).backgroundColor);
          await board.evaluate((element) =>
            element.style.setProperty("--rivto-background", "#fff"),
          );
          await expect(task).not.toHaveCSS("background-color", tint);
          await expect(task.locator(".rivto-todo-name")).toHaveCSS("color", "rgb(238, 238, 255)");
        } else {
          const childSurface =
            type === "bento"
              ? ".rivto-bento-tile > .rivto-block-drop-wrapper-content"
              : ".rivto-kanban-card";
          await expect(board.locator(childSurface).first()).toHaveCSS(
            "background-color",
            "rgb(22, 23, 34)",
          );
        }
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
      if (type === "todo-storage") {
        const header = board.locator(".rivto-todo-storage-header");
        await expect(header).toHaveCSS("background-color", "rgba(18, 52, 86, 0.5)");
        await header.evaluate((element) => element.style.setProperty("--rivto-card", "#ddeeff"));
        const controls = header.locator("input, .rivto-todo-storage-menu-trigger");
        await expect(controls).toHaveCount(3);
        for (const control of await controls.all()) {
          await expect(control).toHaveCSS("background-color", "rgb(221, 238, 255)");
        }
        await page.evaluate(() => {
          const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
            .__rivtoDemo.editor;
          editor.blocks.updateBlock("layout-board", { listProps: { collapsed: true } });
        });
        await expect(header).toHaveCSS("background-color", "rgba(18, 52, 86, 0.5)");
        await expect(header.locator(".rivto-todo-storage-summary")).toHaveCSS(
          "background-color",
          "rgba(0, 0, 0, 0)",
        );
        await page.evaluate(() => {
          const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
            .__rivtoDemo.editor;
          editor.blocks.updateBlock("layout-board", { listProps: { collapsed: false } });
        });
      }
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
    await loadContainer(page, "columns", mode, { borderless: false });
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
    test(`${type} palette restores the theme default in ${mode}`, async ({ page }) => {
      await loadContainer(page, type, mode, { borderless: false });
      await page.evaluate(() => {
        const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
          .__rivtoDemo.editor;
        editor.blocks.updateBlock("layout-board", { listProps: { collapsed: true } });
      });
      const board = page.locator('[data-block-id="layout-board"]').first();
      const row = board.locator(":scope > .rivto-block-row");
      await row.hover();
      await row
        .locator(":scope > :is(.rivto-slot, .rivto-block-slot) > .block-handle")
        .click({ button: "right" });
      const picker = page.getByLabel("Custom background color");
      const custom = page.locator(".block-color-custom");
      const themeDefault = page.getByRole("button", { name: "Theme default" });
      await expect(themeDefault).toHaveAttribute("aria-pressed", "true");
      await expect(custom).not.toHaveAttribute("data-selected", "true");
      await expect(page.locator(".block-color-custom-palette")).toBeVisible();
      await page.getByRole("button", { name: "red", exact: true }).click();
      await expect(picker).toHaveValue("#d1d5db");
      await expect(custom).not.toHaveAttribute("data-selected", "true");
      await expect(themeDefault).toHaveAttribute("aria-pressed", "false");
      await themeDefault.click();
      await expect(themeDefault).toHaveAttribute("aria-pressed", "true");
      await expect(board).not.toHaveAttribute("data-block-background", /.+/);
    });
  }
}
