import { ROOT_BLOCK_SELECTOR } from "./dom-markers";
/**
 * Browser coverage for outline-gap drag targeting.
 *
 * A pointer in the space between two blocks must highlight the nearest
 * sibling, not the nearest fixed layout. Putting a block inside another still
 * requires hovering that block's row, or an empty accepting body.
 *
 * @module
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import type { EditorSnapshot, DocumentEditorAPI } from "@chulane/rivto";

import { BLOCK_ROW_SELECTOR } from "./dom-markers";
const HANDLE_CLASS = "block-handle";
/** Visible insertion feedback shared by Page and Edgeless block cards. */
const DROP_LINE_SELECTOR = ".rivto-block-drop-line:visible";
const CHILD_DROP_INDENT = 24;
const REPORT_PARENT_ID = "a7666f59-e2f6-4b4e-8103-dc7225fdc94c";
const REPORT_LEVEL_2_ID = "a0609823-81b4-41bb-85cd-a6dbb4a11fbb";
const REPORT_LEVEL_3_ID = "bbbb25e5-6e92-49c9-89d4-c7fba0a7cf60";
const REPORT_LEVEL_4_ID = "f081611e-de2f-43de-a1fb-7c8e53ff89db";
const REPORT_LEVEL_3_NEXT_ID = "c9cb55d9-9d24-4db2-a66b-8946ba7a6c44";
const REPORT_NEXT_ID = "9f1718c1-f0db-4bfb-b127-29874f2711e1";
const REPORT_ANOTHER_ID = "fe679c9a-de62-4d8c-a77b-356774bc7c2d";

/**
 * Arms a block handle and holds the pointer at a viewport point.
 *
 * @param page - Browser page owning the editor.
 * @param source - Block whose handle starts the gesture.
 * @param x - Destination viewport X, or a callback measuring the destination
 * after activation and painting previously skipped content have settled. Callback
 * targets are reached in one native move because their scrolling can invalidate
 * the intermediate path from the pointer's previous viewport position.
 * @param y - Destination viewport Y when X is supplied as a number.
 * @returns Completion after the cursor reaches the destination.
 */
async function holdDragAt(
  page: Page,
  source: Locator,
  x: number | (() => Promise<{ x: number; y: number }>),
  y?: number,
): Promise<void> {
  const handle = source.locator(`:scope > ${BLOCK_ROW_SELECTOR} .${HANDLE_CLASS}`);
  const row = source.locator(`:scope > ${BLOCK_ROW_SELECTOR}`);
  await row.scrollIntoViewIfNeeded();
  if (await row.evaluate((element) => getComputedStyle(element).pointerEvents === "none")) {
    const box = (await source.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + 1);
  } else {
    await row.hover();
  }
  await handle.hover();
  await expect(handle).toHaveAttribute("aria-roledescription", "draggable");
  const from = (await handle.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + 8, from.y + 8, { steps: 3 });
  if (typeof x === "function") {
    // Stop edge scrolling before the callback scrolls and measures its target.
    const viewport = page.viewportSize()!;
    await page.mouse.move(from.x + from.width / 2, viewport.height / 2);
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
  }
  const point = typeof x === "function" ? await x() : { x, y: y! };
  await page.mouse.move(point.x, point.y, { steps: typeof x === "function" ? 1 : 15 });
}

/**
 * Loads the captured single-child Review report into the active demo editor.
 *
 * @param page - Browser page owning the editor.
 * @returns Completion after the native v6 snapshot is loaded.
 */
async function loadSingleChildReport(page: Page): Promise<void> {
  const snapshot = JSON.parse(
    await readFile(
      resolve(process.cwd(), "e2e/fixtures/single-nested-block-drag.snapshot.json"),
      "utf8",
    ),
  ) as EditorSnapshot;
  await page.evaluate((value) => {
    const editor = (
      window as unknown as {
        __rivtoDemo: { editor: DocumentEditorAPI };
      }
    ).__rivtoDemo.editor;
    editor.load(value);
  }, snapshot);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    const editor = (
      window as unknown as {
        __rivtoDemo: { editor: DocumentEditorAPI };
      }
    ).__rivtoDemo.editor;
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
      rootElementIds: [],
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
  const alpha = page
    .locator("[data-block-id]")
    .filter({ has: page.getByText("Alpha", { exact: true }) })
    .first();
  const beta = page
    .locator("[data-block-id]")
    .filter({ has: page.getByText("Beta", { exact: true }) })
    .first();
  const board = page.locator('[data-block-type="kanban"]');
  const alphaBox = (await alpha.boundingBox())!;
  const betaBox = (await beta.boundingBox())!;
  await holdDragAt(page, alpha, alphaBox.x + CHILD_DROP_INDENT / 2, betaBox.y - 2);
  await expect(board).not.toHaveAttribute("data-block-drop-active", "true");
  await expect(page.locator('[data-block-drop-active="true"]')).toHaveCount(0);
  await expect(page.locator(".rivto-block-drop-line:visible")).toBeVisible();
  await page.mouse.up();
});

