import { returnToDocumentAfterNativeHandleClick } from "./drag-handle-navigation";
import { blockDropRegion, type DropRegionBox } from "./drop-regions";
import { expect, test, type Page } from "@playwright/test";
import type { DocumentEditorAPI } from "@chulane/rivto";

type Container = "outline" | "columns" | "kanban" | "bento" | "table" | "todo-storage";

for (const mode of ["block", "edgeless"] as const) {
  for (const type of ["root", "outline", "columns", "kanban", "todo-storage"] as const) {
    test(`terminal nesting keeps its depth above and below the line in ${type}, ${mode}`, async ({
      page,
    }) => {
      const parent = await load(page, type === "root" ? "outline" : type, mode);
      if (type === "root") {
        await page.evaluate(() => {
          const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
            .__rivtoDemo.editor;
          editor.blocks.moveBlocks(["last"], "board", "after");
          editor.history.clear();
        });
      } else {
        const host = page.locator(`[data-block-id="${parent}"] > .rivto-block-children`);
        await host.evaluate((element) => {
          element.style.paddingBlockEnd = "32px";
        });
      }
      const last = (await page.locator('[data-block-id="last"]').boundingBox())!;
      await startDrag(page);
      for (const offset of [-2, -0.25, 0.25, 2, 4, 2, -2, 4]) {
        await page.mouse.move(last.x + last.width - 2, last.y + last.height + offset);
        const line = await expectBoundaryLine(page);
        expect(line.x).toBeGreaterThan(last.x + 8);
        expect(line.y + line.height / 2).toBeCloseTo(last.y + last.height, 1);
      }
      await page.mouse.up();
      await expect.poll(() => readChildIds(page, "last")).toEqual(["source"]);
      await page.keyboard.press("Control+z");
      await expect.poll(() => readChildIds(page, "last")).toEqual([]);
    });
  }
}

/**
 * Loads one small canonical container through the demo's normal registrations.
 *
 * @param page - Browser page receiving the fixture.
 * @param type - Layout whose writing children receive the dragged block.
 * @param mode - Surface sharing the Page region resolver.
 * @returns Resolves with the receiving parent ID after its children mount.
 */
async function load(page: Page, type: Container, mode: "block" | "edgeless") {
  await page.setViewportSize({ width: 1500, height: 1100 });
  await page.goto("/");
  await page.locator('[data-journal-document="today"] > .page-surface').waitFor();
  const parent = await page.evaluate(
    ({ type, mode }) => {
      const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
        .__rivtoDemo.editor;
      editor.load({ ...editor.dump(), blocks: [], elements: [], rootElementIds: [] });
      const leafType = type === "todo-storage" ? "todo-item" : "paragraph";
      editor.blocks.insertBlock({ id: "source", type: leafType, content: "Source" });
      const children = ["first", "last"].map((id) => ({ id, type: leafType, content: id }));
      let parent = "board";
      if (type === "columns" || type === "kanban") {
        parent = "lane";
        editor.blocks.insertBlock({
          id: "board",
          type,
          content: "Board",
          children: [{ id: parent, type: `${type}-column`, content: "Lane", children }],
        });
      } else if (type === "table") {
        parent = "cell";
        editor.blocks.insertBlock({
          id: "board",
          type,
          children: [
            {
              id: "row",
              type: "table-row",
              children: [{ id: parent, type: "table-cell", children }],
            },
          ],
        });
      } else {
        editor.blocks.insertBlock({
          id: "board",
          type: type === "outline" ? "paragraph" : type,
          content: "Board",
          children,
        });
      }
      if (mode === "edgeless") {
        editor.elements.insertElement({
          type: "block",
          zIndex: 0,
          frame: { x: 20, y: 20, width: 850, height: 800 },
          props: { startBlockId: "source", endBlockId: "board" },
        });
      }
      editor.history.clear();
      return parent;
    },
    { type, mode },
  );
  await page.locator(`[data-editor-mode="${mode}"]`).click();
  await expect(page.locator('[data-block-id="last"]')).toBeVisible();
  return parent;
}

/**
 * Starts a real handle gesture and crosses its activation threshold.
 *
 * @param page - Demo containing the source block.
 * @returns Resolves after the source enters dragging state.
 */
async function startDrag(page: Page) {
  const row = page.locator('[data-block-id="source"] > .rivto-block-row');
  await row.hover();
  const box = (await row.locator(".block-handle").boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 10, box.y + box.height / 2, { steps: 3 });
  await expect(page.locator('[data-block-id="source"]')).toHaveAttribute("data-dragging", "true");
}

/**
 * Reads persisted root order independently of rendered insertion feedback.
 *
 * @param page - Demo page owning the test document.
 * @returns Resolves with canonical root IDs in current order.
 */
async function readRootIds(page: Page) {
  return page.evaluate(() =>
    (
      window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
    ).__rivtoDemo.editor.blocks.getRootIds(),
  );
}

for (const mode of ["block", "edgeless"] as const) {
  for (const type of ["outline", "columns", "kanban", "bento", "table", "todo-storage"] as const) {
    test(`explicit gap commits and undoes in ${type}, ${mode}`, async ({ page }) => {
      const parent = await load(page, type, mode);
      const target = await blockDropRegion(page.locator('[data-block-id="first"]'), "after");
      await target.scrollIntoViewIfNeeded();
      const box = (await target.boundingBox())!;
      expect(box.width).toBeGreaterThan(0);
      expect(box.height).toBeGreaterThan(0);
      await startDrag(page);
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 15 });
      await expect(page.locator(".rivto-block-drop-line:visible")).toHaveCount(1);
      // Sweep the physical strip one CSS pixel at a time before committing it.
      for (let offset = 0; offset < box.height; offset += 0.5) {
        await page.mouse.move(box.x + box.width / 2, box.y + offset);
        await expect(page.locator(".rivto-block-drop-line:visible")).toHaveCount(1);
      }
      await page.mouse.up();
      await expect
        .poll(() =>
          page.evaluate((id) => {
            const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
              .__rivtoDemo.editor;
            return editor.blocks.getBlockNode(id)?.childIds;
          }, parent),
        )
        .toEqual(["first", "source", "last"]);
      await page.evaluate(() =>
        (
          window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
        ).__rivtoDemo.editor.history.undo(),
      );
      await expect
        .poll(() =>
          page.evaluate(() =>
            (
              window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
            ).__rivtoDemo.editor.blocks.getParentId("source"),
          ),
        )
        .toBeNull();
    });
  }
  for (const type of ["outline", "columns", "kanban", "bento", "table", "todo-storage"] as const) {
    test(`content drop nests and undoes in ${type}, ${mode}`, async ({ page }) => {
      await load(page, type, mode);
      const target = page.locator('[data-block-id="first"]');
      const content = target
        .locator(':scope > .rivto-block-row [contenteditable="plaintext-only"]')
        .first();
      await content.scrollIntoViewIfNeeded();
      const box = (await content.boundingBox())!;
      await startDrag(page);
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 15 });
      await expect(target).toHaveAttribute("data-block-drop-active", "true");
      await page.mouse.up();
      await expect
        .poll(() =>
          page.evaluate(() => {
            const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
              .__rivtoDemo.editor;
            return {
              parent: editor.blocks.getParentId("source"),
              children: editor.blocks.getBlockNode("first")?.childIds,
            };
          }),
        )
        .toEqual({ parent: "first", children: ["source"] });
      await page.evaluate(() =>
        (
          window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
        ).__rivtoDemo.editor.history.undo(),
      );
      await expect
        .poll(() =>
          page.evaluate(() =>
            (
              window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
            ).__rivtoDemo.editor.blocks.getParentId("source"),
          ),
        )
        .toBeNull();
    });
  }
  for (const control of ["search", "filter", "description", "status"] as const) {
    test(`control drop ${control} inserts into its owning block in ${mode}`, async ({ page }) => {
      await load(page, "todo-storage", mode);
      const storageControl = control === "search" || control === "filter";
      const targetId = storageControl ? "board" : "first";
      const target = page.locator(`[data-block-id="${targetId}"]`);
      const row = target.locator(":scope > .rivto-block-row");
      const controls = {
        search: row.getByRole("searchbox", { name: "Search TODOs", exact: true }),
        filter: row.getByRole("button", { name: "Filter", exact: true }),
        description: row.getByRole("textbox", { name: "Description", exact: true }),
        status: row.getByRole("button", { name: "Status: todo. Change status", exact: true }),
      };
      const hit = controls[control];
      await hit.scrollIntoViewIfNeeded();
      const box = (await hit.boundingBox())!;
      await startDrag(page);
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 15 });
      await expect(target).toHaveAttribute("data-block-drop-active", "true");
      await page.mouse.up();
      await expect
        .poll(() =>
          page.evaluate(() =>
            (
              window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
            ).__rivtoDemo.editor.blocks.getParentId("source"),
          ),
        )
        .toBe(targetId);
      if (control === "search" || control === "description") {
        await expect(hit).toHaveValue("");
      } else if (control === "filter") {
        await expect(hit).toHaveAttribute("aria-expanded", "false");
      } else {
        await expect(hit).toHaveAttribute("aria-label", "Status: todo. Change status");
      }
      await page.evaluate(() =>
        (
          window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
        ).__rivtoDemo.editor.history.undo(),
      );
      await expect
        .poll(() =>
          page.evaluate(() =>
            (
              window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
            ).__rivtoDemo.editor.blocks.getParentId("source"),
          ),
        )
        .toBeNull();
    });
  }
  test(`nested drop regions override exclusions at multiple depths in ${mode}`, async ({
    page,
  }) => {
    await load(page, "outline", mode);
    // Existing shell regions remain nested beneath two excluded layout ancestors.
    await page.locator('[data-block-id="board"] > .rivto-block-children').evaluate((element) => {
      element.setAttribute("data-drop-inert", "");
      element.closest('[data-block-id="board"]')!.setAttribute("data-drop-inert", "");
    });
    const target = page.locator('[data-block-id="first"]');
    const content = target
      .locator(':scope > .rivto-block-row [contenteditable="plaintext-only"]')
      .first();
    const box = (await content.boundingBox())!;
    await startDrag(page);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 10 });
    await expect(target).toHaveAttribute("data-block-drop-active", "true");
    await content.evaluate((element) => element.setAttribute("data-drop-inert", ""));
    await page.mouse.move(box.x + box.width / 2 + 1, box.y + box.height / 2);
    await expect(page.locator('[data-block-drop-active="true"]')).toHaveCount(0);
    await expect(page.locator(".rivto-block-drop-line:visible")).toHaveCount(0);
    await content.evaluate((element) => element.removeAttribute("data-drop-inert"));
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await expect(target).toHaveAttribute("data-block-drop-active", "true");
    await page.mouse.up();
    await expect
      .poll(() =>
        page.evaluate(() =>
          (
            window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
          ).__rivtoDemo.editor.blocks.getParentId("source"),
        ),
      )
      .toBe("first");
    await page.evaluate(() =>
      (
        window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
      ).__rivtoDemo.editor.history.undo(),
    );
    await expect
      .poll(() =>
        page.evaluate(() =>
          (
            window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
          ).__rivtoDemo.editor.blocks.getParentId("source"),
        ),
      )
      .toBeNull();
  });
  test(`outline trailing edge still nests and undoes in ${mode}`, async ({ page }) => {
    await load(page, "outline", mode);
    await startDrag(page);
    const inside = await blockDropRegion(page.locator('[data-block-id="first"]'), "inside");
    const box = await inside.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 8 });
    await expectBoundaryLine(page);
    await page.mouse.up();
    await expect
      .poll(() =>
        page.evaluate(() =>
          (
            window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
          ).__rivtoDemo.editor.blocks.getParentId("source"),
        ),
      )
      .toBe("first");
    await page.evaluate(() =>
      (
        window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
      ).__rivtoDemo.editor.history.undo(),
    );
    await expect
      .poll(() =>
        page.evaluate(() =>
          (
            window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
          ).__rivtoDemo.editor.blocks.getParentId("source"),
        ),
      )
      .toBeNull();
  });
  for (const collapsed of [false, true]) {
    test(`content drop appends to a populated block, collapsed=${collapsed}, ${mode}`, async ({
      page,
    }) => {
      await load(page, "outline", mode);
      await page.evaluate((collapsed) => {
        const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
          .__rivtoDemo.editor;
        editor.blocks.updateBlock("board", { listProps: { collapsed } });
        editor.history.clear();
      }, collapsed);
      const target = page.locator('[data-block-id="board"]');
      const content = target
        .locator(':scope > .rivto-block-row [contenteditable="plaintext-only"]')
        .first();
      const box = (await content.boundingBox())!;
      await startDrag(page);
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 15 });
      await expect(target).toHaveAttribute("data-block-drop-active", "true");
      await page.mouse.up();
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              (
                window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
              ).__rivtoDemo.editor.blocks.getBlockNode("board")?.childIds,
          ),
        )
        .toEqual(["first", "last", "source"]);
      await page.evaluate(() =>
        (
          window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
        ).__rivtoDemo.editor.history.undo(),
      );
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              (
                window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
              ).__rivtoDemo.editor.blocks.getBlockNode("board")?.childIds,
          ),
        )
        .toEqual(["first", "last"]);
    });
  }
}

