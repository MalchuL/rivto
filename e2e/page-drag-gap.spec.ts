/**
 * Browser coverage for outline-gap drag targeting.
 *
 * A pointer in the space between two blocks must highlight the nearest
 * sibling, not the nearest fixed layout. Putting a block inside another still
 * requires hovering that block's row, or an empty accepting body.
 *
 * @module
 */
import { expect, test, type Locator, type Page } from "@playwright/test";

const ROW_CLASS = "page-block-row";
const HANDLE_CLASS = "page-drag-handle";
const LINE_CLASS = "page-drop-indicator";
const CHILD_DROP_INDENT = 24;

/**
 * Arms a block handle and holds the pointer at a viewport point.
 *
 * @param page - Browser page owning the editor.
 * @param source - Block whose handle starts the gesture.
 * @param x - Destination viewport X.
 * @param y - Destination viewport Y.
 * @returns Completion after the cursor reaches the destination.
 */
async function holdDragAt(page: Page, source: Locator, x: number, y: number): Promise<void> {
  const handle = source.locator(`:scope > .${ROW_CLASS} .${HANDLE_CLASS}`);
  await source.locator(`:scope > .${ROW_CLASS}`).hover();
  await handle.hover();
  const from = (await handle.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + 8, from.y + 8, { steps: 3 });
  await page.mouse.move(x, y, { steps: 15 });
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    const editor = (window as unknown as {
      __rivtoDemo: { editor: import("@chulane/rivto").RivtoEditorApi };
    }).__rivtoDemo.editor;
    const alpha = editor.blocks.insertBlock({ type: "paragraph", content: "Alpha" }).id;
    const beta = editor.blocks.insertBlock({ type: "paragraph", content: "Beta" }).id;
    const board = editor.blocks.insertBlock({
      type: "kanban",
      content: "Board",
      children: [
        { type: "kanban-column", content: "To do" },
        { type: "kanban-column", content: "Empty" },
      ],
    }).id;
    editor.load({
      ...editor.dump(),
      blocks: [
        editor.blocks.getBlock(alpha)!,
        editor.blocks.getBlock(beta)!,
        editor.blocks.getBlock(board)!,
      ],
      elements: [],
    });
  });
});

test("a gap between outline blocks does not drop inside a later kanban", async ({ page }) => {
  const alpha = page.locator("[data-block-id]").filter({ has: page.getByText("Alpha", { exact: true }) }).first();
  const beta = page.locator("[data-block-id]").filter({ has: page.getByText("Beta", { exact: true }) }).first();
  const board = page.locator('[data-block-type="kanban"]');
  const alphaBox = (await alpha.boundingBox())!;
  const betaBox = (await beta.boundingBox())!;
  await holdDragAt(page, alpha, alphaBox.x + 40, betaBox.y - 4);
  await expect(board).not.toHaveAttribute("data-drop-inside", "true");
  await expect(page.locator("[data-drop-inside]")).toHaveCount(0);
  await expect(page.locator(`.${LINE_CLASS}`)).toBeVisible();
  await page.mouse.up();
});

test("keeps a block in place from the bottom edge of the block above", async ({ page }) => {
  const roots = page.locator(`.page-surface > [data-block-id]`);
  const before = await roots.evaluateAll((blocks) => blocks.map((block) => block.getAttribute("data-block-id")));
  const alpha = roots.filter({ has: page.getByText("Alpha", { exact: true }) });
  const beta = roots.filter({ has: page.getByText("Beta", { exact: true }) });
  const alphaRow = alpha.locator(`:scope > .${ROW_CLASS}`);
  const box = (await alphaRow.boundingBox())!;

  await holdDragAt(page, beta, box.x + CHILD_DROP_INDENT / 2, box.y + box.height - 2);
  const line = page.locator(`.${LINE_CLASS}[data-kind="between"]`);
  await expect(line).toHaveCount(1);
  const lineBox = (await line.boundingBox())!;
  const alphaBox = (await alpha.boundingBox())!;
  expect(lineBox.y + lineBox.height / 2).toBeCloseTo(alphaBox.y + alphaBox.height, 0);
  await page.mouse.up();

  await expect.poll(() => roots.evaluateAll(
    (blocks) => blocks.map((block) => block.getAttribute("data-block-id")),
  )).toEqual(before);
});