test("keeps a block in place from the bottom edge of the block above", async ({ page }) => {
  const roots = page.locator(`.page-surface ${ROOT_BLOCK_SELECTOR}`);
  await expect(roots.first()).toBeVisible();
  const before = await roots.evaluateAll((blocks) =>
    blocks.map((block) => block.getAttribute("data-block-id")),
  );
  const alpha = roots.filter({ has: page.getByText("Alpha", { exact: true }) });
  const beta = roots.filter({ has: page.getByText("Beta", { exact: true }) });
  const alphaRow = alpha.locator(`:scope > ${BLOCK_ROW_SELECTOR}`);
  const box = (await alphaRow.boundingBox())!;

  await holdDragAt(page, beta, box.x + CHILD_DROP_INDENT / 2, box.y + box.height - 2);
  const line = page.locator(".rivto-block-drop-line:visible");
  await expect(line).toHaveCount(1);
  const lineBox = (await line.boundingBox())!;
  const alphaBox = (await alpha.boundingBox())!;
  expect(lineBox.y + lineBox.height / 2).toBeCloseTo(
    (alphaBox.y + alphaBox.height + (await beta.boundingBox())!.y) / 2,
    0,
  );
  await page.mouse.up();

  await expect
    .poll(() =>
      roots.evaluateAll((blocks) => blocks.map((block) => block.getAttribute("data-block-id"))),
    )
    .toEqual(before);
});

test("keeps a block in place from the top edge of the block below", async ({ page }) => {
  const roots = page.locator(`.page-surface ${ROOT_BLOCK_SELECTOR}`);
  await expect(roots.first()).toBeVisible();
  const before = await roots.evaluateAll((blocks) =>
    blocks.map((block) => block.getAttribute("data-block-id")),
  );
  const beta = roots.filter({ has: page.getByText("Beta", { exact: true }) });
  const board = page.locator('[data-block-type="kanban"]');
  const boardRow = board.locator(`:scope > ${BLOCK_ROW_SELECTOR}`);
  const box = (await boardRow.boundingBox())!;

  await holdDragAt(page, beta, box.x + CHILD_DROP_INDENT / 2, box.y + 2);
  const line = page.locator(".rivto-block-drop-line:visible");
  await expect(line).toHaveCount(1);
  const lineBox = (await line.boundingBox())!;
  const boardBox = (await board.boundingBox())!;
  expect(lineBox.y + lineBox.height / 2).toBeCloseTo(
    ((await beta.boundingBox())!.y + (await beta.boundingBox())!.height + boardBox.y) / 2,
    0,
  );
  await page.mouse.up();

  await expect
    .poll(() =>
      roots.evaluateAll((blocks) => blocks.map((block) => block.getAttribute("data-block-id"))),
    )
    .toEqual(before);
});

test("drops a block after the last root container", async ({ page }) => {
  const roots = page.locator(`.page-surface ${ROOT_BLOCK_SELECTOR}`);
  const alpha = roots.filter({ has: page.getByText("Alpha", { exact: true }) });
  const beta = roots.filter({ has: page.getByText("Beta", { exact: true }) });
  const board = page.locator('[data-block-type="kanban"]');
  const alphaId = await alpha.getAttribute("data-block-id");
  const betaId = await beta.getAttribute("data-block-id");
  const boardId = await board.getAttribute("data-block-id");
  await holdDragAt(page, alpha, async () => {
    const boardBox = (await board.boundingBox())!;
    return { x: boardBox.x + CHILD_DROP_INDENT / 2, y: boardBox.y + boardBox.height + 12 };
  });
  const line = page.locator(".rivto-block-drop-line:visible");
  await expect(line).toBeVisible();
  const { lineBox, currentBoardBox } = await page.evaluate((id) => {
    const lineBox = document
      .querySelector(".rivto-block-drop-line")!
      .getBoundingClientRect()
      .toJSON();
    const currentBoardBox = document
      .querySelector(`[data-block-id="${id}"]`)!
      .getBoundingClientRect()
      .toJSON();
    return { lineBox, currentBoardBox };
  }, boardId);
  expect(lineBox.y + lineBox.height / 2).toBeCloseTo(currentBoardBox.y + currentBoardBox.height, 0);
  await page.mouse.up();

  await expect
    .poll(() =>
      page.evaluate(() => {
        const editor = (
          window as unknown as {
            __rivtoDemo: { editor: DocumentEditorAPI };
          }
        ).__rivtoDemo.editor;
        return editor.blocks.getBlocks().map((block) => block.id);
      }),
    )
    .toEqual([betaId, boardId, alphaId]);
});