test("filtered lists retain canonical neighbors and expose an explicit empty-result region", async ({
  page,
}) => {
  await load(page, "todo-storage", "block");
  const storage = page.locator('[data-block-id="board"]');
  const search = storage.getByRole("searchbox", { name: "Search TODOs" });
  await search.fill("first");
  await expect(storage.locator('[data-block-type="todo-item"]')).toHaveCount(1);
  const gap = await blockDropRegion(storage.locator('[data-block-id="first"]'), "after");
  await gap.scrollIntoViewIfNeeded();
  let box = (await gap.boundingBox())!;
  await startDrag(page);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 10 });
  await page.mouse.up();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
          ).__rivtoDemo.editor.blocks.getBlockNode("board")?.childIds,
      ),
    )
    .toEqual(["first", "source", "last"]);
  await page.evaluate(() =>
    (
      window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
    ).__rivtoDemo.editor.history.undo(),
  );
  await search.fill("no matching tasks");
  const empty = storage.locator(":scope > .rivto-block-children");
  await expect(empty).toBeVisible();
  box = (await empty.boundingBox())!;
  await startDrag(page);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 10 });
  await page.mouse.up();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
          ).__rivtoDemo.editor.blocks.getBlockNode("board")?.childIds,
      ),
    )
    .toEqual(["first", "last", "source"]);
});

for (const mode of ["block", "edgeless"] as const) {
  test(`drop geometry leaves layout unchanged and short-tile background appends to Bento in ${mode}`, async ({
    page,
  }) => {
    await load(page, "bento", mode);
    const board = page.locator('[data-block-id="board"]');
    const host = board.locator(":scope > .rivto-block-children");
    const unchanged = await host.evaluate((element) => {
      const items = [...element.children];
      const measure = () => items.map((item) => item.getBoundingClientRect().toJSON());
      const before = JSON.stringify(measure());
      const count = element.querySelectorAll("*").length;
      element.style.setProperty("--rivto-drop-target-size", "24px");
      const after = JSON.stringify(measure());
      element.style.removeProperty("--rivto-drop-target-size");
      return before === after && element.querySelectorAll("*").length === count;
    });
    expect(unchanged).toBe(true);
    await expect(
      page.locator(
        ".rivto-block-drop-wrapper-boundary, .rivto-block-drop-gap, .rivto-block-outline-drop-gap",
      ),
    ).toHaveCount(0);
    await host.evaluate((element) => {
      const items = element.querySelectorAll<HTMLElement>(":scope > .rivto-block-item");
      items[1]!.style.minHeight = "240px";
    });
    const first = (await host.locator(":scope > .rivto-block-item").first().boundingBox())!;
    const last = (await host.locator(":scope > .rivto-block-item").last().boundingBox())!;
    const x = first.x + first.width / 2;
    const y = first.y + first.height + (last.height - first.height) / 2;
    expect(y).toBeGreaterThan(first.y + first.height);
    await startDrag(page);
    await page.mouse.move(x, y, { steps: 12 });
    await expect(page.locator('[data-block-id="board"]')).toHaveAttribute(
      "data-block-drop-active",
      "true",
    );
    await page.mouse.up();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (
              window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
            ).__rivtoDemo.editor.blocks.getBlockNode("board")?.childIds,
        ),
      )
      .toEqual(["first", "last", "source"]);
  });
}

test("uses logical inline edges after native canvas zoom in RTL", async ({ page }) => {
  await load(page, "bento", "edgeless");
  const board = page.locator('[data-block-id="board"]');
  await board.evaluate((element) => element.setAttribute("dir", "rtl"));
  const canvas = page.locator(".edgeless-viewport");
  await canvas.hover({ position: { x: 160, y: 160 } });
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, 150);
  await page.keyboard.up("Control");
  await expect(canvas).not.toHaveAttribute("data-edgeless-zoom", "1");
  await startDrag(page);
  const point = await board.locator('[data-block-item-id="first"]').evaluate((element) => {
    const box = element.getBoundingClientRect();
    const scale = box.width / (element as HTMLElement).offsetWidth;
    return { x: box.left + 2 * scale, y: box.top + box.height / 2 };
  });
  await page.mouse.move(point.x, point.y, { steps: 12 });
  await expect(page.locator(".rivto-block-drop-line:visible")).toHaveAttribute(
    "data-axis",
    "vertical",
  );
  await page.mouse.up();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
          ).__rivtoDemo.editor.blocks.getBlockNode("board")?.childIds,
      ),
    )
    .toEqual(["first", "source", "last"]);
});

for (const mode of ["block", "edgeless"] as const) {
  for (const type of ["outline", "columns", "kanban", "table", "todo-storage"] as const) {
    test(`physical gap has no fractional dead strip in ${type}, ${mode}`, async ({ page }) => {
      const parent = await load(page, type, mode);
      await startDrag(page);
      const first = (await page.locator('[data-block-id="first"]').boundingBox())!;
      const last = (await page.locator('[data-block-id="last"]').boundingBox())!;
      const x = first.x + 12;
      const start = first.y + first.height - 2;
      const end = last.y + 2;
      for (const direction of [1, -1]) {
        for (let offset = 0; offset <= end - start; offset += 0.25) {
          const y = direction === 1 ? start + offset : end - offset;
          await page.mouse.move(x, y);
          const line = page.locator(".rivto-block-drop-line:visible");
          await expect(line, `pointer y=${y}`).toHaveCount(1);
          const indicator = (await line.boundingBox())!;
          expect(indicator.y + indicator.height / 2).toBeCloseTo(
            (first.y + first.height + last.y) / 2,
            1,
          );
        }
      }
      await page.mouse.up();
      await expect
        .poll(() =>
          page.evaluate(
            (id) =>
              (
                window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
              ).__rivtoDemo.editor.blocks.getBlockNode(id)?.childIds,
            parent,
          ),
        )
        .toEqual(["first", "source", "last"]);
    });
  }
}

