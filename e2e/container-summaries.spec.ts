/** Browser regression for contentless container headers and collapsed summaries. */
import { expect, test } from "@playwright/test";
import type { ReactEditor } from "@chulane/rivto-react";
import type { DocumentEditorAPI } from "@chulane/rivto";

const ROW_CLASS = "rivto-block-row";
const CONTENT_FLOW_CLASS = "rivto-block-content";
const PAGE_SURFACE_CLASS = "page-surface";
const DRAG_HANDLE_CLASS = "block-handle";

test("slash converts the current root to each structural container", async ({ page }) => {
  for (const [query, command, type] of [
    ["bento", "block.bento.insert", "bento"],
    ["table", "block.table.insert", "table"],
    ["kanban", "block.kanban.insert", "kanban"],
    ["columns", "block.columns.insert", "columns"],
  ] as const) {
    await page.goto("/");
    const content = page
      .locator(
        `.${PAGE_SURFACE_CLASS} > .rivto-virtual-tree > div > [data-virtual-block-id] > [data-block-id] > .${ROW_CLASS} [data-block-content]`,
      )
      .first();
    const blockId = await content
      .locator("xpath=ancestor::*[@data-block-id][1]")
      .getAttribute("data-block-id");
    if (!blockId) {
      throw new Error("Expected an editable root block");
    }
    const before = await page.evaluate(() => {
      const editor = (
        window as unknown as {
          __rivtoDemo: { editor: DocumentEditorAPI };
        }
      ).__rivtoDemo.editor;
      return editor.blocks.getBlocks().map((block) => block.id);
    });
    const block = page.locator(`[data-block-id="${blockId}"]`);
    await content.click();
    await page.keyboard.press("End");
    await page.keyboard.type(`/${query}`);
    await page.locator(`[data-slash-command="${command}"]`).click();
    await expect(block).toHaveAttribute("data-block-type", type);
    await expect
      .poll(() =>
        page.evaluate(() => {
          const editor = (
            window as unknown as {
              __rivtoDemo: { editor: DocumentEditorAPI };
            }
          ).__rivtoDemo.editor;
          return editor.blocks.getBlocks().map((candidate) => candidate.id);
        }),
      )
      .toEqual(before);
    await page.evaluate(() => {
      const editor = (
        window as unknown as {
          __rivtoDemo: { editor: DocumentEditorAPI };
        }
      ).__rivtoDemo.editor;
      editor.history.undo();
    });
    await expect(block).toHaveAttribute("data-block-type", "paragraph");
    await expect(block.locator("[data-block-content]")).toContainText(`/${query}`);
  }
});

test("renders aligned contentless container summaries from reactive block snapshots", async ({
  page,
}) => {
  await page.goto("/");

  const containers = [
    { type: "bento", name: "Bento", stats: "3 tiles" },
    { type: "table", name: "Table", stats: "3 × 3" },
    { type: "kanban", name: "Kanban", stats: "3 columns · 1 card" },
    { type: "columns", name: "Columns", stats: "2 columns" },
  ] as const;
  const referenceToggle = page
    .locator(
      `[data-journal-document="today"] > .page-surface > .rivto-virtual-tree > div > [data-virtual-block-id] > [data-block-type="paragraph"] > .${ROW_CLASS} [data-collapse-toggle]`,
    )
    .first();
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

    // content-visibility can paint skipped descendants after scrolling. Read
    // both bounds together so a layout update cannot split the measurement.
    const { blockBox, childrenBox } = await block.evaluate((element) => ({
      blockBox: element.getBoundingClientRect().toJSON(),
      childrenBox: element
        .querySelector(":scope > .rivto-block-children")!
        .getBoundingClientRect()
        .toJSON(),
    }));
    const topInset = childrenBox.y - blockBox.y;
    const bottomInset = blockBox.y + blockBox.height - childrenBox.y - childrenBox.height;
    expect(topInset, `${type} top inset`).toBeCloseTo(bottomInset, 0);
    if (type === "table" || type === "kanban" || type === "columns") {
      expect(topInset, `${type} outer inset`).toBeCloseTo(0, 0);
    }

    const toggleBox = (await toggle.boundingBox())!;
    expect(toggleBox.x, `${type} collapse offset`).toBeCloseTo(referenceToggleBox.x, 0);

    await toggle.click();
    await expect(row.getByText(name, { exact: true })).toBeVisible();
    await expect(row.getByText(stats, { exact: true })).toBeVisible();
  }

  await expect
    .poll(() =>
      page.evaluate(() => {
        const editor = (
          window as unknown as {
            __rivtoDemo: { editor: DocumentEditorAPI };
          }
        ).__rivtoDemo.editor;
        return ["bento", "table", "kanban", "columns"].map(
          (type) => editor.blocks.getBlocks().find((block) => block.type === type)?.content,
        );
      }),
    )
    .toEqual(["", "", "", ""]);

  await page.evaluate(() => {
    const editor = (
      window as unknown as {
        __rivtoDemo: { editor: DocumentEditorAPI };
      }
    ).__rivtoDemo.editor;
    const bento = editor.blocks.getBlocks().find((block) => block.type === "bento")!;
    const tile = editor.blocks.insertBlock({ type: "paragraph", content: "Fourth tile" }).id;
    editor.blocks.moveBlocks([tile], bento.id, "inside");
  });
  await expect(
    page.locator('[data-block-type="bento"]').first().getByText("4 tiles", { exact: true }),
  ).toBeVisible();

  await page.evaluate(() => {
    const editor = (
      window as unknown as {
        __rivtoDemo: { editor: DocumentEditorAPI };
      }
    ).__rivtoDemo.editor;
    for (const type of ["bento", "kanban", "table"]) {
      const block = editor.blocks.getBlocks().find((candidate) => candidate.type === type)!;
      editor.blocks.updateBlock(block.id, { listProps: { collapsed: false } });
      editor.blocks.removeBlocks(block.children.map((child) => child.id));
    }
  });
  for (const [type, minimumHeight] of [
    ["bento", 128],
    ["kanban", 192],
    ["table", 96],
  ] as const) {
    const block = page.locator(`[data-block-type="${type}"]`).first();
    await expect(block.locator(":scope > .rivto-block-children > [data-block-id]")).toHaveCount(0);
    expect((await block.boundingBox())!.height, `${type} empty height`).toBeGreaterThanOrEqual(
      minimumHeight,
    );
  }
});

