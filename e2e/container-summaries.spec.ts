/** Browser regression for contentless container headers and collapsed summaries. */
import { expect, test } from "@playwright/test";

const ROW_CLASS = "page-block-row";
const CONTENT_FLOW_CLASS = "rivto-block-content-flow";
const PAGE_SURFACE_CLASS = "page-surface";
const DRAG_HANDLE_CLASS = "page-drag-handle";

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
      const editor = (window as unknown as {
        __rivtoDemo: { editor: import("@chulane/rivto").RivtoEditorApi };
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
      const editor = (window as unknown as {
        __rivtoDemo: { editor: import("@chulane/rivto").RivtoEditorApi };
      }).__rivtoDemo.editor;
      return editor.blocks.getBlocks().map((candidate) => candidate.id);
    })).toEqual(before);
    await page.evaluate(() => {
      const editor = (window as unknown as {
        __rivtoDemo: { editor: import("@chulane/rivto").RivtoEditorApi };
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
    const editor = (window as unknown as {
      __rivtoDemo: { editor: import("@chulane/rivto").RivtoEditorApi };
    }).__rivtoDemo.editor;
    return ["bento", "table", "kanban", "columns"].map((type) => (
      editor.blocks.getBlocks().find((block) => block.type === type)?.content
    ));
  })).toEqual(["", "", "", ""]);

  await page.evaluate(() => {
    const editor = (window as unknown as {
      __rivtoDemo: { editor: import("@chulane/rivto").RivtoEditorApi };
    }).__rivtoDemo.editor;
    const bento = editor.blocks.getBlocks().find((block) => block.type === "bento")!;
    const tile = editor.blocks.insertBlock({ type: "paragraph", content: "Fourth tile" }).id;
    editor.blocks.moveBlocks([tile], bento.id, "inside");
  });
  await expect(page.locator('[data-block-type="bento"]').first().getByText("4 tiles", { exact: true })).toBeVisible();

  await page.evaluate(() => {
    const editor = (window as unknown as {
      __rivtoDemo: { editor: import("@chulane/rivto").RivtoEditorApi };
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

test("renders a compact TODO storage summary while collapsed", async ({ page }) => {
  await page.goto("/");
  const storage = page.locator('[data-block-type="todo-storage"]');
  await storage.locator(`:scope > .${ROW_CLASS} [data-collapse-toggle]`).click();
  await expect(storage.getByText("TODO storage", { exact: true })).toBeVisible();
  await expect(storage.getByText("3 items", { exact: true })).toBeVisible();
  await expect(storage.locator(":scope > .page-block-children")).toHaveCount(0);
  expect((await storage.boundingBox())!.height).toBeLessThan(88);
});

test("reveals root container handles across their body and lateral whitespace", async ({ page }) => {
  await page.goto("/");
  const surfaceBox = (await page.locator(`.${PAGE_SURFACE_CLASS}`).first().boundingBox())!;

  for (const type of ["bento", "table", "columns", "kanban", "todo-storage"] as const) {
    const block = page.locator(`[data-block-type="${type}"]`).first();
    await block.scrollIntoViewIfNeeded();
    const body = block.locator(":scope > .page-block-children");
    const handle = block.locator(`:scope > .${ROW_CLASS} .${DRAG_HANDLE_CLASS}`);
    await expect(handle, `${type} optional drag extension handle`).toHaveCount(1);
    const handleBox = (await handle.boundingBox())!;

    await page.mouse.move(0, 0);
    await expect(handle, `${type} hidden root handle`).toHaveCSS("opacity", "0");
    await expect(handle, `${type} recoverable root handle`).toHaveCSS("pointer-events", "auto");
    await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
    await expect(handle, `${type} directly hovered root handle`).toHaveCSS("opacity", "1");
    await page.mouse.move(0, 0);
    const bodyBox = (await body.boundingBox())!;
    for (const x of [surfaceBox.x + 8, surfaceBox.x + surfaceBox.width - 8]) {
      await page.mouse.move(0, 0);
      await page.mouse.move(x, bodyBox.y + bodyBox.height / 2);
      await expect(handle, `${type} root handle beside its body`).toHaveCSS("opacity", "1");
    }
    await page.mouse.move(0, 0);
    const bodyPoint = { x: bodyBox.x + bodyBox.width / 2, y: bodyBox.y + bodyBox.height / 2 };
    const handlePoint = { x: handleBox.x + handleBox.width / 2, y: handleBox.y + handleBox.height / 2 };
    await page.mouse.move(bodyPoint.x, bodyPoint.y);
    await expect(handle, `${type} root handle`).toHaveCSS("opacity", "1");
    await expect(handle, `${type} root handle`).toHaveCSS("pointer-events", "auto");
    await page.mouse.move(handlePoint.x, handlePoint.y, {
      steps: Math.ceil(Math.hypot(handlePoint.x - bodyPoint.x, handlePoint.y - bodyPoint.y)),
    });
    const hitLabel = await page.evaluate(({ x, y }) => (
      document.elementFromPoint(x, y)?.getAttribute("aria-label")
    ), {
      x: handleBox.x + handleBox.width / 2,
      y: handleBox.y + handleBox.height / 2,
    });
    expect(hitLabel, `${type} handle hit target`).toBe(await handle.getAttribute("aria-label"));
    expect(await handle.evaluate((element) => element.matches(":hover")), `${type} hovered root handle`).toBe(true);
    await expect(handle, `${type} armed root handle`).toHaveAttribute("aria-roledescription", "draggable");

    if (type === "columns") {
      const child = block.locator(`[data-block-type="paragraph"]`).first();
      const childRow = child.locator(`:scope > .${ROW_CLASS}`);
      const childHandle = childRow.locator(`.${DRAG_HANDLE_CLASS}`);
      const childRowBox = (await childRow.boundingBox())!;
      await page.mouse.move(childRowBox.x + childRowBox.width / 2, childRowBox.y + childRowBox.height / 2);
      await expect(childHandle, "columns visible child handle").toHaveCSS("opacity", "1");
      const childBox = (await childHandle.boundingBox())!;
      expect(childBox.x, "columns handles do not overlap").toBeGreaterThanOrEqual(
        handleBox.x + handleBox.width,
      );
      await page.mouse.move(childBox.x + childBox.width / 2, childBox.y + childBox.height / 2, { steps: 20 });
      const childHitLabel = await page.evaluate(({ x, y }) => (
        document.elementFromPoint(x, y)?.getAttribute("aria-label")
      ), {
        x: childBox.x + childBox.width / 2,
        y: childBox.y + childBox.height / 2,
      });
      expect(childHitLabel, "columns child handle hit target").toBe(await childHandle.getAttribute("aria-label"));
      await expect(childHandle, "columns armed child handle").toHaveAttribute("aria-roledescription", "draggable");
    }
  }
});
