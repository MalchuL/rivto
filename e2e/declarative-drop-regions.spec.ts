import { blockDropRegion } from "./drop-regions";
import { expect, test, type Page } from "@playwright/test";
import type { DocumentEditorAPI } from "@chulane/rivto";

type Container = "outline" | "columns" | "kanban" | "bento" | "table" | "todo-storage";

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
      await expect(storageControl ? row : target).toHaveAttribute("data-block-drop-active", "true");
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
    await expect(page.locator(".rivto-block-drop-line:visible")).toHaveCount(1);
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
    await expect(host).toHaveAttribute("data-block-drop-active", "true");
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
          const x = wrapped ? first.x + first.width / 2 : coordinate;
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
    const first = (await page.locator('[data-block-id="first"]').boundingBox())!;
    const last = (await page.locator('[data-block-id="last"]').boundingBox())!;
    const x = first.x + 40;
    const lines: Array<{ x: number; y: number; height: number }> = [];
    for (let y = first.y + first.height - 2; y <= last.y + 2; y += 0.25) {
      await page.mouse.move(x, y);
      const line = page.locator(".rivto-block-drop-line:visible");
      await expect(line).toHaveCount(1);
      const box = (await line.boundingBox())!;
      lines.push(box);
    }
    expect(new Set(lines.map((line) => line.x)).size, "depth must not jump across the gap").toBe(1);
    for (const line of lines) {
      expect(line.y + line.height / 2).toBeCloseTo((first.y + first.height + last.y) / 2, 1);
    }
    const middle = (first.y + first.height + last.y) / 2;
    for (const direction of [1, -1]) {
      const depths: number[] = [];
      for (let offset = 4; offset <= 60; offset += 2) {
        const dx = direction === 1 ? offset : 64 - offset;
        await page.mouse.move(first.x + dx, middle);
        const box = (await page.locator(".rivto-block-drop-line:visible").boundingBox())!;
        expect(box).not.toBeNull();
        expect(box.y + box.height / 2).toBeCloseTo(middle, 1);
        depths.push(box.x);
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

  test(`Bento child placement is inset from the tile content in ${mode}`, async ({ page }) => {
    await load(page, "bento", mode);
    await startDrag(page);
    const tile = page
      .locator('[data-block-id="first"]')
      .locator("xpath=ancestor::*[@data-drop-wrapper-axis][1]");
    const content = (await tile
      .locator(":scope > .rivto-block-drop-wrapper-content")
      .boundingBox())!;
    await page.mouse.move(content.x + content.width / 2, content.y + content.height - 2);
    const line = page.locator(".rivto-block-drop-line:visible");
    await expect(line).toHaveCount(1);
    expect((await line.boundingBox())!.x).toBeCloseTo(content.x + 8, 1);
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
  test(`editor ending space accepts insertion over its full themed height in ${mode}`, async ({
    page,
  }) => {
    await load(page, "outline", mode);
    const occurrence = page
      .locator('[data-block-id="source"]')
      .locator("xpath=ancestor::*[@data-rivto-block-editor][1]");
    const end = occurrence.locator(".rivto-block-editor-end");
    expect((await end.boundingBox())!.height).toBe(48);
    const board = (await page.locator('[data-block-id="board"]').boundingBox())!;
    await occurrence.evaluate((element) =>
      (element as HTMLElement).style.setProperty("--rivto-editor-end-space", "96px"),
    );
    expect((await end.boundingBox())!.height).toBe(96);
    expect(await page.locator('[data-block-id="board"]').boundingBox()).toEqual(board);
    await startDrag(page);
    const box = (await end.boundingBox())!;
    await page.mouse.move(box.x + 12, box.y + box.height - 2);
    const line = page.locator(".rivto-block-drop-line:visible");
    await expect(line).toHaveCount(1);
    const indicator = (await line.boundingBox())!;
    expect(indicator.y + indicator.height / 2).toBeCloseTo(box.y, 1);
    await page.mouse.up();
    await expect
      .poll(() =>
        page.evaluate(() =>
          (
            window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
          ).__rivtoDemo.editor.blocks.getRootIds(),
        ),
      )
      .toEqual(["board", "source"]);
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
          ).__rivtoDemo.editor.blocks.getRootIds(),
        ),
      )
      .toEqual(["source", "board"]);
  });
}