test("keeps a block in place from the top edge of the block below", async ({ page }) => {
  const roots = page.locator(`.page-surface > [data-block-id]`);
  const before = await roots.evaluateAll((blocks) => blocks.map((block) => block.getAttribute("data-block-id")));
  const beta = roots.filter({ has: page.getByText("Beta", { exact: true }) });
  const board = page.locator('[data-block-type="kanban"]');
  const boardRow = board.locator(`:scope > .${ROW_CLASS}`);
  const box = (await boardRow.boundingBox())!;

  await holdDragAt(page, beta, box.x + CHILD_DROP_INDENT / 2, box.y + 2);
  const line = page.locator(`.${LINE_CLASS}[data-kind="between"]`);
  await expect(line).toHaveCount(1);
  const lineBox = (await line.boundingBox())!;
  const boardBox = (await board.boundingBox())!;
  expect(lineBox.y + lineBox.height / 2).toBeCloseTo(boardBox.y, 0);
  await page.mouse.up();

  await expect.poll(() => roots.evaluateAll(
    (blocks) => blocks.map((block) => block.getAttribute("data-block-id")),
  )).toEqual(before);
});

test("drops a block after the last root container", async ({ page }) => {
  const roots = page.locator(`.page-surface > [data-block-id]`);
  const alpha = roots.filter({ has: page.getByText("Alpha", { exact: true }) });
  const beta = roots.filter({ has: page.getByText("Beta", { exact: true }) });
  const board = page.locator('[data-block-type="kanban"]');
  const alphaId = await alpha.getAttribute("data-block-id");
  const betaId = await beta.getAttribute("data-block-id");
  const boardId = await board.getAttribute("data-block-id");
  const boardBox = (await board.boundingBox())!;

  await holdDragAt(page, alpha, boardBox.x + CHILD_DROP_INDENT / 2, boardBox.y + boardBox.height + 12);
  const line = page.locator(`.${LINE_CLASS}[data-kind="between"]`);
  await expect(line).toBeVisible();
  const lineBox = (await line.boundingBox())!;
  expect(lineBox.y + lineBox.height / 2).toBeCloseTo(boardBox.y + boardBox.height, 0);
  await page.mouse.up();

  await expect.poll(() => page.evaluate(() => {
    const editor = (window as unknown as {
      __rivtoDemo: { editor: import("@chulane/rivto").RivtoEditorApi };
    }).__rivtoDemo.editor;
    return editor.blocks.getBlocks().map((block) => block.id);
  })).toEqual([betaId, boardId, alphaId]);
});

test("drops a block before the first root container", async ({ page }) => {
  const roots = page.locator(`.page-surface > [data-block-id]`);
  const alpha = roots.filter({ has: page.getByText("Alpha", { exact: true }) });
  const beta = roots.filter({ has: page.getByText("Beta", { exact: true }) });
  const board = page.locator('[data-block-type="kanban"]');
  const alphaId = await alpha.getAttribute("data-block-id");
  const betaId = await beta.getAttribute("data-block-id");
  const boardId = await board.getAttribute("data-block-id");
  await page.evaluate(({ alphaId, betaId, boardId }) => {
    const editor = (window as unknown as {
      __rivtoDemo: { editor: import("@chulane/rivto").RivtoEditorApi };
    }).__rivtoDemo.editor;
    editor.load({
      ...editor.dump(),
      blocks: [boardId, alphaId, betaId].map((id) => editor.blocks.getBlock(id!)!),
      elements: [],
    });
  }, { alphaId, betaId, boardId });
  const boardBox = (await board.boundingBox())!;

  await holdDragAt(page, beta, boardBox.x + CHILD_DROP_INDENT / 2, boardBox.y - 12);
  const line = page.locator(`.${LINE_CLASS}[data-kind="between"]`);
  await expect(line).toBeVisible();
  const lineBox = (await line.boundingBox())!;
  expect(lineBox.y + lineBox.height / 2).toBeCloseTo(boardBox.y, 0);
  await page.mouse.up();

  await expect.poll(() => page.evaluate(() => {
    const editor = (window as unknown as {
      __rivtoDemo: { editor: import("@chulane/rivto").RivtoEditorApi };
    }).__rivtoDemo.editor;
    return editor.blocks.getBlocks().map((block) => block.id);
  })).toEqual([betaId, boardId, alphaId]);
});

const ROOT_CONTAINER_INPUTS = [
  { type: "bento", children: [{ type: "paragraph", content: "Tile" }] },
  { type: "table", children: [{ type: "table-row", children: [{ type: "table-cell" }] }] },
  { type: "columns", children: [{ type: "columns-column" }] },
  { type: "kanban", content: "Board", children: [{ type: "kanban-column" }] },
] as const;