test("renders a compact TODO storage summary while collapsed", async ({ page }) => {
  await page.goto("/");
  const storage = page.locator('[data-block-type="todo-storage"]');
  await storage.locator(`:scope > .${ROW_CLASS} [data-collapse-toggle]`).click();
  await expect(storage.getByText("TODO storage", { exact: true })).toBeVisible();
  await expect(storage.getByText("3 items", { exact: true })).toBeVisible();
  await expect(storage.locator(":scope > .rivto-block-children")).toBeHidden();
  await expect(storage.locator(":scope > .rivto-block-children > [data-block-id]")).toHaveCount(0);
  expect((await storage.boundingBox())!.height).toBeLessThan(88);
});

test("reveals root block handles in their headers and exposed lateral gutters", async ({
  page,
}) => {
  await page.goto("/");
  const surfaceBox = (await page.locator(`.${PAGE_SURFACE_CLASS}`).first().boundingBox())!;

  for (const type of ["bento", "table", "columns", "kanban", "todo-storage"] as const) {
    const block = page.locator(`[data-block-type="${type}"]`).first();
    await block.scrollIntoViewIfNeeded();
    const body = block.locator(":scope > .rivto-block-children");
    const handle = block.locator(`:scope > .${ROW_CLASS} .${DRAG_HANDLE_CLASS}`);
    await expect(handle, `${type} optional drag extension handle`).toHaveCount(1);
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    const handleBox = (await handle.boundingBox())!;

    await page.mouse.move(0, 0);
    await expect(handle, `${type} hidden root handle`).toHaveCSS("opacity", "0");
    await expect(handle, `${type} idle root handle`).toHaveCSS("pointer-events", "none");
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
    const bodyPoint = { x: surfaceBox.x + 8, y: bodyBox.y + bodyBox.height / 2 };
    const handlePoint = {
      x: handleBox.x + handleBox.width / 2,
      y: handleBox.y + handleBox.height / 2,
    };
    await page.mouse.move(bodyPoint.x, bodyPoint.y);
    await expect(handle, `${type} root handle`).toHaveCSS("opacity", "1");
    await expect(handle, `${type} root handle`).toHaveCSS("pointer-events", "auto");
    await page.mouse.move(handlePoint.x, handlePoint.y, {
      steps: 16,
    });
    const hitLabel = await page.evaluate(
      ({ x, y }) =>
        document.elementFromPoint(x, y)?.closest(".block-handle")?.getAttribute("aria-label"),
      {
        x: handleBox.x + handleBox.width / 2,
        y: handleBox.y + handleBox.height / 2,
      },
    );
    expect(hitLabel, `${type} handle hit target`).toBe(await handle.getAttribute("aria-label"));
    expect(
      await handle.evaluate((element) => element.matches(":hover")),
      `${type} hovered root handle`,
    ).toBe(true);
    await expect(handle, `${type} armed root handle`).toHaveAttribute(
      "aria-roledescription",
      "draggable",
    );

    if (type === "columns") {
      const child = block.locator(`[data-block-type="paragraph"]`).first();
      const childRow = child.locator(`:scope > .${ROW_CLASS}`);
      const childHandle = childRow.locator(`.${DRAG_HANDLE_CLASS}`);
      const childRowBox = (await childRow.boundingBox())!;
      await page.mouse.move(
        childRowBox.x + childRowBox.width / 2,
        childRowBox.y + childRowBox.height / 2,
      );
      await expect(childHandle, "columns visible child handle").toHaveCSS("opacity", "1");
      const childBox = (await childHandle.boundingBox())!;
      expect(childBox.x, "columns handles do not overlap").toBeGreaterThanOrEqual(
        handleBox.x + handleBox.width,
      );
      await page.mouse.move(childBox.x + childBox.width / 2, childBox.y + childBox.height / 2, {
        steps: 20,
      });
      const childHitLabel = await page.evaluate(
        ({ x, y }) =>
          document.elementFromPoint(x, y)?.closest(".block-handle")?.getAttribute("aria-label"),
        {
          x: childBox.x + childBox.width / 2,
          y: childBox.y + childBox.height / 2,
        },
      );
      expect(childHitLabel, "columns child handle hit target").toBe(
        await childHandle.getAttribute("aria-label"),
      );
      await expect(childHandle, "columns armed child handle").toHaveAttribute(
        "aria-roledescription",
        "draggable",
      );
    }
  }
});

