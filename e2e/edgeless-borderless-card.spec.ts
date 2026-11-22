import { expect, test } from "@playwright/test";
import type { DocumentEditorAPI } from "@chulane/rivto";
import type { ReactEditorApi } from "@chulane/rivto-react";

type DemoWindow = Window & {
  __rivtoDemo: { editor: DocumentEditorAPI; reactEditor: ReactEditorApi };
};

test("card chrome follows the configured default writing block", async ({ page }) => {
  await page.goto("/?test_features=1");
  await page.waitForFunction(() => !!(window as unknown as DemoWindow).__rivtoDemo);
  await page.evaluate(() => {
    const { editor, reactEditor } = (window as unknown as DemoWindow).__rivtoDemo;
    const factory = reactEditor.defaultWritingBlockFactory;
    reactEditor.installDefaultWriting({
      ...factory,
      createEmptyBlock: () => ({ type: "demo.counter", content: "" }),
      isBlock: (block) => block.type === "demo.counter",
      isEmptyBlock: (block) => block.type === "demo.counter" && !block.content,
    });
    editor.blocks.removeBlocks(editor.blocks.getRootIds());
    editor.blocks.insertBlock({ id: "custom-writing", type: "demo.counter" });
  });
  const today = page.locator('[data-journal-document="today"]');
  await today.getByRole("button", { name: "Edgeless", exact: true }).click();
  const card = today.locator('[data-edgeless-root]:has([data-block-id="custom-writing"])');
  await expect(card).toBeVisible();
  await expect(card).not.toHaveAttribute("data-borderless", "true");
  await page.evaluate(() => {
    (window as unknown as DemoWindow).__rivtoDemo.editor.blocks.setBlockType(
      "custom-writing",
      "paragraph",
    );
  });
  await expect(card).toHaveAttribute("data-borderless", "true");
});

test("single non-paragraph root keeps its operations without card chrome", async ({ page }) => {
  await page.goto("/?test_features=1");
  await page.evaluate(() => {
    const editor = (window as unknown as DemoWindow).__rivtoDemo.editor;
    editor.blocks.removeBlocks(editor.blocks.getRootIds());
    editor.blocks.insertBlock({
      id: "borderless-root",
      type: "demo.counter",
      children: [{ id: "borderless-child", type: "paragraph", content: "Child" }],
    });
  });
  const today = page.locator('[data-journal-document="today"]');
  await today.getByRole("button", { name: "Edgeless", exact: true }).click();
  const card = today.locator(
    '[data-edgeless-root]:has(> .edgeless-card-content > [data-block-id="borderless-root"])',
  );
  const content = card.locator(":scope > .edgeless-card-content");
  await expect(card).toBeVisible();
  await expect(card).toHaveCSS("border-top-color", "rgba(0, 0, 0, 0)");
  await expect(card).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(content).toHaveCSS("padding-top", "0px");
  await expect(card.locator('[data-block-id="borderless-child"]')).toBeVisible();

  await page.evaluate(() => {
    (window as unknown as DemoWindow).__rivtoDemo.editor.blocks.setBlockType(
      "borderless-root",
      "paragraph",
    );
  });
  await expect(content).toHaveCSS("padding-top", "56px");
  await page.evaluate(() => {
    (window as unknown as DemoWindow).__rivtoDemo.editor.blocks.setBlockType(
      "borderless-root",
      "demo.counter",
    );
  });
  await expect(content).toHaveCSS("padding-top", "0px");
  await page.evaluate(() => {
    (window as unknown as DemoWindow).__rivtoDemo.editor.blocks.insertBlock({
      id: "second-root",
      type: "paragraph",
      content: "Second root",
    });
  });
  await expect(content).toHaveCSS("padding-top", "56px");
  await page.evaluate(() => {
    (window as unknown as DemoWindow).__rivtoDemo.editor.blocks.removeBlocks(["second-root"]);
  });
  await expect(content).toHaveCSS("padding-top", "0px");
  await card.locator('[data-block-id="borderless-child"] [data-block-content]').click();
  await page.keyboard.press("End");
  await page.keyboard.type(" edited");
  await expect(
    card.locator('[data-block-id="borderless-child"] [data-block-content]'),
  ).toContainText("Child edited");
  await page.keyboard.press("Control+z");
  await expect(card.locator('[data-block-id="borderless-child"] [data-block-content]')).toHaveText(
    "Child",
  );
  const cardId = await card.getAttribute("data-edgeless-root");
  await content.click({ position: { x: 2, y: 2 } });
  await expect(card).toHaveAttribute("data-block-selected", "true");
  await expect(today.locator(`[data-edgeless-controls-for="${cardId}"]`)).toBeVisible();
  const borderless = today.getByRole("checkbox", { name: "Borderless card" });
  await expect(borderless).toBeChecked();
  await page.evaluate(() =>
    (window as unknown as DemoWindow).__rivtoDemo.editor.history.stopCapturing(),
  );
  await borderless.uncheck();
  await expect(card).not.toHaveAttribute("data-borderless", "true");
  await expect(content).toHaveCSS("padding-top", "56px");
  expect(
    await page.evaluate(
      (id) =>
        (window as unknown as DemoWindow).__rivtoDemo.editor.elements.getElementNode(id!)?.props
          .borderless,
      cardId,
    ),
  ).toBe(false);
  await page.evaluate(() => (window as unknown as DemoWindow).__rivtoDemo.editor.history.undo());
  await expect(borderless).toBeChecked();
  await expect(card).toHaveAttribute("data-borderless", "true");
  await page.evaluate(() => (window as unknown as DemoWindow).__rivtoDemo.editor.history.redo());
  await expect(borderless).not.toBeChecked();
  await borderless.check();
  await expect(card).toHaveAttribute("data-borderless", "true");
  await expect(content).toHaveCSS("padding-top", "0px");
  await page.evaluate(() => {
    (window as unknown as DemoWindow).__rivtoDemo.editor.blocks.insertBlock({
      id: "another-root",
      type: "paragraph",
      content: "Another root",
    });
  });
  await expect(borderless).toHaveCount(0);
  await expect(card).not.toHaveAttribute("data-borderless", "true");
});