for (const mode of ["block", "edgeless"] as const) {
  for (const wrapped of [false, true]) {
    test(`Bento shared tile seam stays active at fractional coordinates in ${mode}, wrapped=${wrapped}`, async ({
      page,
    }) => {
      await load(page, "bento", mode);
      if (wrapped) {
        await page
          .locator('[data-block-id="board"] > .rivto-block-children')
          .evaluate((element) => {
            (element as HTMLElement).style.width = "320px";
          });
      }
      await startDrag(page);
      const first = (await page
        .locator('[data-block-id="first"]')
        .locator("xpath=ancestor::*[@data-drop-wrapper-axis][1]")
        .boundingBox())!;
      const last = (await page
        .locator('[data-block-id="last"]')
        .locator("xpath=ancestor::*[@data-drop-wrapper-axis][1]")
        .boundingBox())!;
      const start = wrapped ? first.y + first.height - 4 : first.x + first.width - 4;
      const end = wrapped ? last.y + 4 : last.x + 4;
      expect(end - start).toBeCloseTo(8, 1);
      const lines: string[] = [];
      for (const direction of [1, -1]) {
        for (let offset = 0; offset <= end - start; offset += 0.25) {
          const coordinate = direction === 1 ? start + offset : end - offset;
          const x = wrapped ? first.x + 12 : coordinate;
          const y = wrapped ? coordinate : first.y + first.height / 2;
          await page.mouse.move(x, y);
          const line = page.locator(".rivto-block-drop-line:visible");
          await expect(line, `x=${x}, y=${y}`).toHaveCount(1);
          lines.push(JSON.stringify(await line.boundingBox()));
        }
      }
      expect(new Set(lines).size, "the shared line must stay fixed in both directions").toBe(1);
      await page.mouse.up();
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              (
                window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
              ).__rivtoDemo.editor.blocks.getBlockNode("board")?.childIds,
          ),
        )
        .toEqual(["first", "source", "last"]);
    });
  }

  test(`outline shared gap keeps its depth across both edges in ${mode}`, async ({ page }) => {
    await load(page, "outline", mode);
    await startDrag(page);
    const target = page.locator('[data-block-id="first"]');
    const first = (await target.boundingBox())!;
    const last = (await page.locator('[data-block-id="last"]').boundingBox())!;
    const indent = await target.evaluate(
      (element) =>
        parseFloat(getComputedStyle(element).getPropertyValue("--rivto-block-indent")) || 28,
    );
    const x = first.x + 40;
    for (let y = first.y + first.height - 2; y <= last.y + 2; y += 0.25) {
      await page.mouse.move(x, y);
      const line = await expectBoundaryLine(page);
      expect(line.x).toBeCloseTo(first.x + indent, 1);
      expect(line.width).toBeCloseTo(first.width - indent, 1);
    }
    const middle = (first.y + first.height + last.y) / 2;
    for (const direction of [1, -1]) {
      const depths: number[] = [];
      for (let offset = 4; offset <= 60; offset += 2) {
        const dx = direction === 1 ? offset : 64 - offset;
        await page.mouse.move(first.x + dx, middle);
        const line = await expectBoundaryLine(page);
        expect(line.y + line.height / 2).toBeCloseTo(middle, 1);
        expect(line.x).toBeCloseTo(first.x + (dx < indent ? 0 : indent), 1);
        depths.push(Math.round((line.x - first.x) / indent));
      }
      expect(new Set(depths).size).toBe(2);
      expect(depths).toEqual([...depths].sort((a, b) => direction * (a - b)));
    }
    await page.mouse.move(x, middle);
    await page.mouse.up();
    await expect
      .poll(() =>
        page.evaluate(() =>
          (
            window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
          ).__rivtoDemo.editor.blocks.getParentId("source"),
        ),
      )
      .toBe("first");
  });
}

for (const mode of ["block", "edgeless"] as const) {
  test(`TODO card fills its selection shell in ${mode}`, async ({ page }) => {
    await load(page, "todo-storage", mode);
    const shell = page.locator('[data-block-id="first"]');
    const card = shell.locator(".rivto-todo-item").first();
    expect(await card.boundingBox()).toEqual(await shell.boundingBox());
    await card.click({ position: { x: 5, y: 5 }, modifiers: ["Control"] });
    await expect(shell).toHaveAttribute("data-block-selected", "true");
    expect(await card.boundingBox()).toEqual(await shell.boundingBox());
  });

  test(`Bento body accepts nesting between sibling strips in ${mode}`, async ({ page }) => {
    await load(page, "bento", mode);
    await startDrag(page);
    const tile = page
      .locator('[data-block-id="first"]')
      .locator("xpath=ancestor::*[@data-drop-wrapper-axis][1]");
    const content = (await tile
      .locator(":scope > .rivto-block-drop-wrapper-content")
      .boundingBox())!;
    await page.mouse.move(content.x + content.width / 2, content.y + content.height / 2);
    await expect(page.locator('[data-block-id="first"]')).toHaveAttribute(
      "data-block-drop-active",
      "true",
    );
    await page.mouse.up();
    await expect
      .poll(() =>
        page.evaluate(() =>
          (
            window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
          ).__rivtoDemo.editor.blocks.getParentId("source"),
        ),
      )
      .toBe("first");
  });
}

for (const mode of ["block", "edgeless"] as const) {
  test(`ending drop uses existing layout without a spacer in ${mode}`, async ({ page }) => {
    await load(page, "outline", mode);
    const last = page.locator('[data-block-id="board"]');
    const occurrence = last.locator("xpath=ancestor::*[@data-rivto-block-editor][1]");
    await expect(occurrence.locator(".rivto-block-editor-end")).toHaveCount(0);
    let target;
    if (mode === "block") {
      target = occurrence.locator(":scope > [data-page-end-slot]");
      const slot = (await target.boundingBox())!;
      const block = (await last.boundingBox())!;
      const gap = await occurrence.evaluate((element) =>
        parseFloat(getComputedStyle(element).rowGap),
      );
      expect(slot.y - block.y - block.height).toBeCloseTo(gap, 1);
    } else {
      const content = last.locator("xpath=ancestor::*[@data-edgeless-card-content][1]");
      await expect
        .poll(async () =>
          content.evaluate((element) => {
            const last = element.querySelector<HTMLElement>(':scope > [data-block-id="board"]')!;
            return Math.abs(
              element.getBoundingClientRect().bottom -
                last.getBoundingClientRect().bottom -
                parseFloat(getComputedStyle(element).paddingBottom),
            );
          }),
        )
        .toBeLessThanOrEqual(1);
      target = await blockDropRegion(last, "after");
    }
    await startDrag(page);
    const box = (await target.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.locator(".rivto-block-drop-line:visible")).toHaveCount(1);
    if (mode === "block") {
      const block = (await last.boundingBox())!;
      for (const y of [
        block.y + block.height - 1,
        block.y + block.height + 1,
        box.y + 1,
        box.y + box.height / 2,
        box.y + box.height - 1,
      ]) {
        await page.mouse.move(block.x + 4, y);
        await expectBoundaryLine(page);
        const line = (await page.locator(".rivto-block-drop-line:visible").boundingBox())!;
        expect(line.y + line.height / 2).toBeCloseTo(block.y + block.height, 1);
        expect(line.x).toBeCloseTo(block.x, 1);
        expect(line.width).toBeCloseTo(block.width, 1);
      }
    }
    await page.mouse.up();
    await expect.poll(() => readRootIds(page)).toEqual(["board", "source"]);
    await page.evaluate(() =>
      (
        window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
      ).__rivtoDemo.editor.history.undo(),
    );
    await expect.poll(() => readRootIds(page)).toEqual(["source", "board"]);
  });
}

for (const mode of ["block", "edgeless"] as const) {
  test(`first control activation and repeated drag work after drop in ${mode}`, async ({
    page,
  }) => {
    await load(page, "todo-storage", mode);
    await startDrag(page);
    const target = await blockDropRegion(page.locator('[data-block-id="first"]'), "after");
    const box = (await target.boundingBox())!;
    await page.mouse.move(box.x + 12, box.y + box.height / 2, { steps: 10 });
    await page.mouse.up();
    const source = page.locator('[data-block-id="source"]');
    await expect(source).not.toHaveAttribute("data-dragging", "true");
    const status = source.getByRole("button", { name: /^Status:/ });
    const before = await status.getAttribute("aria-label");
    await status.click();
    await expect(status).not.toHaveAttribute("aria-label", before!);
    await startDrag(page);
    await page.keyboard.press("Escape");
    await page.mouse.up();
    await returnToDocumentAfterNativeHandleClick(page, "source");
    await expect(source).not.toHaveAttribute("data-dragging", "true");
    const after = await status.getAttribute("aria-label");
    await status.click();
    await expect(status).not.toHaveAttribute("aria-label", after!);
  });

  test(`first counter click and consecutive drops work in ${mode}`, async ({ page }) => {
    await load(page, "outline", mode);
    await page.evaluate(() => {
      const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
        .__rivtoDemo.editor;
      editor.blocks.setBlockType("source", "demo.counter");
    });
    for (const sibling of ["first", "last"]) {
      await startDrag(page);
      const target = await blockDropRegion(page.locator(`[data-block-id="${sibling}"]`), "after");
      const box = (await target.boundingBox())!;
      await page.mouse.move(box.x + 12, box.y + box.height / 2, { steps: 10 });
      await page.mouse.up();
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              (
                window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
              ).__rivtoDemo.editor.blocks.getBlockNode("board")?.childIds,
          ),
        )
        .toEqual(sibling === "first" ? ["first", "source", "last"] : ["first", "last", "source"]);
    }
    const counter = page
      .locator('[data-block-id="source"]')
      .getByRole("button", { name: "Count: 0" });
    await counter.click();
    await expect(
      page.locator('[data-block-id="source"]').getByRole("button", { name: "Count: 1" }),
    ).toBeVisible();
  });

  test(`short Kanban column outlines its free background in ${mode}`, async ({ page }) => {
    await load(page, "kanban", mode);
    await page.evaluate(() => {
      const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
        .__rivtoDemo.editor;
      editor.blocks.insertBlock(
        {
          id: "tall-lane",
          type: "kanban-column",
          children: Array.from({ length: 8 }, (_, index) => ({
            id: `tall-${index}`,
            type: "paragraph",
            content: "Tall neighbor",
          })),
        },
        { parentId: "board" },
      );
    });
    const item = page.locator('[data-block-id="lane"] > .rivto-kanban-cards');
    const box = (await item.boundingBox())!;
    const last = (await page.locator('[data-block-id="last"]').boundingBox())!;
    expect(box.y + box.height - (last.y + last.height)).toBeGreaterThan(20);
    await startDrag(page);
    const footer = (await item.getByRole("button", { name: "Add card to Lane" }).boundingBox())!;
    const y = (last.y + last.height + footer.y) / 2;
    expect(y).toBeGreaterThan(last.y + last.height + 16);
    await page.mouse.move(box.x + box.width / 2, y, { steps: 10 });
    await expectInsideOutline(page, "lane");
    await page.mouse.up();
    await expect.poll(() => readChildIds(page, "lane")).toEqual(["first", "last", "source"]);
    await page.keyboard.press("Control+z");
    await expect.poll(() => readChildIds(page, "lane")).toEqual(["first", "last"]);
  });

  for (const empty of [true, false]) {
    test(`Kanban column accepts drop on its footer empty=${empty} in ${mode}`, async ({ page }) => {
      await load(page, "kanban", mode);
      if (empty) {
        await page.evaluate(() => {
          const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
            .__rivtoDemo.editor;
          editor.blocks.removeBlocks(["first", "last"]);
        });
      }
      await startDrag(page);
      const lane = page.locator('[data-block-id="lane"]');
      const region = lane.getByRole("button", { name: "Add card to Lane" });
      const box = (await region.boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 10 });
      await expectInsideOutline(page, "lane");
      await page.mouse.up();
      await expect
        .poll(() =>
          page.evaluate(() =>
            (
              window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
            ).__rivtoDemo.editor.blocks.getParentId("source"),
          ),
        )
        .toBe("lane");
    });
  }
}