for (const mode of ["block", "edgeless"] as const) {
  test(`uses layout hover for a custom block's handle in ${mode}`, async ({ page }) => {
    await page.goto("/");
    const id = await page.evaluate(() => {
      const { editor, reactEditor } = (
        window as unknown as {
          __rivtoDemo: {
            editor: DocumentEditorAPI;
            reactEditor: ReactEditor;
          };
        }
      ).__rivtoDemo;
      // The custom type shares ordinary rendering and receives hover without type-specific metadata.
      reactEditor.blockTypes.register({
        definition: {
          type: "test-container",
          title: "Custom container",
        },
        render: reactEditor.renderers.get("paragraph")!,
      });
      const block = editor.blocks.insertBlock({
        type: "test-container",
        content: "Custom container",
        children: [{ type: "columns-column", children: [{ type: "paragraph", content: "Child" }] }],
      });
      editor.load({ ...editor.dump(), rootElementIds: [], blocks: [block], elements: [] });
      return block.id;
    });
    const today = page.locator('[data-journal-document="today"]');
    if (mode === "edgeless") {
      await today.getByRole("button", { name: "Edgeless", exact: true }).click();
    }
    const block = today.locator(`[data-block-id="${id}"]`);
    const handle = block.locator(`:scope > .${ROW_CLASS} .${DRAG_HANDLE_CLASS}`);
    expect(await block.evaluate((element) => getComputedStyle(element, "::before").content)).toBe(
      "none",
    );
    await page.mouse.move(0, 0);
    await expect(handle).toHaveCSS("opacity", "0");
    await expect(handle).toHaveCSS("pointer-events", "none");
    await block.locator(":scope > .rivto-block-row").hover();
    await expect(handle).toHaveCSS("opacity", "1");
    await handle.hover();
    await expect(handle).toHaveAttribute("aria-roledescription", "draggable");
    expect(
      await handle.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return (
          element.ownerDocument.elementFromPoint(
            rect.x + rect.width / 2,
            rect.y + rect.height / 2,
          ) === element
        );
      }),
    ).toBe(true);

    // Changing type keeps generic row ownership and does not leave type-specific decoration.
    await page.evaluate((blockId) => {
      (
        window as unknown as {
          __rivtoDemo: { editor: DocumentEditorAPI };
        }
      ).__rivtoDemo.editor.blocks.setBlockType(blockId, "paragraph");
    }, id);
    await page.mouse.move(0, 0);
    await expect(handle).toHaveCSS("pointer-events", "none");
  });
}

test("generic row hover works in both views without the drag extension", async ({ page }) => {
  await page.goto("/?editorLifecycle=1");
  await expect(page.locator('[data-lifecycle-state="ready"]')).toBeVisible();
  await page.evaluate(() => {
    const editor = (window as unknown as { __rivtoLifecycleEditor: ReactEditor })
      .__rivtoLifecycleEditor;
    editor.blockTypes.register({
      definition: { type: "hover-block" },
      render: editor.renderers.get("paragraph")!,
    });
    editor.blocks.insertBlock({
      id: "hover-block",
      type: "hover-block",
      content: "Hover header",
      children: [{ type: "paragraph", content: "Hover body" }],
    });
  });
  const blocks = page.locator('[data-block-id="hover-block"]');
  await expect(blocks).toHaveCount(2);
  for (const block of await blocks.all()) {
    const row = block.locator(":scope > .rivto-block-row");
    const handle = row.locator(".block-handle");
    await expect(handle).not.toHaveAttribute("data-draggable");
    await row.hover();
    await expect(handle).toHaveCSS("opacity", "1");
    await handle.click({ button: "right" });
    await expect(page.getByRole("menu").first()).toBeVisible();
    await page.keyboard.press("Escape");
  }
  // Escape restores menu focus to the handle; move focus away before testing idle visibility.
  await page.getByRole("button", { name: "Inspect", exact: true }).click();
  await page.mouse.move(0, 0);
  for (const block of await blocks.all()) {
    await expect(block.locator(":scope > .rivto-block-row .block-handle")).toHaveCSS(
      "opacity",
      "0",
    );
  }
});