test("uses the final pointer event for feedback and the committed destination", async ({
  page,
}) => {
  const alpha = page
    .locator("[data-block-id]")
    .filter({ has: page.getByText("Alpha", { exact: true }) })
    .first();
  const beta = page
    .locator("[data-block-id]")
    .filter({ has: page.getByText("Beta", { exact: true }) })
    .first();
  const row = beta.locator(`:scope > ${BLOCK_ROW_SELECTOR}`);
  const box = (await row.boundingBox())!;
  await holdDragAt(page, alpha, box.x + box.width / 2, box.y + 2);
  // One final event must replace the earlier sibling-gap destination with the row body.
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await expect(row.locator("xpath=ancestor::*[@data-block-id][1]")).toHaveAttribute(
    "data-block-drop-active",
    "true",
  );
  await page.mouse.up();
  await expect(
    beta.locator("[data-block-id]").filter({ has: page.getByText("Alpha", { exact: true }) }),
  ).toHaveCount(1);
});

test("drops a block before the first root container", async ({ page }) => {
  const roots = page.locator(`.page-surface ${ROOT_BLOCK_SELECTOR}`);
  const alpha = roots.filter({ has: page.getByText("Alpha", { exact: true }) });
  const beta = roots.filter({ has: page.getByText("Beta", { exact: true }) });
  const board = page.locator('[data-block-type="kanban"]');
  const alphaId = await alpha.getAttribute("data-block-id");
  const betaId = await beta.getAttribute("data-block-id");
  const boardId = await board.getAttribute("data-block-id");
  await page.evaluate(
    ({ alphaId, betaId, boardId }) => {
      const editor = (
        window as unknown as {
          __rivtoDemo: { editor: DocumentEditorAPI };
        }
      ).__rivtoDemo.editor;
      editor.load({
        ...editor.dump(),
        rootElementIds: [],
        blocks: [boardId, alphaId, betaId].map((id) => editor.blocks.getBlock(id!)!),
        elements: [],
      });
    },
    { alphaId, betaId, boardId },
  );
  await holdDragAt(page, beta, async () => {
    const current = (await board.boundingBox())!;
    return { x: current.x + CHILD_DROP_INDENT / 2, y: current.y - 12 };
  });
  const line = page.locator(".rivto-block-drop-line:visible");
  await expect(line).toBeVisible();
  const lineBox = (await line.boundingBox())!;
  expect(lineBox.y + lineBox.height / 2).toBeCloseTo((await board.boundingBox())!.y, 0);
  await page.mouse.up();

  await expect
    .poll(() =>
      page.evaluate(() => {
        const editor = (
          window as unknown as {
            __rivtoDemo: { editor: DocumentEditorAPI };
          }
        ).__rivtoDemo.editor;
        return editor.blocks.getBlocks().map((block) => block.id);
      }),
    )
    .toEqual([betaId, boardId, alphaId]);
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
      const editor = (
        window as unknown as {
          __rivtoDemo: { editor: DocumentEditorAPI };
        }
      ).__rivtoDemo.editor;
      const holder = editor.blocks.insertBlock({
        type: "paragraph",
        content: "Holder",
        children: [{ type: "bento", children: [{ type: "paragraph", content: "Move me" }] }],
      }).id;
      const source = editor.blocks.getBlock(holder)!.children[0]!.id;
      const first = editor.blocks.insertBlock({
        type: "kanban",
        content: "Board",
        children: [{ type: "kanban-column", content: "Lane" }],
      }).id;
      const second = editor.blocks.insertBlock({
        type: "columns",
        children: [{ type: "columns-column" }],
      }).id;
      editor.load({
        ...editor.dump(),
        rootElementIds: [],
        blocks: [holder, first, second].map((id) => editor.blocks.getBlock(id)!),
        elements: [],
      });
      if (nextMode === "edgeless") {
        editor.elements.insertElement({
          type: "block",
          zIndex: 0,
          frame: { x: 20, y: 20, width: 900, height: 650 },
          props: { startBlockId: holder, endBlockId: second },
        });
      }
      return { holder, source, first, second };
    }, mode);
    if (mode === "edgeless") {
      await page.locator('[data-editor-mode="edgeless"]').click();
    }
    const source = page.locator(`[data-block-id="${ids.source}"]`).first();
    await source.scrollIntoViewIfNeeded();
    const sourceBox = (await source.boundingBox())!;
    await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + 1);
    await source.locator(`:scope > ${BLOCK_ROW_SELECTOR} .${HANDLE_CLASS}`).hover();
    const first = page.locator(`[data-block-id="${ids.first}"]`).first();
    const firstBox = (await first.boundingBox())!;

    await holdDragAt(
      page,
      source,
      firstBox.x + firstBox.width / 2,
      firstBox.y + firstBox.height - 4,
    );
    const line = page.locator(DROP_LINE_SELECTOR);
    await expect(line).toBeVisible();
    const lineBox = (await line.boundingBox())!;
    expect(Math.abs(lineBox.y + lineBox.height / 2 - firstBox.y - firstBox.height)).toBeLessThan(9);
    await page.mouse.up();
    await expect
      .poll(() =>
        page.evaluate(() => {
          const editor = (
            window as unknown as {
              __rivtoDemo: { editor: DocumentEditorAPI };
            }
          ).__rivtoDemo.editor;
          return editor.blocks.getRootIds();
        }),
      )
      .toEqual([ids.holder, ids.first, ids.source, ids.second]);
  });
}

