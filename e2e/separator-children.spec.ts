import { expect, test } from "@playwright/test";
import type { DocumentEditorAPI } from "@chulane/rivto";

test("frames separator children in Page and leaves them out of Edgeless", async ({ page }) => {
  await page.goto("/?test_features=1");
  await page.locator('[data-journal-document="today"] [data-block-content]').first().waitFor();
  await page.evaluate(() => {
    const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }).__rivtoDemo
      .editor;
    editor.history.batchUpdates(() => {
      editor.blocks.removeBlocks([...editor.blocks.getRootIds()]);
      editor.blocks.insertBlock({ id: "frame-before", type: "paragraph", content: "Before" });
      editor.blocks.insertBlock({
        id: "frame-separator",
        type: "separator",
        children: [
          {
            id: "frame-child-one",
            type: "paragraph",
            content: "First child",
            children: [{ id: "frame-grandchild", type: "paragraph", content: "Grandchild" }],
          },
          { id: "frame-child-two", type: "paragraph", content: "Second child" },
          { id: "frame-bento", type: "bento" },
          { id: "frame-kanban", type: "kanban" },
        ],
      });
      editor.blocks.insertBlock({ id: "frame-after", type: "paragraph", content: "After" });
    });
  });
  const separator = page.locator('.page-surface [data-block-id="frame-separator"]');
  const children = separator.locator(":scope > .rivto-separator-children");
  await expect(children.locator('[data-block-id="frame-child-one"]')).toBeVisible();
  await expect(children.locator('[data-block-id="frame-child-two"]')).toBeVisible();
  await expect(children).toHaveCSS("border-top-style", "dashed");
  await expect(children).toHaveCSS("opacity", "1");
  await expect(children.locator(':scope > [data-block-id="frame-child-one"]')).toHaveCSS(
    "opacity",
    "0.5",
  );
  await expect(children.locator('[data-block-id="frame-grandchild"]')).toHaveCSS("opacity", "1");
  for (const id of ["frame-bento", "frame-kanban"]) {
    const board = children.locator(`[data-block-id="${id}"]`);
    await expect(board).toBeVisible();
    await expect(board.locator("xpath=..")).toHaveCSS("opacity", "0.5");
  }
  await children.evaluate((element) => {
    element.style.setProperty("--rivto-separator-children-opacity", "0.8");
  });
  await expect(children.locator(':scope > [data-block-id="frame-child-one"]')).toHaveCSS(
    "opacity",
    "0.8",
  );
  await expect(children.locator('[data-block-id="frame-bento"]').locator("xpath=..")).toHaveCSS(
    "opacity",
    "0.8",
  );
  await expect(page.locator("[data-nesting-lines] path").first()).toHaveAttribute("d", /^M [^M]+$/);
  await separator.locator(':scope > .rivto-block-row [data-collapse-toggle="true"]').click();
  await expect(children).toBeHidden();
  await separator.locator(':scope > .rivto-block-row [data-collapse-toggle="true"]').click();
  await expect(children.locator('[data-block-id="frame-child-one"]')).toBeVisible();
  await page.locator('[data-editor-mode="edgeless"]').click();
  await expect(page.locator('[data-edgeless-root] [data-block-id="frame-child-one"]')).toHaveCount(
    0,
  );
});

test("drops a block inside the bottom of the separator frame", async ({ page }) => {
  await page.goto("/?test_features=1");
  await page.locator('[data-journal-document="today"] [data-block-content]').first().waitFor();
  await page.evaluate(() => {
    const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }).__rivtoDemo
      .editor;
    editor.history.batchUpdates(() => {
      editor.blocks.removeBlocks([...editor.blocks.getRootIds()]);
      editor.blocks.insertBlock({ id: "drop-source", type: "paragraph", content: "Source" });
      editor.blocks.insertBlock({
        id: "drop-separator",
        type: "separator",
        children: [{ id: "drop-child", type: "paragraph", content: "Child" }],
      });
      editor.blocks.insertBlock({ id: "drop-after", type: "paragraph", content: "After" });
    });
  });
  const source = page.locator('.page-surface [data-block-id="drop-source"]');
  const separator = page.locator('.page-surface [data-block-id="drop-separator"]');
  const frame = separator.locator(":scope > .rivto-separator-children");
  await source.locator(":scope > .rivto-block-row").hover();
  const handle = (await source.locator(".block-handle").boundingBox())!;
  const box = (await frame.boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 36, box.y + box.height - 16, { steps: 12 });
  const line = page.locator(".rivto-block-drop-line");
  await expect(line).toBeVisible();
  const lineBox = (await line.boundingBox())!;
  expect(lineBox.y + lineBox.height / 2).toBeLessThanOrEqual(box.y + box.height);
  await page.mouse.up();
  await expect
    .poll(() =>
      page.evaluate(() =>
        (
          window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
        ).__rivtoDemo.editor.blocks.getChildIds("drop-separator"),
      ),
    )
    .toEqual(["drop-child", "drop-source"]);
  await page.keyboard.press("ControlOrMeta+z");
  await expect
    .poll(() =>
      page.evaluate(() =>
        (
          window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
        ).__rivtoDemo.editor.blocks.getChildIds("drop-separator"),
      ),
    )
    .toEqual(["drop-child"]);
});

test("nests a dragged block under a child inside the separator", async ({ page }) => {
  await page.goto("/?test_features=1");
  await page.locator('[data-journal-document="today"] [data-block-content]').first().waitFor();
  await page.evaluate(() => {
    const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }).__rivtoDemo
      .editor;
    editor.history.batchUpdates(() => {
      editor.blocks.removeBlocks([...editor.blocks.getRootIds()]);
      editor.blocks.insertBlock({ id: "nested-source", type: "paragraph", content: "Source" });
      editor.blocks.insertBlock({
        id: "nested-separator",
        type: "separator",
        children: [
          { id: "nested-target", type: "paragraph", content: "Target" },
          { id: "nested-next", type: "paragraph", content: "Next" },
        ],
      });
    });
  });
  const source = page.locator('.page-surface [data-block-id="nested-source"]');
  const target = page.locator('.page-surface [data-block-id="nested-target"]');
  await source.locator(":scope > .rivto-block-row").hover();
  const handle = (await source.locator(".block-handle").boundingBox())!;
  const box = (await target.boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 8, box.y + box.height - 2, { steps: 12 });
  await expect(page.locator(".rivto-block-drop-line")).toBeVisible();
  await page.mouse.up();
  await expect(target.locator('[data-block-id="nested-source"]')).toBeVisible();
  await page.keyboard.press("ControlOrMeta+z");
  await expect(source).toBeVisible();
});
