import { expect, test } from "@playwright/test";

const containers = [
  { type: "kanban", content: "Board", children: [{ type: "kanban-column", content: "Lane" }] },
  { type: "todo-storage", children: [{ type: "paragraph", content: "Stored" }] },
  { type: "bento", children: [{ type: "paragraph", content: "Tile" }] },
  { type: "columns", children: [{ type: "columns-column" }] },
  { type: "table", children: [{ type: "table-row", children: [{ type: "table-cell" }] }] },
] as const;

for (const mode of ["block", "edgeless"] as const) {
  for (const container of containers) {
    for (const child of [false, true]) {
      test(`gap above ${container.type} places a ${child ? "child" : "sibling"} in ${mode}`, async ({ page }) => {
        await page.goto("/");
        const ids = await page.evaluate(({ input, nextMode }) => {
          const editor = (window as unknown as {
            __rivtoDemo: { editor: import("@chulane/rivto").RivtoEditorApi };
          }).__rivtoDemo.editor;
          const source = editor.blocks.insertBlock({ type: "paragraph", content: "Source" }).id;
          const upper = editor.blocks.insertBlock({ type: "paragraph", content: "Upper" }).id;
          const lower = editor.blocks.insertBlock(input).id;
          editor.load({ ...editor.dump(), blocks: [source, upper, lower].map((id) => editor.blocks.getBlock(id)!), elements: [] });
          if (nextMode === "edgeless") {
            editor.elements.insertElement({
              type: "block", zIndex: 0,
              frame: { x: 20, y: 20, width: 900, height: 800 },
              props: { startBlockId: source, endBlockId: lower },
            });
          }
          return { source, upper, lower };
        }, { input: container, nextMode: mode });
        if (mode === "edgeless") await page.locator('[data-editor-mode="edgeless"]').click();
        const source = page.locator(`[data-block-id="${ids.source}"]`).first();
        const handle = source.locator(":scope > .page-block-row .page-drag-handle");
        await source.locator(":scope > .page-block-row").hover();
        await handle.hover();
        const from = (await handle.boundingBox())!;
        const lower = page.locator(`[data-block-id="${ids.lower}"]`).first();
        const box = (await lower.boundingBox())!;
        const upper = (await page.locator(`[data-block-id="${ids.upper}"]`).first().boundingBox())!;
        await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
        await page.mouse.down();
        await page.mouse.move(from.x + 8, from.y + 8, { steps: 3 });
        for (const offset of [-1, 1, -1]) {
          await page.mouse.move(upper.x + (child ? 36 : 12), box.y + offset, { steps: 15 });
          await expect(lower).not.toHaveAttribute("data-drop-inside", "true");
          await expect(page.locator('.page-drop-indicator[data-kind="between"]')).toBeVisible();
        }
        await page.mouse.up();
        await expect.poll(() => page.evaluate(() => {
          const editor = (window as unknown as {
            __rivtoDemo: { editor: import("@chulane/rivto").RivtoEditorApi };
          }).__rivtoDemo.editor;
          return editor.blocks.getRootIds();
        })).toEqual(child ? [ids.upper, ids.lower] : [ids.upper, ids.source, ids.lower]);
        await expect.poll(() => page.evaluate((id) => (window as unknown as {
          __rivtoDemo: { editor: import("@chulane/rivto").RivtoEditorApi };
        }).__rivtoDemo.editor.blocks.getParentId(id), ids.source)).toBe(child ? ids.upper : null);
      });
    }
  }
}