test("moves a card out of the demo Kanban into the Kanban–Columns gap", async ({ page }) => {
  await page.goto("/");
  const document = page.locator('[data-journal-document="today"]');
  const board = document.locator('[data-block-type="kanban"]').first();
  const columns = document.locator('[data-block-type="columns"]').first();
  const card = board
    .locator('[data-block-type="paragraph"]')
    .filter({ hasText: "Drag me between columns or back into the editor" })
    .first();
  const cardId = await card.getAttribute("data-block-id");
  await card.scrollIntoViewIfNeeded();
  await holdDragAt(page, card, async () => {
    // Bring the destination into view after activation; scrolling the handle
    // into view alone can leave the gap below the viewport.
    await columns.evaluate((element) => element.scrollIntoView({ block: "center" }));
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    const boardBox = (await board.boundingBox())!;
    const columnsBox = (await columns.boundingBox())!;
    return {
      x: boardBox.x + boardBox.width / 2,
      y: (boardBox.y + boardBox.height + columnsBox.y) / 2,
    };
  });
  await expect(page.locator(DROP_LINE_SELECTOR)).toBeVisible();
  await page.mouse.up();
  await expect
    .poll(() =>
      page.evaluate((id) => {
        const editor = (
          window as unknown as {
            __rivtoDemo: { editor: DocumentEditorAPI };
          }
        ).__rivtoDemo.editor;
        return editor.blocks.getParentId(id!);
      }, cardId),
    )
    .toBeNull();
});

test("moves a block between the demo TODO storage and Bento", async ({ page }) => {
  await page.goto("/");
  const document = page.locator('[data-journal-document="today"]');
  const storage = document.locator('[data-block-type="todo-storage"]').first();
  const bento = document.locator('[data-block-type="bento"]').first();
  const source = storage.locator('[data-block-type="todo-item"]').last();
  const ids = await page.evaluate(() => {
    const editor = (
      window as unknown as {
        __rivtoDemo: { editor: DocumentEditorAPI };
      }
    ).__rivtoDemo.editor;
    const roots = editor.blocks.getRootIds();
    const storageId = roots.find((id) => editor.blocks.getBlock(id)?.type === "todo-storage")!;
    const bentoId = roots.find((id) => editor.blocks.getBlock(id)?.type === "bento")!;
    editor.blocks.moveBlock(bentoId, storageId, "after");
    return { storageId, bentoId };
  });
  const sourceId = await source.getAttribute("data-block-id");
  await source.scrollIntoViewIfNeeded();
  await holdDragAt(page, source, async () => {
    // The last task may be visible while the storage's bottom is offscreen.
    // Centre the destination after activation before measuring its boundary.
    await storage.evaluate((element) => element.scrollIntoView({ block: "center" }));
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    const box = (await storage.boundingBox())!;
    return { x: box.x + box.width / 2, y: box.y + box.height - 4 };
  });
  const line = page.locator(DROP_LINE_SELECTOR);
  await expect(line).toBeVisible();
  const lineBox = (await line.boundingBox())!;
  const storageBox = (await storage.boundingBox())!;
  expect(Math.abs(lineBox.y + lineBox.height / 2 - storageBox.y - storageBox.height)).toBeLessThan(
    9,
  );
  await page.mouse.up();
  await expect
    .poll(() =>
      page.evaluate((id) => {
        const editor = (
          window as unknown as {
            __rivtoDemo: { editor: DocumentEditorAPI };
          }
        ).__rivtoDemo.editor;
        return editor.blocks.getRootIds().indexOf(id!);
      }, sourceId),
    )
    .toBe(
      (await page.evaluate((id) => {
        const editor = (
          window as unknown as {
            __rivtoDemo: { editor: DocumentEditorAPI };
          }
        ).__rivtoDemo.editor;
        return editor.blocks.getRootIds().indexOf(id);
      }, ids.storageId)) + 1,
    );
  await expect(bento).toBeVisible();
  await page.keyboard.press("Control+z");
  await expect
    .poll(() =>
      page.evaluate((id) => {
        const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
          .__rivtoDemo.editor;
        return editor.blocks.getParentId(id!);
      }, sourceId),
    )
    .toBe(ids.storageId);
});