for (const mode of ["block", "edgeless"] as const) {
  test(`drops a container at the Kanban–Columns outer edge in ${mode}`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1000 });
    const ids = await page.evaluate((nextMode) => {
      const editor = (window as unknown as {
        __rivtoDemo: { editor: import("@chulane/rivto").RivtoEditorApi };
      }).__rivtoDemo.editor;
      const holder = editor.blocks.insertBlock({
        type: "paragraph", content: "Holder",
        children: [{ type: "bento", children: [{ type: "paragraph", content: "Move me" }] }],
      }).id;
      const source = editor.blocks.getBlock(holder)!.children[0]!.id;
      const first = editor.blocks.insertBlock({
        type: "kanban", content: "Board", children: [{ type: "kanban-column", content: "Lane" }],
      }).id;
      const second = editor.blocks.insertBlock({ type: "columns", children: [{ type: "columns-column" }] }).id;
      editor.load({ ...editor.dump(), blocks: [holder, first, second].map((id) => editor.blocks.getBlock(id)!), elements: [] });
      if (nextMode === "edgeless") {
        editor.elements.insertElement({
          type: "block", zIndex: 0,
          frame: { x: 20, y: 20, width: 900, height: 650 },
          props: { startBlockId: holder, endBlockId: second },
        });
      }
      return { holder, source, first, second };
    }, mode);
    if (mode === "edgeless") await page.locator('[data-editor-mode="edgeless"]').click();
    const source = page.locator(`[data-block-id="${ids.source}"]`).first();
    await source.scrollIntoViewIfNeeded();
    await source.locator(`:scope > .${ROW_CLASS}`).hover();
    await source.locator(`:scope > .${ROW_CLASS} .${HANDLE_CLASS}`).hover();
    const first = page.locator(`[data-block-id="${ids.first}"]`).first();
    const firstBox = (await first.boundingBox())!;

    await holdDragAt(page, source, firstBox.x + firstBox.width / 2,
      firstBox.y + firstBox.height - 4);
    const line = page.locator(`.${LINE_CLASS}[data-kind="between"]`);
    await expect(line).toBeVisible();
    const lineBox = (await line.boundingBox())!;
    expect(Math.abs(lineBox.y + lineBox.height / 2 - firstBox.y - firstBox.height)).toBeLessThan(9);
    await page.mouse.up();
    await expect.poll(() => page.evaluate(() => {
      const editor = (window as unknown as {
        __rivtoDemo: { editor: import("@chulane/rivto").RivtoEditorApi };
      }).__rivtoDemo.editor;
      return editor.blocks.getRootIds();
    })).toEqual([ids.holder, ids.first, ids.source, ids.second]);
  });
}

test("moves a card out of the demo Kanban into the Kanban–Columns gap", async ({ page }) => {
  await page.goto("/");
  const document = page.locator('[data-journal-document="today"]');
  const board = document.locator('[data-block-type="kanban"]').first();
  const columns = document.locator('[data-block-type="columns"]').first();
  const card = board.locator('[data-block-type="paragraph"]')
    .filter({ hasText: "Drag me between columns or back into the editor" }).first();
  const cardId = await card.getAttribute("data-block-id");
  await card.scrollIntoViewIfNeeded();
  const boardBox = (await board.boundingBox())!;
  const columnsBox = (await columns.boundingBox())!;
  await holdDragAt(page, card, boardBox.x + boardBox.width / 2,
    (boardBox.y + boardBox.height + columnsBox.y) / 2);
  await expect(page.locator(`.${LINE_CLASS}[data-kind="between"]`)).toBeVisible();
  await page.mouse.up();
  await expect.poll(() => page.evaluate((id) => {
    const editor = (window as unknown as {
      __rivtoDemo: { editor: import("@chulane/rivto").RivtoEditorApi };
    }).__rivtoDemo.editor;
    return editor.blocks.getParentId(id!);
  }, cardId)).toBeNull();
});