for (const mode of ["block", "edgeless"] as const) {
  test(`keeps nested container neighbors throughout a boundary sweep in ${mode}`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.goto("/");
    const ids = await page.evaluate((nextMode) => {
      const editor = (window as unknown as { __rivtoDemo: { editor: import("@chulane/rivto").RivtoEditorApi } }).__rivtoDemo.editor;
      const source = editor.blocks.insertBlock({ type: "paragraph", content: "Source" }).id;
      const parent = editor.blocks.insertBlock({ type: "paragraph", content: "Parent", children: [
        { type: "columns", children: [{ type: "columns-column", children: [{ type: "paragraph", content: "First" }] }] },
        { type: "kanban", children: [{ type: "kanban-column", content: "Second" }] },
        { type: "columns", children: [{ type: "columns-column" }] },
      ] }).id;
      editor.load({ ...editor.dump(), blocks: [source, parent].map((id) => editor.blocks.getBlock(id)!), elements: [] });
      if (nextMode === "edgeless") editor.elements.insertElement({ type: "block", zIndex: 0,
        frame: { x: 20, y: 20, width: 950, height: 850 }, props: { startBlockId: source, endBlockId: parent } });
      return { source, parent, siblings: editor.blocks.getBlock(parent)!.children.map(({ id }) => id) };
    }, mode);
    if (mode === "edgeless") {
      await page.locator('[data-editor-mode="edgeless"]').click();
      await page.getByRole("button", { name: "Zoom out", exact: true }).click();
      await page.getByRole("button", { name: "Zoom out", exact: true }).click();
    }
    const first = page.locator(`[data-block-id="${ids.siblings[0]}"]`).first();
    const second = page.locator(`[data-block-id="${ids.siblings[1]}"]`).first();
    const handle = page.locator(`[data-block-id="${ids.source}"] > .page-block-row .page-drag-handle`).first();
    await page.locator(`[data-block-id="${ids.source}"] > .page-block-row`).first().hover();
    await handle.hover();
    const a = (await first.boundingBox())!;
    const b = (await second.boundingBox())!;
    await page.mouse.down();
    await page.mouse.move(a.x + a.width / 2, a.y + a.height - 4, { steps: 12 });
    const line = page.locator('.page-drop-indicator[data-kind="between"]');
    for (let y = a.y + a.height - 4; y <= b.y + 4; y++) {
      await page.mouse.move(a.x + a.width / 2, y);
      await expect(line).toBeVisible();
      const box = (await line.boundingBox())!;
      expect(box.y + box.height / 2).toBeCloseTo((a.y + a.height + b.y) / 2, 0);
    }
    await page.mouse.up();
    await expect.poll(() => page.evaluate((parent) => {
      const editor = (window as unknown as { __rivtoDemo: { editor: import("@chulane/rivto").RivtoEditorApi } }).__rivtoDemo.editor;
      return editor.blocks.getBlock(parent)!.children.map(({ id }) => id);
    }, ids.parent)).toEqual([ids.siblings[0], ids.source, ...ids.siblings.slice(1)]);
    await page.evaluate(() => (window as unknown as { __rivtoDemo: { editor: import("@chulane/rivto").RivtoEditorApi } }).__rivtoDemo.editor.history.undo());
    await expect.poll(() => page.evaluate((source) => (window as unknown as {
      __rivtoDemo: { editor: import("@chulane/rivto").RivtoEditorApi };
    }).__rivtoDemo.editor.blocks.getParentId(source), ids.source)).toBeNull();
  });

  for (const type of ["kanban", "columns"] as const) {
    test(`${type} background rejects content without inventing a column in ${mode}`, async ({ page }) => {
      await page.goto("/");
      const ids = await page.evaluate(({ type, mode }) => {
        const editor = (window as unknown as { __rivtoDemo: { editor: import("@chulane/rivto").RivtoEditorApi } }).__rivtoDemo.editor;
        const source = editor.blocks.insertBlock({ type: "paragraph", content: "Source" }).id;
        const board = editor.blocks.insertBlock({ type, children: [
          { type: type === "kanban" ? "kanban-column" : "columns-column", content: "Left" },
          { type: type === "kanban" ? "kanban-column" : "columns-column", content: "Right" },
        ] }).id;
        editor.load({ ...editor.dump(), blocks: [source, board].map((id) => editor.blocks.getBlock(id)!), elements: [] });
        if (mode === "edgeless") editor.elements.insertElement({ type: "block", zIndex: 0,
          frame: { x: 20, y: 20, width: 950, height: 700 }, props: { startBlockId: source, endBlockId: board } });
        return { source, board, lanes: editor.blocks.getBlock(board)!.children.map(({ id }) => id) };
      }, { type, mode });
      if (mode === "edgeless") await page.locator('[data-editor-mode="edgeless"]').click();
      const left = (await page.locator(`[data-block-id="${ids.lanes[0]}"]`).first().boundingBox())!;
      const right = (await page.locator(`[data-block-id="${ids.lanes[1]}"]`).first().boundingBox())!;
      const handle = page.locator(`[data-block-id="${ids.source}"] > .page-block-row .page-drag-handle`).first();
      await page.locator(`[data-block-id="${ids.source}"] > .page-block-row`).first().hover();
      await handle.hover();
      await page.mouse.down();
      await page.mouse.move((left.x + left.width + right.x) / 2, left.y + left.height / 2, { steps: 15 });
      await expect(page.locator(".page-drop-indicator")).toHaveCount(0);
      await page.mouse.up();
      expect(await page.evaluate(({ source, board }) => {
        const editor = (window as unknown as { __rivtoDemo: { editor: import("@chulane/rivto").RivtoEditorApi } }).__rivtoDemo.editor;
        return { parent: editor.blocks.getParentId(source), children: editor.blocks.getBlock(board)!.children.map(({ id }) => id) };
      }, ids)).toEqual({ parent: null, children: ids.lanes });
    });
  }
}