for (const mode of ["block", "edgeless"] as const) {
  for (const container of ROOT_CONTAINER_INPUTS) {
    test(`centers the ${container.type} root gap like an ordinary block in ${mode}`, async ({
      page,
    }) => {
      const ids = await page.evaluate(
        ({ input, nextMode }) => {
          const editor = (
            window as unknown as {
              __rivtoDemo: { editor: DocumentEditorAPI };
            }
          ).__rivtoDemo.editor;
          const roots = [
            editor.blocks.insertBlock({
              id: "gap-source",
              type: "paragraph",
              content: "Gap source",
            }),
            editor.blocks.insertBlock({
              id: "gap-markdown",
              type: "paragraph",
              content: "Markdown",
            }),
            editor.blocks.insertBlock({
              id: "gap-slider",
              type: "demo.slider",
              props: { value: 25 },
            }),
            editor.blocks.insertBlock({
              id: "gap-counter",
              type: "demo.counter",
              props: { count: 2 },
            }),
            editor.blocks.insertBlock({ id: "gap-container", ...input }),
            editor.blocks.insertBlock({
              id: "gap-after",
              type: "paragraph",
              content: "After container",
            }),
          ].map((block) => block.id);
          editor.load({
            ...editor.dump(),
            rootElementIds: [],
            blocks: roots.map((id) => editor.blocks.getBlock(id)!),
            elements: [],
          });
          if (nextMode === "edgeless") {
            editor.elements.insertElement({
              type: "block",
              zIndex: 0,
              frame: { x: 20, y: 20, width: 900, height: 1200 },
              props: { startBlockId: roots[0]!, endBlockId: roots.at(-1)! },
            });
          }
          return roots;
        },
        { input: container, nextMode: mode },
      );
      if (mode === "edgeless") {
        await page.locator('[data-editor-mode="edgeless"]').click();
      }

      const source = page.locator(`[data-block-id="${ids[0]}"]`).first();
      const previous = page.locator(`[data-block-id="${ids[3]}"]`).first();
      const next = page.locator(`[data-block-id="${ids[4]}"]`).first();
      const previousBox = (await previous.boundingBox())!;
      const nextBox = (await next.boundingBox())!;
      const gapY = (previousBox.y + previousBox.height + nextBox.y) / 2;
      await holdDragAt(page, source, previousBox.x + CHILD_DROP_INDENT / 2, gapY);

      const line = page.locator(DROP_LINE_SELECTOR);
      await expect(line).toHaveCount(1);
      const lineBox = (await line.boundingBox())!;
      expect(lineBox.height).toBe(4);
      expect(lineBox.y + lineBox.height / 2).toBeCloseTo(gapY, 0);
      expect(lineBox.x).toBeCloseTo(previousBox.x, 0);
      expect(lineBox.width).toBeCloseTo(previousBox.width, 0);
      await page.mouse.up();
      await expect
        .poll(() =>
          page.evaluate(() => {
            const editor = (
              window as unknown as {
                __rivtoDemo: { editor: DocumentEditorAPI };
              }
            ).__rivtoDemo.editor;
            return editor.blocks.getRootIds();
          }),
        )
        .toEqual([ids[1], ids[2], ids[3], ids[0], ids[4], ids[5]]);
    });
  }
}

test("hovering a row body still puts the drop inside that block", async ({ page }) => {
  const alpha = page
    .locator("[data-block-id]")
    .filter({ has: page.getByText("Alpha", { exact: true }) })
    .first();
  const beta = page
    .locator("[data-block-id]")
    .filter({ has: page.getByText("Beta", { exact: true }) })
    .first();
  const alphaId = (await alpha.getAttribute("data-block-id"))!;
  const betaId = await beta.getAttribute("data-block-id");
  const betaRow = beta.locator(`:scope > ${BLOCK_ROW_SELECTOR}`);
  const box = (await betaRow.boundingBox())!;
  await holdDragAt(page, alpha, box.x + box.width / 2, box.y + box.height / 2);
  await expect(betaRow.locator("xpath=ancestor::*[@data-block-id][1]")).toHaveAttribute(
    "data-block-drop-active",
    "true",
  );
  await expect(betaRow.locator("xpath=ancestor::*[@data-block-id][1]")).toHaveCSS(
    "outline-width",
    "4px",
  );
  await expect(betaRow.locator("xpath=ancestor::*[@data-block-id][1]")).toHaveCSS(
    "outline-style",
    "solid",
  );
  await expect(page.locator('[data-block-type="kanban"]')).not.toHaveAttribute(
    "data-block-drop-active",
    "true",
  );
  await page.mouse.up();
  /**
   * Reads the moved block's live canonical parent for commit and undo assertions.
   *
   * @returns Current parent ID, or null when the block is a document root.
   */
  const readParent = () =>
    page.evaluate(
      (id) =>
        (
          window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
        ).__rivtoDemo.editor.blocks.getParentId(id),
      alphaId,
    );
  await expect.poll(readParent).toBe(betaId);
  await page.keyboard.press("Control+z");
  await expect.poll(readParent).toBeNull();
});