test("moves a block between the demo TODO storage and Bento", async ({ page }) => {
  await page.goto("/");
  const document = page.locator('[data-journal-document="today"]');
  const storage = document.locator('[data-block-type="todo-storage"]').first();
  const bento = document.locator('[data-block-type="bento"]').first();
  const source = storage.locator('[data-block-type="todo-item"]').last();
  const ids = await page.evaluate(() => {
    const editor = (window as unknown as {
      __rivtoDemo: { editor: import("@chulane/rivto").RivtoEditorApi };
    }).__rivtoDemo.editor;
    const roots = editor.blocks.getRootIds();
    const storageId = roots.find((id) => editor.blocks.getBlock(id)?.type === "todo-storage")!;
    const bentoId = roots.find((id) => editor.blocks.getBlock(id)?.type === "bento")!;
    editor.blocks.moveBlock(bentoId, storageId, "after");
    return { storageId, bentoId };
  });
  const sourceId = await source.getAttribute("data-block-id");
  await source.scrollIntoViewIfNeeded();
  const storageBox = (await storage.boundingBox())!;
  await holdDragAt(page, source, storageBox.x + storageBox.width / 2, storageBox.y + storageBox.height - 4);
  const line = page.locator(`.${LINE_CLASS}[data-kind="between"]`);
  await expect(line).toBeVisible();
  const lineBox = (await line.boundingBox())!;
  expect(Math.abs(lineBox.y + lineBox.height / 2 - storageBox.y - storageBox.height)).toBeLessThan(9);
  await page.mouse.up();
  await expect.poll(() => page.evaluate((id) => {
    const editor = (window as unknown as {
      __rivtoDemo: { editor: import("@chulane/rivto").RivtoEditorApi };
    }).__rivtoDemo.editor;
    return editor.blocks.getRootIds().indexOf(id!);
  }, sourceId)).toBe((await page.evaluate((id) => {
    const editor = (window as unknown as {
      __rivtoDemo: { editor: import("@chulane/rivto").RivtoEditorApi };
    }).__rivtoDemo.editor;
    return editor.blocks.getRootIds().indexOf(id);
  }, ids.storageId)) + 1);
  await expect(bento).toBeVisible();
});

for (const mode of ["block", "edgeless"] as const) {
  for (const container of ROOT_CONTAINER_INPUTS) {
    test(`centers the ${container.type} root gap like an ordinary block in ${mode}`, async ({ page }) => {
      const ids = await page.evaluate(({ input, nextMode }) => {
        const editor = (window as unknown as {
          __rivtoDemo: { editor: import("@chulane/rivto").RivtoEditorApi };
        }).__rivtoDemo.editor;
        const roots = [
          editor.blocks.insertBlock({ id: "gap-source", type: "paragraph", content: "Gap source" }),
          editor.blocks.insertBlock({ id: "gap-markdown", type: "paragraph", content: "Markdown" }),
          editor.blocks.insertBlock({ id: "gap-slider", type: "demo.slider", props: { value: 25 } }),
          editor.blocks.insertBlock({ id: "gap-counter", type: "demo.counter", props: { count: 2 } }),
          editor.blocks.insertBlock({ id: "gap-container", ...input }),
          editor.blocks.insertBlock({ id: "gap-after", type: "paragraph", content: "After container" }),
        ].map((block) => block.id);
        editor.load({ ...editor.dump(), blocks: roots.map((id) => editor.blocks.getBlock(id)!), elements: [] });
        if (nextMode === "edgeless") {
          editor.elements.insertElement({
            type: "block",
            zIndex: 0,
            frame: { x: 20, y: 20, width: 900, height: 1200 },
            props: { startBlockId: roots[0]!, endBlockId: roots.at(-1)! },
          });
        }
        return roots;
      }, { input: container, nextMode: mode });
      if (mode === "edgeless") await page.locator('[data-editor-mode="edgeless"]').click();

      const source = page.locator(`[data-block-id="${ids[0]}"]`).first();
      const previous = page.locator(`[data-block-id="${ids[3]}"]`).first();
      const next = page.locator(`[data-block-id="${ids[4]}"]`).first();
      const previousBox = (await previous.boundingBox())!;
      const nextBox = (await next.boundingBox())!;
      const gapY = (previousBox.y + previousBox.height + nextBox.y) / 2;
      await holdDragAt(page, source, previousBox.x + CHILD_DROP_INDENT / 2, gapY);

      const line = page.locator(`.${LINE_CLASS}[data-kind="between"]`);
      await expect(line).toHaveAttribute("data-axis", "horizontal");
      const lineBox = (await line.boundingBox())!;
      expect(lineBox.y + lineBox.height / 2).toBeCloseTo(gapY, 0);
      expect(lineBox.x).toBeCloseTo(previousBox.x, 0);
      expect(lineBox.width).toBeCloseTo(previousBox.width, 0);
      await page.mouse.up();
      await expect.poll(() => page.evaluate(() => {
        const editor = (window as unknown as {
          __rivtoDemo: { editor: import("@chulane/rivto").RivtoEditorApi };
        }).__rivtoDemo.editor;
        return editor.blocks.getRootIds();
      })).toEqual([ids[1], ids[2], ids[3], ids[0], ids[4], ids[5]]);
    });
  }
}