for (const mode of ["block", "edgeless"] as const) {
  test(`Kanban header and footer outline the complete column in ${mode}`, async ({ page }) => {
    await load(page, "kanban", mode);
    const lane = page.locator('[data-block-id="lane"]');
    const column = (await lane.boundingBox())!;
    const header = lane.locator(":scope > .rivto-kanban-lane-header");
    const footer = lane.getByRole("button", { name: "Add card to Lane" });
    await startDrag(page);
    for (const region of [header, footer, header, footer]) {
      const box = (await region.boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 5 });
      expect(await expectInsideOutline(page, "lane")).toEqual(column);
    }
    for (const id of ["first", "last"]) {
      const card = (await page.locator(`[data-block-id="${id}"]`).boundingBox())!;
      expect(card.x).toBeGreaterThan(column.x + 4);
      expect(card.x + card.width).toBeLessThan(column.x + column.width - 4);
    }
    await page.mouse.up();
    await expect
      .poll(() =>
        page.evaluate(() =>
          (
            window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
          ).__rivtoDemo.editor.blocks.getParentId("source"),
        ),
      )
      .toBe("lane");
  });
}

test("trailing controls retain their slot across empty, insert and undo", async ({ page }) => {
  await load(page, "outline", "block");
  await page.evaluate(() => {
    const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }).__rivtoDemo
      .editor;
    editor.load({ ...editor.dump(), blocks: [], elements: [], rootElementIds: [] });
    editor.history.clear();
  });
  const surface = page.locator('[data-journal-document="today"] > .page-surface');
  const slot = await surface.locator(":scope > [data-page-end-slot]").elementHandle();
  await expect(surface).toHaveAttribute("data-empty", "true");
  await surface.getByRole("button", { name: "Add 3 blocks", exact: true }).click();
  await expect.poll(async () => (await readRootIds(page)).length).toBe(3);
  await expect(surface.locator(".page-trailing-block")).toHaveCount(3);
  expect(await slot!.evaluate((element) => element.isConnected)).toBe(true);
  await page.keyboard.press("Control+z");
  await expect.poll(() => readRootIds(page)).toEqual([]);
  await expect(surface.locator(".page-trailing-block")).toHaveCount(3);
  expect(await slot!.evaluate((element) => element.isConnected)).toBe(true);
  await surface.getByRole("button", { name: "Add block", exact: true }).click();
  await expect.poll(async () => (await readRootIds(page)).length).toBe(1);
});

for (const padding of [12, 56]) {
  test(`existing top padding accepts prepend throughout ${padding}px without adding layout`, async ({
    page,
  }) => {
    await load(page, "outline", "block");
    await page.evaluate(() => {
      const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
        .__rivtoDemo.editor;
      editor.blocks.moveBlocks(["source"], "board", "after");
      editor.history.clear();
    });
    const surface = page.locator('[data-journal-document="today"] > .page-surface');
    await surface.evaluate((element, padding) => {
      (element as HTMLElement).style.paddingTop = `${padding}px`;
    }, padding);
    const first = (await page.locator('[data-block-id="board"]').boundingBox())!;
    const before = (await surface.boundingBox())!;
    await startDrag(page);
    for (const offset of [1, padding / 2, padding - 0.25, padding]) {
      await page.mouse.move(first.x + first.width / 2, before.y + offset);
      const line = page.locator(".rivto-block-drop-line:visible");
      await expect(line, `offset=${offset}`).toHaveCount(1);
      const box = (await line.boundingBox())!;
      expect(box.y + box.height / 2).toBeCloseTo(first.y, 1);
      expect(box.x).toBeCloseTo(first.x, 1);
      expect(box.width).toBeCloseTo(first.width, 1);
    }
    expect(await surface.boundingBox()).toEqual(before);
    await page.mouse.up();
    await expect.poll(() => readRootIds(page)).toEqual(["source", "board"]);
    await page.keyboard.press("Control+z");
    await expect.poll(() => readRootIds(page)).toEqual(["board", "source"]);
  });
}

test("zero leading space retains row gutters without adding space above the editor", async ({
  page,
}) => {
  await load(page, "outline", "block");
  const surface = page.locator('[data-journal-document="today"] > .page-surface');
  await surface.evaluate((element) => {
    (element as HTMLElement).style.paddingTop = "0px";
  });
  const box = (await surface.boundingBox())!;
  const first = (await page.locator('[data-block-id="source"]').boundingBox())!;
  expect(first.y).toBeCloseTo(box.y, 1);
  await startDrag(page);
  const line = page.locator(".rivto-block-drop-line:visible");
  await page.mouse.move(box.x + 1, box.y - 0.25);
  await expect(line).toHaveCount(0);
  await page.mouse.move(box.x + 1, first.y + first.height / 2);
  await expect(line).toHaveCount(1);
  await page.mouse.move(box.x + 1, first.y + 0.25);
  await expect(line).toHaveCount(1);
  await page.mouse.up();
  await expect.poll(() => readRootIds(page)).toEqual(["source", "board"]);
});

test("existing space below the root list inserts after the last root", async ({ page }) => {
  await load(page, "outline", "block");
  const surface = page.locator('[data-journal-document="today"] > .page-surface');
  const last = (await page.locator('[data-block-id="board"]').boundingBox())!;
  const box = (await surface.boundingBox())!;
  await startDrag(page);
  await page.mouse.move(last.x + last.width / 2, box.y + box.height - 1);
  await expect(page.locator(".rivto-block-drop-line:visible")).toHaveCount(1);
  await page.mouse.up();
  await expect.poll(() => readRootIds(page)).toEqual(["board", "source"]);
  await page.keyboard.press("Control+z");
  await expect.poll(() => readRootIds(page)).toEqual(["source", "board"]);
});

/**
 * Reads addressed child order for a model-backed insertion assertion.
 *
 * @param page - Demo page owning the model.
 * @param id - Canonical block to inspect.
 * @returns Resolves with its child IDs, or undefined if it is absent.
 */
async function readChildIds(page: Page, id: string) {
  return page.evaluate(
    (id) =>
      (
        window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
      ).__rivtoDemo.editor.blocks.getBlockNode(id)?.childIds,
    id,
  );
}

/**
 * Loads three leaf roots so either side of the target changes canonical order.
 *
 * @param page - Demo page receiving the fixture.
 * @param mode - Existing Page or canvas surface.
 * @returns Resolves after the target leaf and its intervening sibling mount.
 */
async function loadGutter(page: Page, mode: "block" | "edgeless") {
  await load(page, "outline", mode);
  await page.evaluate(() => {
    const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }).__rivtoDemo
      .editor;
    editor.blocks.removeBlocks(["first", "last"]);
    editor.blocks.insertBlock({ id: "spare", type: "paragraph", content: "Spare" });
    editor.blocks.moveBlocks(["spare"], "board", "before");
    editor.history.clear();
  });
}

for (const mode of ["block", "edgeless"] as const) {
  for (const { side, placement, roots, parentId } of [
    { side: "left", placement: "before", roots: ["spare", "source", "board"], parentId: null },
    { side: "left", placement: "after", roots: ["spare", "board", "source"], parentId: null },
    { side: "right", placement: "before", roots: ["spare", "board"], parentId: "spare" },
    { side: "right", placement: "after", roots: ["spare", "board"], parentId: "board" },
  ] as const) {
    test(`row gutter ${side} selects ${placement} across the row in ${mode}`, async ({ page }) => {
      await loadGutter(page, mode);
      const block = page.locator('[data-block-id="board"]');
      const host =
        mode === "block"
          ? block.locator("xpath=ancestor::*[@data-rivto-block-editor][1]")
          : block.locator("xpath=ancestor::*[@data-edgeless-card-content][1]");
      const bounds = (await host.boundingBox())!;
      const row = (await block.boundingBox())!;
      await startDrag(page);
      const x = side === "left" ? bounds.x + 1 : bounds.x + bounds.width - 1;
      const nativeY = placement === "before" ? row.y + 2 : row.y + row.height - 2;
      const y = row.y + row.height * (placement === "before" ? 0.45 : 0.55);
      await page.mouse.move(side === "left" ? row.x + 1 : row.x + row.width - 1, nativeY);
      const nativeIndicator = await expectBoundaryLine(page);
      await page.mouse.move(x, y);
      expect(await expectBoundaryLine(page)).toEqual(nativeIndicator);
      await page.mouse.up();
      await expect.poll(() => readRootIds(page)).toEqual(roots);
      if (parentId) {
        await expect.poll(() => readChildIds(page, parentId)).toEqual(["source"]);
      }
      await page.keyboard.press("Control+z");
      await expect.poll(() => readRootIds(page)).toEqual(["source", "spare", "board"]);
    });
  }
  for (const placement of ["before", "after"] as const) {
    test(`Kanban card ${placement} edge retains its sibling band in ${mode}`, async ({ page }) => {
      await load(page, "kanban", mode);
      const card = page.locator(`[data-block-id="${placement === "before" ? "first" : "last"}"]`);
      const bounds = (await card.boundingBox())!;
      await startDrag(page);
      const y = placement === "before" ? bounds.y + 12 : bounds.y + bounds.height - 12;
      const offsets =
        placement === "before"
          ? [0.25, 0.5, 0.75].map((ratio) => bounds.width * ratio)
          : [3, 8, 12];
      for (const offset of offsets) {
        await page.mouse.move(bounds.x + offset, y);
        const line = page.locator(".rivto-block-drop-line:visible");
        await expect(line).toHaveCount(1);
        const indicator = (await line.boundingBox())!;
        expect(indicator.x).toBeCloseTo(bounds.x, 1);
        expect(indicator.width).toBeCloseTo(bounds.width, 1);
      }
      await page.mouse.up();
      await expect
        .poll(() => readChildIds(page, "lane"))
        .toEqual(
          placement === "before" ? ["source", "first", "last"] : ["first", "last", "source"],
        );
      await page.keyboard.press("Control+z");
      await expect.poll(() => readChildIds(page, "lane")).toEqual(["first", "last"]);
    });
  }
  for (const type of ["kanban", "bento", "todo-storage"] as const) {
    test(`nested ${type} body remains droppable in ${mode}`, async ({ page }) => {
      await load(page, type, mode);
      await page.evaluate(() => {
        const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
          .__rivtoDemo.editor;
        editor.blocks.insertBlock({ id: "nested", type: "paragraph", content: "Nested" });
        editor.blocks.moveBlocks(["nested"], "first", "inside");
        editor.history.clear();
      });
      const nested = page.locator('[data-block-id="nested"]');
      const bounds = (await nested.boundingBox())!;
      await startDrag(page);
      await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
      await expect(nested).toHaveAttribute("data-block-drop-active", "true");
      await page.mouse.up();
      await expect.poll(() => readChildIds(page, "nested")).toEqual(["source"]);
      await page.keyboard.press("Control+z");
      await expect.poll(() => readChildIds(page, "nested")).toEqual([]);
    });
  }
}