test("shows the only-child outdent line on its parent's bottom edge", async ({ page }) => {
  await page.setViewportSize({ width: 635, height: 360 });
  const cases = [
    {
      parentId: REPORT_PARENT_ID,
      sourceId: REPORT_LEVEL_2_ID,
      nextId: REPORT_NEXT_ID,
      expectedParentId: null,
      expectedSiblings: [REPORT_PARENT_ID, REPORT_LEVEL_2_ID, REPORT_NEXT_ID, REPORT_ANOTHER_ID],
    },
    {
      parentId: REPORT_LEVEL_3_ID,
      sourceId: REPORT_LEVEL_4_ID,
      nextId: REPORT_LEVEL_3_NEXT_ID,
      expectedParentId: REPORT_LEVEL_2_ID,
      expectedSiblings: [REPORT_LEVEL_3_ID, REPORT_LEVEL_4_ID, REPORT_LEVEL_3_NEXT_ID],
    },
  ] as const;

  for (const scenario of cases) {
    await loadSingleChildReport(page);
    const parent = page.locator(`[data-block-id="${scenario.parentId}"]`).first();
    const source = page.locator(`[data-block-id="${scenario.sourceId}"]`).first();
    await parent.evaluate((element) => element.scrollIntoView({ block: "center" }));
    const parentRow = parent.locator(`:scope > ${BLOCK_ROW_SELECTOR}`);
    await holdDragAt(page, source, async () => {
      await parentRow.evaluate((element) => element.scrollIntoView({ block: "center" }));
      const box = (await parent.boundingBox())!;
      return { x: box.x + CHILD_DROP_INDENT / 2, y: box.y + box.height - 2 };
    });
    const parentRowBox = (await parent.boundingBox())!;
    const line = page.locator(DROP_LINE_SELECTOR);
    await expect(line).toBeVisible();
    const lineBox = (await line.boundingBox())!;
    const nextBox = (await page
      .locator(`[data-block-id="${scenario.nextId}"]`)
      .first()
      .boundingBox())!;
    expect(lineBox.y + lineBox.height / 2).toBeCloseTo(
      (parentRowBox.y + parentRowBox.height + nextBox.y) / 2,
      0,
    );
    await page.mouse.up();
    await expect
      .poll(() =>
        page.evaluate(({ sourceId, expectedParentId }) => {
          const editor = (
            window as unknown as {
              __rivtoDemo: { editor: DocumentEditorAPI };
            }
          ).__rivtoDemo.editor;
          const siblings = expectedParentId
            ? editor.blocks.getBlock(expectedParentId)?.children.map(({ id }) => id)
            : editor.blocks.getRootIds();
          return { parentId: editor.blocks.getParentId(sourceId), siblings };
        }, scenario),
      )
      .toEqual({
        parentId: scenario.expectedParentId,
        siblings: [...scenario.expectedSiblings],
      });
  }
});

test("keeps the report's parent body and next-block top edge drop zones", async ({ page }) => {
  await page.setViewportSize({ width: 635, height: 360 });
  await loadSingleChildReport(page);
  const parent = page.locator(`[data-block-id="${REPORT_PARENT_ID}"]`).first();
  const source = page.locator(`[data-block-id="${REPORT_LEVEL_2_ID}"]`).first();
  const parentRow = parent.locator(`:scope > ${BLOCK_ROW_SELECTOR}`);
  await parent.evaluate((element) => element.scrollIntoView({ block: "center" }));
  const parentRowBox = (await parentRow.boundingBox())!;

  await holdDragAt(
    page,
    source,
    parentRowBox.x + parentRowBox.width / 2,
    parentRowBox.y + parentRowBox.height / 2,
  );
  await expect(parentRow.locator("xpath=ancestor::*[@data-block-id][1]")).toHaveAttribute(
    "data-block-drop-active",
    "true",
  );
  await page.mouse.up();
  await expect
    .poll(() =>
      page.evaluate((id) => {
        const editor = (
          window as unknown as {
            __rivtoDemo: { editor: DocumentEditorAPI };
          }
        ).__rivtoDemo.editor;
        return editor.blocks.getParentId(id);
      }, REPORT_LEVEL_2_ID),
    )
    .toBe(REPORT_PARENT_ID);

  await loadSingleChildReport(page);
  const next = page.locator(`[data-block-id="${REPORT_NEXT_ID}"]`).first();
  const nextRow = next.locator(`:scope > ${BLOCK_ROW_SELECTOR}`);
  await next.evaluate((element) => element.scrollIntoView({ block: "center" }));
  await holdDragAt(page, source, async () => {
    await nextRow.evaluate((element) => element.scrollIntoView({ block: "center" }));
    const box = (await nextRow.boundingBox())!;
    return { x: box.x + CHILD_DROP_INDENT / 2, y: box.y + 2 };
  });
  await expect(page.locator(DROP_LINE_SELECTOR)).toBeVisible();
  await page.mouse.up();
  await expect
    .poll(() =>
      page.evaluate((id) => {
        const editor = (
          window as unknown as {
            __rivtoDemo: { editor: DocumentEditorAPI };
          }
        ).__rivtoDemo.editor;
        return editor.blocks.getParentId(id);
      }, REPORT_LEVEL_2_ID),
    )
    .toBeNull();
});