test("hovering a row body still puts the drop inside that block", async ({ page }) => {
  const alpha = page.locator("[data-block-id]").filter({ has: page.getByText("Alpha", { exact: true }) }).first();
  const beta = page.locator("[data-block-id]").filter({ has: page.getByText("Beta", { exact: true }) }).first();
  const betaRow = beta.locator(`:scope > .${ROW_CLASS}`);
  const box = (await betaRow.boundingBox())!;
  await holdDragAt(page, alpha, box.x + box.width / 2, box.y + box.height / 2);
  await expect(betaRow).toHaveAttribute("data-drop-inside", "true");
  const indicator = betaRow.locator(`:scope > .${LINE_CLASS}[data-kind='inside']`);
  await expect(indicator).toHaveCSS("outline-width", "4px");
  await expect(page.locator('[data-block-type="kanban"]')).not.toHaveAttribute("data-drop-inside", "true");
  await page.mouse.up();
});

test("hovering a block in a free container nests inside that block", async ({ page }) => {
  const alpha = page.locator("[data-block-id]").filter({ has: page.getByText("Alpha", { exact: true }) }).first();
  const beta = page.locator("[data-block-id]").filter({ has: page.getByText("Beta", { exact: true }) }).first();
  const alphaId = await alpha.getAttribute("data-block-id");
  const betaId = await beta.getAttribute("data-block-id");
  const columnId = await page.locator('[data-block-type="kanban-column"]').first().getAttribute("data-block-id");
  await page.evaluate(({ alphaId, betaId, columnId }) => {
    const editor = (window as unknown as {
      __rivtoDemo: { editor: import("@chulane/rivto").RivtoEditorApi };
    }).__rivtoDemo.editor;
    editor.blocks.moveBlocks([alphaId!, betaId!], columnId!, "inside");
  }, { alphaId, betaId, columnId });

  const nestedAlpha = page.locator(`[data-block-id="${alphaId}"]`);
  const nestedBeta = page.locator(`[data-block-id="${betaId}"]`);
  const betaRow = nestedBeta.locator(`:scope > .${ROW_CLASS}`);
  const box = (await betaRow.boundingBox())!;
  await holdDragAt(page, nestedAlpha, box.x + box.width / 2, box.y + box.height / 2);
  await expect(betaRow).toHaveAttribute("data-drop-inside", "true");
  await page.mouse.up();
  await expect.poll(() => page.evaluate(({ sourceId }) => {
    const editor = (window as unknown as {
      __rivtoDemo: { editor: import("@chulane/rivto").RivtoEditorApi };
    }).__rivtoDemo.editor;
    return editor.blocks.getParentId(sourceId!);
  }, { sourceId: alphaId })).toBe(betaId);
});

test("an empty kanban column still accepts an inside drop on its body", async ({ page }) => {
  const alpha = page.locator("[data-block-id]").filter({ has: page.getByText("Alpha", { exact: true }) }).first();
  const empty = page.locator('[data-block-type="kanban-column"]').nth(1);
  const alphaId = await alpha.getAttribute("data-block-id");
  const emptyId = await empty.getAttribute("data-block-id");
  const box = (await empty.boundingBox())!;
  await holdDragAt(page, alpha, box.x + box.width / 2, box.y + box.height * 0.7);
  await expect(empty).toHaveAttribute("data-drop-inside", "true");
  await page.mouse.up();
  await expect.poll(() => page.evaluate(({ sourceId }) => {
    const editor = (window as unknown as {
      __rivtoDemo: { editor: import("@chulane/rivto").RivtoEditorApi };
    }).__rivtoDemo.editor;
    return sourceId ? editor.blocks.getParentId(sourceId) : undefined;
  }, { sourceId: alphaId })).toBe(emptyId);
});