/**
 * Reads content alignment and the theme contribution of one optional collapse control.
 *
 * @param page - Demo page containing the fixture.
 * @param id - Mounted block whose own row is measured.
 * @returns Content/shell X positions, outline indent and the expected in-flow toggle width plus gap.
 */
async function readControlOffsets(page: Page, id: string) {
  return page.locator(`[data-block-id="${id}"] > .rivto-block-row`).evaluate((row) => {
    const style = getComputedStyle(row);
    const content = row.querySelector(":scope > .rivto-block-content")!;
    const shell = row.closest("[data-block-id]")!;
    let toggleOffset = 0;
    if (row.getAttribute("data-controls-placement") === "inside") {
      toggleOffset =
        (parseFloat(style.getPropertyValue("--rivto-block-control-size")) || 20) +
        (parseFloat(style.getPropertyValue("--rivto-slot-gap")) || 4);
    }
    return {
      contentX:
        style.direction === "rtl"
          ? -content.getBoundingClientRect().right
          : content.getBoundingClientRect().left,
      shellX:
        style.direction === "rtl"
          ? -shell.getBoundingClientRect().right
          : shell.getBoundingClientRect().left,
      indent: parseFloat(style.getPropertyValue("--rivto-block-indent")) || 28,
      toggleOffset,
    };
  });
}

/**
 * Adds a paragraph child through the demo's model commands for layout transitions.
 *
 * @param page - Test-owned demo page.
 * @param id - New stable paragraph ID, also used as visible text.
 * @param parentId - Existing receiving block.
 * @returns Resolves after insertion and reparenting have been requested.
 */
async function insertNestedParagraph(page: Page, id: string, parentId: string) {
  await page.evaluate(
    ({ id, parentId }) => {
      const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
        .__rivtoDemo.editor;
      editor.blocks.insertBlock({ id, type: "paragraph", content: id });
      editor.blocks.moveBlocks([id], parentId, "inside");
    },
    { id, parentId },
  );
}

/**
 * Loads a container with paragraph siblings and a selected logical text direction.
 *
 * @param page - Test-owned demo page.
 * @param type - Native container using the shared outline subtree.
 * @param mode - Page or Edgeless occurrence to exercise.
 * @param rtl - Whether logical indentation proceeds toward the left.
 * @returns Resolves after native model and direction setup completes.
 */
async function loadNestedOutline(
  page: Page,
  type: Container,
  mode: "block" | "edgeless",
  rtl: boolean,
) {
  await load(page, type, mode);
  await page.evaluate((rtl) => {
    const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }).__rivtoDemo
      .editor;
    editor.blocks.updateBlock("first", { type: "paragraph", content: "Parent" });
    editor.blocks.updateBlock("last", { type: "paragraph", content: "Sibling" });
    const shell = document.querySelector('[data-block-id="first"]')!;
    (shell.closest("[data-rivto-block-editor]") as HTMLElement).style.direction = rtl
      ? "rtl"
      : "ltr";
  }, rtl);
}

/**
 * Sets public geometry parameters on the fixture's own editor occurrence.
 *
 * @param page - Demo page containing the nested fixture.
 * @param size - Control width in local CSS pixels.
 * @param indent - Outline indentation in local CSS pixels.
 * @returns Resolves after the native theme override is applied.
 */
async function setOutlineTheme(page: Page, size: number, indent: number) {
  await page.locator('[data-block-id="nested"]').evaluate(
    (element, values) => {
      const root = element.closest<HTMLElement>("[data-rivto-block-editor]")!;
      root.style.setProperty("--rivto-block-control-size", `${values.size}px`);
      root.style.setProperty("--rivto-block-indent", `${values.indent}px`);
    },
    { size, indent },
  );
}

/**
 * Removes the final child, resets fixture expansion, and waits for the collapse control to disappear.
 *
 * @param page - Demo page containing the deep fixture child.
 * @returns Resolves after the model deletion is reflected in the parent's row.
 */
async function removeNestedParagraph(page: Page) {
  await page.evaluate(() => {
    const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }).__rivtoDemo
      .editor;
    editor.blocks.removeBlocks(["deep"]);
    editor.blocks.updateBlock("nested", { listProps: { collapsed: false } });
  });
  await expect(
    page.locator('[data-block-id="nested"] > .rivto-block-row [data-collapse-toggle]'),
  ).toHaveCount(0);
}

for (const mode of ["block", "edgeless"] as const) {
  for (const type of ["kanban", "bento", "todo-storage"] as const) {
    for (const placement of ["before", "after"] as const) {
      test(`container ${type} continues generous ${placement} strips in ${mode}`, async ({
        page,
      }) => {
        const parent = await load(page, type, mode);
        const id = placement === "before" ? "first" : "last";
        const block = page.locator(`[data-block-id="${id}"]`);
        const item =
          type === "bento" ? block.locator("xpath=ancestor::*[@data-drop-wrapper-axis][1]") : block;
        const bounds = (await item.boundingBox())!;
        const inset = Math.min(12, bounds.height / 3 - 1);
        const y = placement === "before" ? bounds.y + inset : bounds.y + bounds.height - inset;
        await startDrag(page);
        const offsets =
          placement === "before"
            ? [0.25, 0.5, 0.75].map((ratio) => bounds.width * ratio)
            : [3, 8, 12];
        for (const offset of offsets) {
          await page.mouse.move(bounds.x + offset, y);
          const line = page.locator(".rivto-block-drop-line:visible");
          await expect(line).toHaveCount(1);
          const indicator = (await line.boundingBox())!;
          expect(indicator.x).toBeCloseTo(bounds.x, 1);
          expect(indicator.width).toBeCloseTo(bounds.width, 1);
        }
        await page.mouse.up();
        await expect
          .poll(() => readChildIds(page, parent))
          .toEqual(
            placement === "before" ? ["source", "first", "last"] : ["first", "last", "source"],
          );
        await page.keyboard.press("Control+z");
        await expect.poll(() => readChildIds(page, parent)).toEqual(["first", "last"]);
      });
    }
    for (const rtl of [false, true]) {
      test(`container ${type} preserves nested text indent with conditional collapse, RTL=${rtl}, ${mode}`, async ({
        page,
      }) => {
        await loadNestedOutline(page, type, mode, rtl);
        await insertNestedParagraph(page, "nested", "first");
        await expect(page.locator('[data-block-id="nested"]')).toBeVisible();
        const parent = await readControlOffsets(page, "first");
        const sibling = await readControlOffsets(page, "last");
        expect(parent.contentX - parent.shellX - (sibling.contentX - sibling.shellX)).toBeCloseTo(
          parent.toggleOffset,
          1,
        );
        for (const [size, indent] of [
          [20, 24],
          [14, 12],
        ] as const) {
          await setOutlineTheme(page, size, indent);
          const leaf = await readControlOffsets(page, "nested");
          await insertNestedParagraph(page, "deep", "nested");
          await expect(page.locator('[data-block-id="deep"]')).toBeVisible();
          const branch = await readControlOffsets(page, "nested");
          const deep = await readControlOffsets(page, "deep");
          if (size === 20) {
            await page
              .locator('[data-block-id="board"]')
              .screenshot({ path: test.info().outputPath("nested-outline.png") });
          }
          expect(deep.contentX - branch.contentX).toBeCloseTo(indent, 1);
          expect(branch.contentX).toBeCloseTo(leaf.contentX, 1);
          await page.getByRole("button", { name: "Collapse block: nested", exact: true }).click();
          await expect(page.locator('[data-block-id="deep"]')).toHaveCount(0);
          expect((await readControlOffsets(page, "nested")).contentX).toBeCloseTo(
            branch.contentX,
            1,
          );
          await removeNestedParagraph(page);
          expect((await readControlOffsets(page, "nested")).contentX).toBeCloseTo(leaf.contentX, 1);
        }
      });
    }
  }
}

for (const mode of ["block", "edgeless"] as const) {
  for (const type of ["kanban", "bento", "todo-storage"] as const) {
    for (const side of ["left", "right"] as const) {
      for (const placement of ["before", "after"] as const) {
        test(`${type} declared row gutter ${side} honors ${placement} layout policy in ${mode}`, async ({
          page,
        }) => {
          const parent = await load(page, type, mode);
          const host = page.locator(`[data-block-id="${parent}"] > .rivto-block-children`);
          if (type === "kanban" || type === "bento") {
            // Exercise a host-supplied gutter through native layout, without hitbox DOM.
            await host.evaluate((element) => {
              element.style.paddingInline = "48px";
            });
          }
          const id = type === "bento" && side === "right" ? "last" : "first";
          const block = page.locator(`[data-block-id="${id}"]`);
          const item =
            type === "bento"
              ? block.locator("xpath=ancestor::*[@data-drop-wrapper-axis][1]")
              : block;
          const bounds = (await item.boundingBox())!;
          const list = (await host.boundingBox())!;
          const x = side === "left" ? list.x + 1 : list.x + list.width - 1;
          const y = bounds.y + bounds.height * (placement === "before" ? 0.45 : 0.55);
          const initial = ["first", "last"];
          const expected = initial.slice();
          expected.splice(initial.indexOf(id) + (placement === "after" ? 1 : 0), 0, "source");
          await startDrag(page);
          await page.mouse.move(x, y);
          const inside = placement === "after" && side === "right";
          let destination = expected;
          if (type === "bento") {
            await expectInsideOutline(page, parent);
            destination = [...initial, "source"];
          } else {
            await expectBoundaryLine(page);
            if (inside) {
              destination = initial;
            }
          }
          await page.mouse.up();
          await expect.poll(() => readChildIds(page, parent)).toEqual(destination);
          if (type !== "bento" && inside) {
            await expect.poll(() => readChildIds(page, id)).toEqual(["source"]);
          }
          await page.keyboard.press("Control+z");
          await expect.poll(() => readChildIds(page, parent)).toEqual(initial);
        });
      }
    }
  }
}