test("hovering a block in a free container nests inside that block", async ({ page }) => {
  const alpha = page
    .locator("[data-block-id]")
    .filter({ has: page.getByText("Alpha", { exact: true }) })
    .first();
  const beta = page
    .locator("[data-block-id]")
    .filter({ has: page.getByText("Beta", { exact: true }) })
    .first();
  const alphaId = await alpha.getAttribute("data-block-id");
  const betaId = await beta.getAttribute("data-block-id");
  const columnId = await page
    .locator('[data-block-type="kanban-column"]')
    .first()
    .getAttribute("data-block-id");
  await page.evaluate(
    ({ alphaId, betaId, columnId }) => {
      const editor = (
        window as unknown as {
          __rivtoDemo: { editor: DocumentEditorAPI };
        }
      ).__rivtoDemo.editor;
      editor.blocks.moveBlocks([alphaId!, betaId!], columnId!, "inside");
    },
    { alphaId, betaId, columnId },
  );

  const nestedAlpha = page.locator(`[data-block-id="${alphaId}"]`);
  const nestedBeta = page.locator(`[data-block-id="${betaId}"]`);
  const betaRow = nestedBeta.locator(`:scope > ${BLOCK_ROW_SELECTOR}`);
  const box = (await betaRow.boundingBox())!;
  await holdDragAt(page, nestedAlpha, box.x + box.width / 2, box.y + box.height / 2);
  await expect(betaRow.locator("xpath=ancestor::*[@data-block-id][1]")).toHaveAttribute(
    "data-block-drop-active",
    "true",
  );
  await page.mouse.up();
  await expect
    .poll(() =>
      page.evaluate(
        ({ sourceId }) => {
          const editor = (
            window as unknown as {
              __rivtoDemo: { editor: DocumentEditorAPI };
            }
          ).__rivtoDemo.editor;
          return editor.blocks.getParentId(sourceId!);
        },
        { sourceId: alphaId },
      ),
    )
    .toBe(betaId);
});

test("an empty kanban column still accepts an inside drop on its body", async ({ page }) => {
  const alpha = page
    .locator("[data-block-id]")
    .filter({ has: page.getByText("Alpha", { exact: true }) })
    .first();
  const empty = page.locator('[data-block-type="kanban-column"]').nth(1);
  const alphaId = await alpha.getAttribute("data-block-id");
  const emptyId = await empty.getAttribute("data-block-id");
  const box = (await empty.boundingBox())!;
  await holdDragAt(page, alpha, box.x + box.width / 2, box.y + box.height * 0.7);
  await expect(empty).toHaveAttribute("data-block-drop-active", "true");
  await page.mouse.up();
  await expect
    .poll(() =>
      page.evaluate(
        ({ sourceId }) => {
          const editor = (
            window as unknown as {
              __rivtoDemo: { editor: DocumentEditorAPI };
            }
          ).__rivtoDemo.editor;
          return sourceId ? editor.blocks.getParentId(sourceId) : undefined;
        },
        { sourceId: alphaId },
      ),
    )
    .toBe(emptyId);
});

test("does not add an ordinary block directly to an empty kanban", async ({ page }) => {
  const boardId = await page.evaluate(() => {
    const editor = (
      window as unknown as {
        __rivtoDemo: { editor: DocumentEditorAPI };
      }
    ).__rivtoDemo.editor;
    return editor.blocks.insertBlock({ type: "kanban", content: "Empty board" }).id;
  });
  const alpha = page
    .locator("[data-block-id]")
    .filter({ has: page.getByText("Alpha", { exact: true }) })
    .first();
  const alphaId = await alpha.getAttribute("data-block-id");
  const board = page.locator(`[data-block-id="${boardId}"]`).first();
  const box = (await board.boundingBox())!;
  await holdDragAt(page, alpha, box.x + box.width / 2, box.y + box.height * 0.7);
  await expect(board).not.toHaveAttribute("data-block-drop-active", "true");
  await expect(board.locator('[data-block-drop-active="true"]')).toHaveCount(0);
  await page.mouse.up();
  expect(
    await page.evaluate(
      ({ sourceId, targetId }) => {
        const editor = (
          window as unknown as {
            __rivtoDemo: { editor: DocumentEditorAPI };
          }
        ).__rivtoDemo.editor;
        return {
          parentId: editor.blocks.getParentId(sourceId!),
          childIds: editor.blocks.getBlock(targetId)?.children.map(({ id }) => id),
        };
      },
      { sourceId: alphaId, targetId: boardId },
    ),
  ).toEqual({ parentId: null, childIds: [] });
});

test("moves an ordinary block between sibling kanban columns", async ({ page }) => {
  const ids = await page.evaluate(() => {
    const editor = (
      window as unknown as {
        __rivtoDemo: { editor: DocumentEditorAPI };
      }
    ).__rivtoDemo.editor;
    const alpha = editor.blocks
      .getRootIds()
      .find((id) => editor.blocks.getBlock(id)?.content === "Alpha")!;
    const board = editor.blocks
      .getRootIds()
      .find((id) => editor.blocks.getBlock(id)?.type === "kanban")!;
    const [first, second] = editor.blocks.getBlock(board)!.children.map(({ id }) => id);
    editor.blocks.moveBlock(alpha, first, "inside");
    return { alpha, first, second };
  });
  const source = page.locator(`[data-block-id="${ids.alpha}"]`).first();
  const destination = page.locator(`[data-block-id="${ids.second}"]`).first();
  const box = (await destination.boundingBox())!;
  await holdDragAt(page, source, box.x + box.width / 2, box.y + box.height * 0.7);
  await expect(destination).toHaveAttribute("data-block-drop-active", "true");
  await page.mouse.up();
  await expect
    .poll(() =>
      page.evaluate((id) => {
        const editor = (
          window as unknown as {
            __rivtoDemo: { editor: DocumentEditorAPI };
          }
        ).__rivtoDemo.editor;
        return editor.blocks.getParentId(id);
      }, ids.alpha),
    )
    .toBe(ids.second);
});