test("dragging onto a kanban title does not insert a column or paint a board-sized line", async ({ page }) => {
  const alpha = page.locator("[data-block-id]").filter({ has: page.getByText("Alpha", { exact: true }) }).first();
  const board = page.locator('[data-block-type="kanban"]');
  const title = board.locator(`:scope > .${ROW_CLASS}`);
  const box = (await title.boundingBox())!;
  await holdDragAt(page, alpha, box.x + box.width / 2, box.y + box.height / 2);
  await expect(board).not.toHaveAttribute("data-drop-inside", "true");
  const line = page.locator(`.${LINE_CLASS}`);
  await expect(line).toBeVisible();
  const lineBox = (await line.boundingBox())!;
  expect(lineBox.height).toBe(4);
  await expect(line).toHaveAttribute("data-axis", "horizontal");
  await page.mouse.up();
  await expect(page.locator('[data-block-type="kanban-column"]')).toHaveCount(2);
  await expect(page.locator("[data-block-id]").filter({ has: page.getByText("Alpha", { exact: true }) }))
    .not.toHaveAttribute("data-block-type", "kanban-column");
});

for (const mode of ["block", "edgeless"] as const) {
  test(`appends after final nested subtrees in ordinary and free container outlines in ${mode}`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1000 });
    const ids = await page.evaluate((nextMode) => {
      const editor = (window as unknown as {
        __rivtoDemo: { editor: import("@chulane/rivto").RivtoEditorApi };
      }).__rivtoDemo.editor;
      const inputs = [
        { type: "paragraph", content: "Ordinary source" },
        {
          type: "paragraph",
          content: "Ordinary final",
          children: [{ type: "paragraph", content: "Ordinary nested" }],
        },
        { type: "paragraph", content: "Kanban source" },
        {
          type: "kanban",
          content: "End-gap kanban",
          children: [{
            type: "kanban-column",
            content: "End-gap lane",
            children: [{
              type: "paragraph",
              content: "Kanban final",
              children: [{ type: "paragraph", content: "Kanban nested" }],
            }],
          }],
        },
        { type: "paragraph", content: "Columns source" },
        {
          type: "columns",
          children: [{
            type: "columns-column",
            children: [{
              type: "paragraph",
              content: "Columns final",
              children: [{ type: "paragraph", content: "Columns nested" }],
            }],
          }],
        },
      ];
      const roots = inputs.map((input) => editor.blocks.insertBlock(input).id);
      editor.load({
        ...editor.dump(),
        blocks: roots.map((id) => editor.blocks.getBlock(id)!),
        elements: [],
      });
      if (nextMode === "edgeless") {
        editor.elements.insertElement({
          type: "block",
          zIndex: 0,
          frame: { x: 20, y: 20, width: 1100, height: 850 },
          props: { startBlockId: roots[0]!, endBlockId: roots.at(-1)! },
        });
      }
      const all = editor.blocks.getBlocks().flatMap(function walk(block): typeof block[] {
        return [block, ...block.children.flatMap(walk)];
      });
      const id = (content: string) => all.find((block) => block.content === content)!.id;
      return {
        ordinarySource: id("Ordinary source"),
        ordinaryNested: id("Ordinary nested"),
        kanbanSource: id("Kanban source"),
        kanbanNested: id("Kanban nested"),
        kanbanLane: id("End-gap lane"),
        columnsSource: id("Columns source"),
        columnsNested: id("Columns nested"),
        columnsLane: all.find((block) => block.type === "columns-column")!.id,
      };
    }, mode);
    if (mode === "edgeless") await page.locator('[data-editor-mode="edgeless"]').click();

    const cases = [
      { source: ids.ordinarySource, nested: ids.ordinaryNested, expectedParent: null },
      { source: ids.kanbanSource, nested: ids.kanbanNested, expectedParent: ids.kanbanLane },
      { source: ids.columnsSource, nested: ids.columnsNested, expectedParent: ids.columnsLane },
    ];
    for (const dragCase of cases) {
      const source = page.locator(`[data-block-id="${dragCase.source}"]`).first();
      const nestedRow = page.locator(`[data-block-id="${dragCase.nested}"] > .${ROW_CLASS}`).first();
      await nestedRow.scrollIntoViewIfNeeded();
      const box = (await nestedRow.boundingBox())!;
      await holdDragAt(
        page,
        source,
        box.x - CHILD_DROP_INDENT / 2,
        box.y + box.height - 2,
      );
      await expect(page.locator(`.${LINE_CLASS}[data-kind="between"]`)).toBeVisible();
      await page.mouse.up();
      await expect.poll(() => page.evaluate((sourceId) => {
        const editor = (window as unknown as {
          __rivtoDemo: { editor: import("@chulane/rivto").RivtoEditorApi };
        }).__rivtoDemo.editor;
        return editor.blocks.getParentId(sourceId);
      }, dragCase.source)).toBe(dragCase.expectedParent);
    }
  });
}