/**
 * Verifies inside feedback on the receiving hierarchy without an insertion line.
 *
 * @param page - Test-owned demo occurrence with an active drag.
 * @param id - Canonical receiving block whose complete shell must be highlighted.
 * @returns Complete shell viewport bounds after its feedback becomes visible.
 */
async function expectInsideOutline(page: Page, id: string) {
  const target = page.locator(`[data-block-id="${id}"]`);
  await expect(target).toHaveAttribute("data-block-drop-active", "true", { timeout: 1000 });
  await expect(page.locator('[data-block-drop-active="true"]')).toHaveCount(1);
  await expect(page.locator(".rivto-block-drop-line:visible")).toHaveCount(0);
  await expect(target).toHaveCSS("outline-style", "solid");
  return (await target.boundingBox())!;
}

/**
 * Commits child insertion using native input and verifies its declared feedback and undo.
 *
 * @param page - Test-owned demo occurrence.
 * @param id - Receiving block whose canonical children must receive the source.
 * @param children - Canonical child IDs before the move.
 * @param point - Viewport point exercising a declared body or nesting edge.
 * @param feedback - Body outline or indented boundary line expected before release.
 * @returns Resolves after feedback, committed child order and undo have been asserted.
 */
async function commitDropIntoBlock(
  page: Page,
  id: string,
  children: readonly string[],
  point: Pick<DropRegionBox, "x" | "y">,
  feedback: "outline" | "line",
) {
  await startDrag(page);
  await page.mouse.move(point.x, point.y, { steps: 5 });
  if (feedback === "line") {
    await expectBoundaryLine(page);
  } else {
    await expectInsideOutline(page, id);
  }
  await page.screenshot({ path: test.info().outputPath(`${feedback}-feedback.png`), scale: "css" });
  await page.mouse.up();
  await expect.poll(() => readChildIds(page, id)).toEqual([...children, "source"]);
  await page.keyboard.press("Control+z");
  await expect.poll(() => readChildIds(page, id)).toEqual(children);
}

for (const mode of ["block", "edgeless"] as const) {
  for (const type of ["outline", "kanban", "bento", "todo-storage"] as const) {
    for (const targetId of ["first", "nested"] as const) {
      for (const size of [8, 16, 32]) {
        test(`shared body protects populated ${targetId} in ${type}, size=${size}, ${mode}`, async ({
          page,
        }) => {
          const parent = await load(page, type, mode);
          await page.evaluate(() => {
            const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
              .__rivtoDemo.editor;
            editor.blocks.updateBlock("first", { type: "paragraph", content: "Parent" });
          });
          await insertNestedParagraph(page, "nested", "first");
          await insertNestedParagraph(page, "deep", "nested");
          await page
            .locator(`[data-block-id="${parent}"] > .rivto-block-children`)
            .evaluate((element, size) => {
              element.style.setProperty("--rivto-drop-target-size", `${size}px`);
            }, size);
          const content = page.locator(
            `[data-block-id="${targetId}"] > .rivto-block-row > .rivto-block-content`,
          );
          const box = (await content.boundingBox())!;
          await commitDropIntoBlock(
            page,
            targetId,
            targetId === "first" ? ["nested"] : ["deep"],
            {
              x: box.x + box.width / 2,
              y: box.y + box.height / 2,
            },
            "outline",
          );
        });
      }
    }
    test(`shared nesting edge displays an indented insertion line in ${type}, ${mode}`, async ({
      page,
    }) => {
      await load(page, type, mode);
      await insertNestedParagraph(page, "nested", "first");
      const target = page.locator('[data-block-id="nested"]');
      const bounds = (await target.boundingBox())!;
      await commitDropIntoBlock(
        page,
        "nested",
        [],
        {
          x: bounds.x + bounds.width - 2,
          y: bounds.y + bounds.height - 2,
        },
        "line",
      );
    });
  }
}

for (const mode of ["block", "edgeless"] as const) {
  for (const type of ["outline", "kanban", "bento", "todo-storage"] as const) {
    for (const location of ["edge", "gap", "gutter"] as const) {
      test(`outline nesting outside content via ${location} in ${type}, ${mode}`, async ({
        page,
      }) => {
        const parent = await load(page, type, mode);
        const host = page.locator(`[data-block-id="${parent}"] > .rivto-block-children`);
        if (location !== "edge") {
          await host.evaluate((element, location) => {
            element.style.rowGap = "12px";
            element.style.maxWidth = "350px";
            if (location === "gutter") {
              element.style.paddingInline = "24px";
            }
          }, location);
        }
        if (type === "bento" && location === "gutter") {
          await host.evaluate((element) => {
            element.style.paddingInline = "48px";
          });
        }
        const block = page.locator('[data-block-id="first"]');
        const shell = (await block.boundingBox())!;
        const item =
          type === "bento" ? block.locator("xpath=ancestor::*[@data-drop-wrapper-axis][1]") : block;
        const box = (await item.boundingBox())!;
        const indent = await block.evaluate((element) =>
          parseFloat(getComputedStyle(element).getPropertyValue("--rivto-block-indent")),
        );
        const point = { x: box.x + indent + 2, y: box.y + box.height - 1 };
        if (location === "gap") {
          point.y += 6;
        } else if (location === "gutter") {
          const bounds = (await host.boundingBox())!;
          point.x = bounds.x + bounds.width - 1;
        }
        if (location !== "edge") {
          expect(point.y > shell.y + shell.height || point.x > shell.x + shell.width).toBe(true);
        }
        if (type === "bento" && location === "gutter") {
          await commitDropIntoBlock(page, parent, ["first", "last"], point, "outline");
        } else {
          await commitDropIntoBlock(page, "first", [], point, "line");
        }
      });
    }
  }
}

/**
 * Checks insertion-line feedback independently of the canonical destination kind.
 *
 * @param page - Test-owned active gesture on an insertion boundary.
 * @returns Visible line bounds after excluding any full-body outline.
 */
async function expectBoundaryLine(page: Page) {
  const line = page.locator(".rivto-block-drop-line:visible");
  await expect(line).toHaveCount(1, { timeout: 1000 });
  await expect(page.locator('[data-block-drop-active="true"]')).toHaveCount(0);
  await expect(line).toHaveCSS("pointer-events", "none");
  return (await line.boundingBox())!;
}

/**
 * Checks a visible boundary line while moving between sibling and child depth.
 *
 * @param page - Demo with an active native drag.
 * @param box - Existing first item's placement bounds.
 * @param ys - Trailing edge, physical gap and next leading edge coordinates.
 * @param rtl - Whether logical indentation starts from the right.
 * @param indent - Local indentation in viewport CSS pixels.
 * @returns Resolves after the same line geometry is checked across both boundaries.
 */
async function sweepBoundaryDepth(
  page: Page,
  box: DropRegionBox,
  ys: readonly number[],
  rtl: boolean,
  indent: number,
) {
  for (const offset of [2, indent + 2, indent * 2 + 2, 2]) {
    const depth = offset < indent ? 0 : 1;
    for (const y of ys) {
      await page.mouse.move(rtl ? box.x + box.width - offset : box.x + offset, y);
      const line = page.locator(".rivto-block-drop-line:visible");
      await expect(line).toHaveCount(1, { timeout: 1000 });
      await expect(page.locator('[data-block-drop-active="true"]')).toHaveCount(0);
      const actual = (await line.boundingBox())!;
      expect(actual.x).toBeCloseTo(box.x + (rtl ? 0 : depth * indent), 1);
      expect(actual.width).toBeCloseTo(box.width - depth * indent, 1);
      expect(actual.y + actual.height / 2).toBeCloseTo(ys[1], 1);
    }
  }
}

/**
 * Verifies actual composited paint at the center of the visible insertion line.
 *
 * @param page - Active gesture whose line is within the viewport.
 * @returns Resolves after its screenshot pixel matches the opaque indicator color.
 */
async function expectPaintedBoundary(page: Page) {
  const line = page.locator(".rivto-block-drop-line:visible");
  const box = (await line.boundingBox())!;
  const expected = await line.evaluate((element) =>
    getComputedStyle(element).backgroundColor.match(/\d+/g)!.map(Number),
  );
  const png = await page.screenshot({ scale: "css", animations: "disabled" });
  const pixel = await page.evaluate(
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
      x: Math.floor(box.x + box.width / 2),
      y: Math.floor(box.y + box.height / 2),
    },
  );
  expect(pixel).toEqual([...expected.slice(0, 3), 255]);
}

for (const mode of ["block", "edgeless"] as const) {
  for (const type of ["outline", "kanban", "bento", "todo-storage"] as const) {
    for (const rtl of [false, true]) {
      for (const child of [false, true]) {
        test(`boundary feedback switches depth and body in ${type}, ${mode}, RTL=${rtl}, child=${child}`, async ({
          page,
        }) => {
          const parent = await load(page, type, mode);
          await page
            .locator(`[data-block-id="${parent}"] > .rivto-block-children`)
            .evaluate((element, rtl) => {
              element.style.rowGap = "12px";
              element.style.maxWidth = "350px";
              element.style.direction = rtl ? "rtl" : "ltr";
            }, rtl);
          const first = page.locator('[data-block-id="first"]');
          const placement =
            type === "bento" ? "xpath=ancestor::*[@data-drop-wrapper-axis][1]" : "xpath=self::*";
          const box = (await first.locator(placement).boundingBox())!;
          const last = (await page
            .locator('[data-block-id="last"]')
            .locator(placement)
            .boundingBox())!;
          const middle = (box.y + box.height + last.y) / 2;
          const indent = await first.evaluate((element) =>
            parseFloat(getComputedStyle(element).getPropertyValue("--rivto-block-indent")),
          );
          await startDrag(page);
          await sweepBoundaryDepth(
            page,
            box,
            [box.y + box.height - 1, middle, last.y + 1],
            rtl,
            indent,
          );
          const body = (await first
            .locator(":scope > .rivto-block-row > .rivto-block-content")
            .boundingBox())!;
          await page.mouse.move(body.x + body.width / 2, body.y + body.height / 2);
          await expectInsideOutline(page, "first");
          const offset = child ? indent + 2 : 2;
          await page.mouse.move(rtl ? box.x + box.width - offset : box.x + offset, middle);
          await expect(page.locator(".rivto-block-drop-line:visible")).toHaveCount(1);
          await expect(page.locator('[data-block-drop-active="true"]')).toHaveCount(0);
          await expectPaintedBoundary(page);
          await page.mouse.up();
          await expect
            .poll(() => readChildIds(page, parent))
            .toEqual(child ? ["first", "last"] : ["first", "source", "last"]);
          await expect.poll(() => readChildIds(page, "first")).toEqual(child ? ["source"] : []);
          await page.keyboard.press("Control+z");
          await expect.poll(() => readChildIds(page, parent)).toEqual(["first", "last"]);
          await expect.poll(() => readChildIds(page, "first")).toEqual([]);
        });
      }
    }
  }
}