test("dragging onto a kanban upper rim inserts a sibling without creating a column", async ({
  page,
}) => {
  const alpha = page
    .locator("[data-block-id]")
    .filter({ has: page.getByText("Alpha", { exact: true }) })
    .first();
  const alphaId = await alpha.getAttribute("data-block-id");
  const board = page.locator('[data-block-type="kanban"]');
  const box = (await board.boundingBox())!;
  await holdDragAt(page, alpha, box.x + 2, box.y + 1);
  await expect(board).not.toHaveAttribute("data-block-drop-active", "true");
  const line = page.locator(DROP_LINE_SELECTOR);
  await expect(line).toBeVisible();
  const lineBox = (await line.boundingBox())!;
  expect(lineBox.height).toBe(4);
  expect(lineBox.width).toBeGreaterThan(lineBox.height);
  await page.mouse.up();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
          .__rivtoDemo.editor;
        return editor.blocks.getRootIds().at(-1);
      }),
    )
    .toBe(await board.getAttribute("data-block-id"));
  await expect
    .poll(() =>
      page.evaluate((id) => {
        const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
          .__rivtoDemo.editor;
        const roots = editor.blocks.getRootIds();
        return roots[roots.length - 2];
      }, alphaId),
    )
    .toBe(alphaId);
  await expect(page.locator('[data-block-type="kanban-column"]')).toHaveCount(2);
  await expect(
    page.locator("[data-block-id]").filter({ has: page.getByText("Alpha", { exact: true }) }),
  ).not.toHaveAttribute("data-block-type", "kanban-column");
});

for (const mode of ["block", "edgeless"] as const) {
  test(`appends after final nested subtrees in ordinary and free container outlines in ${mode}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 1000 });
    const ids = await page.evaluate((nextMode) => {
      const editor = (
        window as unknown as {
          __rivtoDemo: { editor: DocumentEditorAPI };
        }
      ).__rivtoDemo.editor;
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
          children: [
            {
              type: "kanban-column",
              content: "End-gap lane",
              children: [
                {
                  type: "paragraph",
                  content: "Kanban final",
                  children: [{ type: "paragraph", content: "Kanban nested" }],
                },
              ],
            },
          ],
        },
        { type: "paragraph", content: "Columns source" },
        {
          type: "columns",
          children: [
            {
              type: "columns-column",
              children: [
                {
                  type: "paragraph",
                  content: "Columns final",
                  children: [{ type: "paragraph", content: "Columns nested" }],
                },
              ],
            },
          ],
        },
      ];
      const roots = inputs.map((input) => editor.blocks.insertBlock(input).id);
      editor.load({
        ...editor.dump(),
        rootElementIds: [],
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
      const all = editor.blocks.getBlocks().flatMap(function walk(block): (typeof block)[] {
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
    if (mode === "edgeless") {
      await page.locator('[data-editor-mode="edgeless"]').click();
    }

    const cases = [
      { source: ids.ordinarySource, nested: ids.ordinaryNested, expectedParent: null },
      { source: ids.kanbanSource, nested: ids.kanbanNested, expectedParent: ids.kanbanLane },
      { source: ids.columnsSource, nested: ids.columnsNested, expectedParent: ids.columnsLane },
    ];
    for (const dragCase of cases) {
      const source = page.locator(`[data-block-id="${dragCase.source}"]`).first();
      const nestedRow = page
        .locator(`[data-block-id="${dragCase.nested}"] > ${BLOCK_ROW_SELECTOR}`)
        .first();
      // Keep this boundary away from auto-scroll; edge scrolling has separate coverage.
      await nestedRow.evaluate((element) => element.scrollIntoView({ block: "center" }));
      await holdDragAt(page, source, async () => {
        const box = (await nestedRow.boundingBox())!;
        const parent = (await nestedRow
          .locator("xpath=ancestor::*[@data-block-id][2]")
          .boundingBox())!;
        return { x: parent.x + CHILD_DROP_INDENT / 2, y: box.y + box.height - 2 };
      });
      await expect(page.locator(DROP_LINE_SELECTOR)).toBeVisible();
      await page.mouse.up();
      await expect
        .poll(() =>
          page.evaluate((sourceId) => {
            const editor = (
              window as unknown as {
                __rivtoDemo: { editor: DocumentEditorAPI };
              }
            ).__rivtoDemo.editor;
            return editor.blocks.getParentId(sourceId);
          }, dragCase.source),
        )
        .toBe(dragCase.expectedParent);
    }
  });
}