for (const mode of ["block", "edgeless"] as const) {
  for (const side of ["left", "right", "bottom"] as const) {
    test(`Bento declared background ${side} appends to the board in ${mode}`, async ({ page }) => {
      await load(page, "bento", mode);
      const board = page.locator('[data-block-id="board"]');
      const host = board.locator(":scope > .rivto-block-children");
      await host.evaluate((element) => {
        element.style.padding = "48px";
      });
      const bounds = (await host.boundingBox())!;
      const first = (await host.locator(":scope > .rivto-block-item").first().boundingBox())!;
      let x = side === "left" ? bounds.x + 2 : bounds.x + bounds.width - 2;
      if (side === "bottom") {
        x = bounds.x + bounds.width / 2;
      }
      const y = side === "bottom" ? bounds.y + bounds.height - 12 : first.y + first.height * 0.75;
      expect(
        await host.evaluate(
          (element, point) => document.elementFromPoint(point.x, point.y) === element,
          { x, y },
        ),
      ).toBe(true);
      await startDrag(page);
      await page.mouse.move(x, y, { steps: 8 });
      await expectInsideOutline(page, "board");
      await page.mouse.up();
      await expect.poll(() => readChildIds(page, "board")).toEqual(["first", "last", "source"]);
      await expect.poll(() => readChildIds(page, "first")).toEqual([]);
      await expect.poll(() => readChildIds(page, "last")).toEqual([]);
      await page.keyboard.press("Control+z");
      await expect.poll(() => readChildIds(page, "board")).toEqual(["first", "last"]);
    });
  }
}

for (const mode of ["block", "edgeless"] as const) {
  for (const rtl of [false, true]) {
    for (const near of [false, true]) {
      test(`Bento gutter distance separates tile and board in ${mode}, RTL=${rtl}, near=${near}`, async ({
        page,
      }) => {
        await load(page, "bento", mode);
        await page.evaluate(() =>
          (
            window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
          ).__rivtoDemo.editor.blocks.removeBlocks(["last"]),
        );
        const board = page.locator('[data-block-id="board"]');
        const host = board.locator(":scope > .rivto-block-children");
        await host.evaluate((element, rtl) => {
          element.style.direction = rtl ? "rtl" : "ltr";
        }, rtl);
        const tile = board
          .locator('[data-block-id="first"]')
          .locator("xpath=ancestor::*[@data-drop-wrapper-axis][1]");
        const box = (await tile.boundingBox())!;
        const y = box.y + box.height * 0.75;
        const edge = rtl ? box.x : box.x + box.width;
        const direction = rtl ? -1 : 1;
        await startDrag(page);
        for (const distance of [31, 32, 33, 32, 31]) {
          await page.mouse.move(edge + direction * distance, y);
          if (distance <= 32) {
            await expectBoundaryLine(page);
            await expect(page.locator(".rivto-block-drop-line:visible")).toHaveAttribute(
              "data-axis",
              "vertical",
            );
          } else {
            await expectInsideOutline(page, "board");
          }
        }
        await page.mouse.move(edge + direction * (near ? 31 : 33), y);
        await page.mouse.up();
        await expect.poll(() => readChildIds(page, "board")).toEqual(["first", "source"]);
        await expect.poll(() => readChildIds(page, "first")).toEqual([]);
        await page.keyboard.press("Control+z");
        await expect.poll(() => readChildIds(page, "board")).toEqual(["first"]);
        await expect.poll(() => readChildIds(page, "first")).toEqual([]);
      });
    }
  }
}

for (const mode of ["block", "edgeless"] as const) {
  for (const side of ["top", "bottom"] as const) {
    for (const near of [false, true]) {
      test(`Bento gutter extends ${side} in ${mode}, near=${near}`, async ({ page }) => {
        await load(page, "bento", mode);
        await page.evaluate(() =>
          (
            window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
          ).__rivtoDemo.editor.blocks.removeBlocks(["last"]),
        );
        const host = page.locator('[data-block-id="board"] > .rivto-block-children');
        await host.evaluate((element) => {
          element.style.paddingBlock = "64px";
        });
        const tile = page
          .locator('[data-block-id="first"]')
          .locator("xpath=ancestor::*[@data-drop-wrapper-axis][1]");
        const box = (await tile.boundingBox())!;
        const edge = side === "top" ? box.y : box.y + box.height;
        const direction = side === "top" ? -1 : 1;
        const x = box.x + box.width / 2;
        await startDrag(page);
        for (const distance of [31, 32, 33, 32, 31]) {
          await page.mouse.move(x, edge + direction * distance);
          if (distance <= 32) {
            await expectBoundaryLine(page);
            await expect(page.locator(".rivto-block-drop-line:visible")).toHaveAttribute(
              "data-axis",
              "horizontal",
            );
          } else {
            await expectInsideOutline(page, "board");
          }
        }
        await page.mouse.move(x, edge + direction * (near ? 31 : 33));
        await page.mouse.up();
        let children = ["first", "source"];
        if (near) {
          children = side === "top" ? ["source", "first"] : ["first"];
        }
        await expect.poll(() => readChildIds(page, "board")).toEqual(children);
        await expect
          .poll(() => readChildIds(page, "first"))
          .toEqual(near && side === "bottom" ? ["source"] : []);
        await page.keyboard.press("Control+z");
        await expect.poll(() => readChildIds(page, "board")).toEqual(["first"]);
        await expect.poll(() => readChildIds(page, "first")).toEqual([]);
      });
    }
  }
}

for (const mode of ["block", "edgeless"] as const) {
  for (const type of ["outline", "kanban", "todo-storage"] as const) {
    for (const end of [false, true]) {
      test(`vertical list free endpoint in ${type}, ${mode}, end=${end}`, async ({ page }) => {
        const parent = await load(page, type, mode);
        const host = page.locator(`[data-block-id="${parent}"] > .rivto-block-children`);
        await host.evaluate((element) => {
          // Keep the 24px free-space sample outside the parent's enlarged edge strip.
          element.style.paddingBlock = "48px";
        });
        const initialHost = (await host.boundingBox())!;
        const anchor = page.locator(`[data-block-id="${end ? "last" : "first"}"]`);
        const box = (await anchor.boundingBox())!;
        const edge = end ? box.y + box.height : box.y;
        await startDrag(page);
        for (const offset of [1, 8, 24, 8, 1]) {
          for (const x of [
            initialHost.x + 1,
            box.x + box.width / 2,
            initialHost.x + initialHost.width - 1,
          ]) {
            let expectedLine = box;
            if (end && offset <= 8) {
              await page.mouse.move(x, edge - 1);
              expectedLine = await expectBoundaryLine(page);
            }
            await page.mouse.move(x, edge + (end ? offset : -offset));
            if (type === "kanban" && offset > 16) {
              await expectInsideOutline(page, parent);
              continue;
            }
            await expectBoundaryLine(page);
            const line = (await page.locator(".rivto-block-drop-line:visible").boundingBox())!;
            expect(line.y + line.height / 2).toBeCloseTo(edge, 1);
            expect(line.x).toBeCloseTo(expectedLine.x, 1);
            expect(line.width).toBeCloseTo(expectedLine.width, 1);
          }
        }
        expect(await host.boundingBox()).toEqual(initialHost);
        await page.mouse.up();
        await expect
          .poll(() => readChildIds(page, parent))
          .toEqual(end ? ["first", "last"] : ["source", "first", "last"]);
        await expect.poll(() => readChildIds(page, "last")).toEqual(end ? ["source"] : []);
        await page.keyboard.press("Control+z");
        await expect.poll(() => readChildIds(page, parent)).toEqual(["first", "last"]);
        await expect.poll(() => readChildIds(page, "last")).toEqual([]);
      });
    }
  }
}

/**
 * Inserts a second populated layout after the source and first receiving root.
 *
 * Structural lanes use their native column types. Only fixture construction
 * depends on block types; the assertions exercise the same registered boundary
 * contract. History is cleared before the actual pointer gesture.
 *
 * @param page - Demo owning the source and board roots.
 * @param type - Supported fixture layout; table rows/cells use a separate fixture.
 * @returns Resolves after model insertion; callers wait for the following root's DOM.
 */
async function insertFollowingLayout(page: Page, type: Exclude<Container, "table">) {
  await page.evaluate((type) => {
    const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }).__rivtoDemo
      .editor;
    const leaf = {
      id: "following-child",
      type: type === "todo-storage" ? "todo-item" : "paragraph",
      content: "Child",
    };
    editor.blocks.insertBlock({
      id: "following",
      type: type === "outline" ? "paragraph" : type,
      content: "Following",
      children:
        type === "kanban" || type === "columns"
          ? [
              {
                id: "following-lane",
                type: `${type}-column`,
                content: "Next lane",
                children: [leaf],
              },
            ]
          : [leaf],
    });
    editor.history.clear();
  }, type);
}

for (const mode of ["block", "edgeless"] as const) {
  for (const type of ["outline", "columns", "kanban", "bento", "todo-storage"] as const) {
    test(`outer sibling rims remain reachable in ${type}, ${mode}`, async ({ page }) => {
      await load(page, type, mode);
      await insertFollowingLayout(page, type);
      const board = page.locator('[data-block-id="board"]');
      const following = page.locator('[data-block-id="following"]');
      await following.scrollIntoViewIfNeeded();
      const a = (await board.boundingBox())!;
      const b = (await following.boundingBox())!;
      await startDrag(page);
      const xs = type === "outline" ? [a.x + 4] : [a.x + 4, a.x + a.width / 2, a.x + a.width - 4];
      for (const y of [
        a.y + a.height - 6,
        a.y + a.height - 3,
        a.y + a.height,
        b.y,
        b.y + 3,
        b.y + 6,
      ]) {
        for (const x of xs) {
          await page.mouse.move(x, y);
          await expectBoundaryLine(page);
          const line = (await page.locator(".rivto-block-drop-line:visible").boundingBox())!;
          expect(line.y + line.height / 2).toBeCloseTo((a.y + a.height + b.y) / 2, 1);
          expect(line.x).toBeCloseTo(a.x, 1);
          expect(line.width).toBeCloseTo(a.width, 1);
        }
      }
      await page.mouse.up();
      await expect.poll(() => readRootIds(page)).toEqual(["board", "source", "following"]);
      await expect
        .poll(() => readChildIds(page, "board"))
        .toEqual(type === "kanban" || type === "columns" ? ["lane"] : ["first", "last"]);
      await page.keyboard.press("Control+z");
      await expect.poll(() => readRootIds(page)).toEqual(["source", "board", "following"]);
    });
  }
}

/**
 * Adds a longer neighboring lane without changing the receiving lane's styles.
 *
 * The fixture keeps native header, padding and empty-region geometry and waits
 * for the last neighbor to mount before callers measure the stretched layout.
 *
 * @param page - Demo owning the canonical board fixture.
 * @param type - Board whose native structural column type receives the extra children.
 * @returns Resolves after the tall neighbor's final child is visible.
 */
async function addTallLane(page: Page, type: "columns" | "kanban") {
  await page.evaluate((type) => {
    const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }).__rivtoDemo
      .editor;
    editor.blocks.insertBlock(
      {
        id: "tall-lane",
        type: `${type}-column`,
        content: "Tall lane",
        children: Array.from({ length: 5 }, (_, index) => ({
          id: `tall-${index}`,
          type: "paragraph",
          content: "Tall neighbor",
        })),
      },
      { parentId: "board" },
    );
  }, type);
  await expect(page.locator('[data-block-id="tall-4"]')).toBeVisible();
}

for (const mode of ["block", "edgeless"] as const) {
  for (const type of ["columns", "kanban"] as const) {
    for (const placement of ["before", "after"] as const) {
      test(`stretched lane native ${placement} space in ${type}, ${mode}`, async ({ page }) => {
        const parent = await load(page, type, mode);
        await addTallLane(page, type);
        const lane = page.locator(`[data-block-id="${parent}"]`);
        const visual = type === "columns" ? lane.locator("..") : lane;
        const bounds = (await visual.boundingBox())!;
        const first = (await page.locator('[data-block-id="first"]').boundingBox())!;
        const last = (await page.locator('[data-block-id="last"]').boundingBox())!;
        expect(bounds.y + bounds.height - last.y - last.height).toBeGreaterThan(40);
        await startDrag(page);
        const ys =
          placement === "before"
            ? [first.y + 2, first.y - 4, first.y + 2]
            : [
                last.y + last.height + 4,
                bounds.y + bounds.height - 4,
                (last.y + last.height + bounds.y + bounds.height) / 2,
              ];
        const edge = placement === "before" ? first : last;
        for (const y of ys) {
          await page.mouse.move(edge.x + edge.width / 2, y);
          if (type === "kanban" && placement === "after" && y > last.y + last.height + 16) {
            await expectInsideOutline(page, parent);
            continue;
          }
          await expectBoundaryLine(page);
          const line = (await page.locator(".rivto-block-drop-line:visible").boundingBox())!;
          expect(line.y + line.height / 2).toBeCloseTo(
            placement === "before" ? first.y : last.y + last.height,
            1,
          );
        }
        await page.mouse.up();
        await expect
          .poll(() => readChildIds(page, parent))
          .toEqual(
            placement === "before" ? ["source", "first", "last"] : ["first", "last", "source"],
          );
        await page.keyboard.press("Control+z");
        await expect.poll(() => readChildIds(page, parent)).toEqual(["first", "last"]);
      });
    }
  }
}

for (const mode of ["block", "edgeless"] as const) {
  for (const type of ["columns", "kanban"] as const) {
    test(`empty stretched lane accepts its native background in ${type}, ${mode}`, async ({
      page,
    }) => {
      const parent = await load(page, type, mode);
      await page.evaluate(() => {
        const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
          .__rivtoDemo.editor;
        editor.blocks.removeBlocks(["first", "last"]);
      });
      await addTallLane(page, type);
      const lane = page.locator(`[data-block-id="${parent}"]`);
      const visual = type === "columns" ? lane.locator("..") : lane;
      const box = (await visual.boundingBox())!;
      expect(await lane.boundingBox()).toEqual(box);
      await startDrag(page);
      await page.mouse.move(box.x + box.width / 2, box.y + box.height - 4);
      await expect(lane).toHaveAttribute("data-block-drop-active", "true");
      await page.mouse.up();
      await expect.poll(() => readChildIds(page, parent)).toEqual(["source"]);
      await page.keyboard.press("Control+z");
      await expect.poll(() => readChildIds(page, parent)).toEqual([]);
    });
  }
}

for (const mode of ["block", "edgeless"] as const) {
  for (const type of ["columns", "kanban", "bento", "table", "todo-storage"] as const) {
    test(`container padding inherits all four edges in ${type}, ${mode}`, async ({ page }) => {
      await load(page, type, mode);
      const selectors = {
        columns: ".rivto-columns-children, .rivto-columns-content",
        kanban: ".rivto-kanban-columns",
        bento: ".rivto-bento-tiles",
        table: '[data-block-id="cell"]',
        "todo-storage": ".rivto-todo-storage-children",
      };
      const hosts = page.locator(selectors[type]);
      await expect(hosts.first()).toBeVisible();
      if (type === "kanban") {
        await expect(page.locator(".rivto-kanban-cards")).toHaveCSS("padding", "0px");
      }
      for (const padding of [16, 32, 0]) {
        if (padding !== 16) {
          await page.locator("html").evaluate((element, value) => {
            element.style.setProperty("--rivto-container-padding", `${value}px`);
          }, padding);
        }
        for (const host of await hosts.all()) {
          const actual = await host.evaluate((element) => {
            const style = getComputedStyle(element);
            const controls = element.matches(
              ".rivto-columns-content, .rivto-todo-storage-children",
            );
            return {
              edges: [style.paddingTop, style.paddingRight, style.paddingBottom].map((value) =>
                parseFloat(value),
              ),
              start: parseFloat(style.paddingLeft) - (controls ? 24 : 0),
            };
          });
          expect(actual).toEqual({ edges: [padding, padding, padding], start: padding });
        }
      }
    });
  }
  for (const padding of [16, 32]) {
    test(`Columns has native space above and below its writing blocks at ${padding}px in ${mode}`, async ({
      page,
    }) => {
      const parent = await load(page, "columns", mode);
      if (padding !== 16) {
        await page.locator("html").evaluate((element, value) => {
          element.style.setProperty("--rivto-container-padding", `${value}px`);
        }, padding);
      }
      const host = page.locator(`[data-block-id="${parent}"] > .rivto-columns-content`);
      const box = (await host.boundingBox())!;
      const first = (await page.locator('[data-block-id="first"]').boundingBox())!;
      const last = (await page.locator('[data-block-id="last"]').boundingBox())!;
      expect(first.y - box.y).toBeCloseTo(padding, 1);
      expect(box.y + box.height - last.y - last.height).toBeCloseTo(padding, 1);
      await startDrag(page);
      for (const offset of [padding - 1, padding / 2, 8, 4, 2, 1, 8, padding - 1]) {
        for (const x of [box.x + 12, first.x + first.width / 2, first.x + first.width - 2]) {
          await page.mouse.move(x, first.y - offset);
          const line = await expectBoundaryLine(page);
          expect(line.y + line.height / 2).toBeCloseTo(first.y, 1);
        }
      }
      for (const offset of [1, 4, 8]) {
        await page.mouse.move(last.x + last.width / 2, last.y + last.height + offset);
        const line = await expectBoundaryLine(page);
        expect(line.y + line.height / 2).toBeCloseTo(last.y + last.height, 1);
      }
      await page.mouse.move(last.x + 2, last.y + last.height + 4);
      await page.mouse.up();
      await expect.poll(() => readChildIds(page, parent)).toEqual(["first", "last", "source"]);
      await page.keyboard.press("Control+z");
      await expect.poll(() => readChildIds(page, parent)).toEqual(["first", "last"]);
    });
  }
}

for (const mode of ["block", "edgeless"] as const) {
  for (const rtl of [false, true]) {
    for (const placement of ["before", "after"] as const) {
      test(`horizontal list endpoint in vertical owner ${placement}, RTL=${rtl}, ${mode}`, async ({
        page,
      }) => {
        await load(page, "kanban", mode);
        await page.evaluate(() => {
          const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
            .__rivtoDemo.editor;
          editor.blocks.setBlockType("source", "kanban-column");
          editor.history.clear();
        });
        await expect(page.locator('[data-block-id="source"]')).toHaveAttribute(
          "data-block-type",
          "kanban-column",
        );
        const board = page.locator('[data-block-id="board"]');
        await board.evaluate((element, rtl) => {
          element.style.direction = rtl ? "rtl" : "ltr";
        }, rtl);
        const host = (await board.locator(":scope > .rivto-kanban-columns").boundingBox())!;
        const lane = (await page.locator('[data-block-id="lane"]').boundingBox())!;
        const start = placement === "before";
        const physicalLeft = start !== rtl;
        const edge = physicalLeft ? lane.x : lane.x + lane.width;
        const x = edge + (physicalLeft ? -4 : 4);
        expect(x).toBeGreaterThan(host.x);
        expect(x).toBeLessThan(host.x + host.width);
        await startDrag(page);
        for (const y of [
          lane.y + lane.height / 2,
          lane.y + 2,
          lane.y + lane.height - 2,
          lane.y + lane.height / 2,
        ]) {
          await page.mouse.move(x, y);
          const line = await expectBoundaryLine(page);
          expect(line.x + line.width / 2).toBeCloseTo(edge, 1);
          expect(line.y).toBeCloseTo(lane.y, 1);
          expect(line.height).toBeCloseTo(lane.height, 1);
        }
        await page.mouse.up();
        await expect
          .poll(() => readChildIds(page, "board"))
          .toEqual(start ? ["source", "lane"] : ["lane", "source"]);
        await page.keyboard.press("Control+z");
        await expect.poll(() => readChildIds(page, "board")).toEqual(["lane"]);
      });
    }
  }
}
