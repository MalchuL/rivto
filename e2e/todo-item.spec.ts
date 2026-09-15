/**
 * Covers TODO prompt decoration and the atomic in-place conversion through the
 * public demo, including host aliases, metadata, stable identity, and history.
 *
 * @module
 */
import { expect, test } from "@playwright/test";
import { BLOCK_ID_ATTRIBUTE } from "./dom-markers";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("highlights a prompt and converts it when editing leaves the block", async ({ page }) => {
  const document = page.locator('[data-journal-document="today"]');
  const seeded = document.locator('[data-block-type="todo-item"]');
  await expect(seeded).toHaveCount(3);
  await expect(seeded.nth(0).getByRole("button", { name: /Status: todo/ })).toBeVisible();
  await expect(seeded.nth(1).getByRole("button", { name: /Status: doing/ })).toBeVisible();
  await expect(seeded.nth(2).getByRole("button", { name: /Status: done/ })).toBeVisible();
  await expect(seeded.nth(0).locator(".rivto-todo-item")).toHaveAttribute("data-todo-priority", "2");
  await expect(seeded.nth(1).locator(".rivto-todo-item")).toHaveAttribute("data-todo-priority", "1");
  await expect(seeded.nth(2).locator(".rivto-todo-item")).toHaveAttribute("data-todo-priority", "3");
  await document.getByRole("button", { name: "Add block" }).click();
  const content = document.locator("[data-block-content]:focus");
  const block = content.locator(`xpath=ancestor::*[@${BLOCK_ID_ATTRIBUTE}][1]`);
  const id = await block.getAttribute(BLOCK_ID_ATTRIBUTE);
  if (!id) throw new Error("Expected a stable block ID");

  await page.keyboard.type("task   Buy milk");
  await expect(content.locator(".rivto-todo-prompt")).toHaveText("task");
  await page.keyboard.press("Home");
  await page.keyboard.type("x");
  await expect(content.locator(".rivto-todo-prompt")).toHaveCount(0);
  await page.keyboard.press("Backspace");
  await expect(content.locator(".rivto-todo-prompt")).toHaveText("task");

  await content.evaluate(async (element) => {
    const hasFocus = document.hasFocus;
    Object.defineProperty(document, "hasFocus", { configurable: true, value: () => false });
    document.getSelection()?.removeAllRanges();
    document.dispatchEvent(new Event("selectionchange"));
    element.dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: null }));
    await new Promise((resolve) => setTimeout(resolve));
    Object.defineProperty(document, "hasFocus", { configurable: true, value: hasFocus });
  });
  await expect(document.locator(`[${BLOCK_ID_ATTRIBUTE}="${id}"]`))
    .toHaveAttribute("data-block-type", "paragraph");

  await document.locator("[data-block-content]").first().click();
  const converted = document.locator(`[${BLOCK_ID_ATTRIBUTE}="${id}"]`);
  await expect(converted).toHaveAttribute("data-block-type", "todo-item");
  await expect(converted.getByRole("textbox", { name: "TODO item name" })).toHaveText("Buy milk");
  const props = await page.evaluate((blockId) => {
    const demo = (window as unknown as {
      __rivtoDemo: { editor: { editor: { blocks: { getBlock(id: string): { props: Record<string, unknown> } } } } };
    }).__rivtoDemo;
    return demo.editor.editor.blocks.getBlock(blockId).props;
  }, id);
  expect(props).toMatchObject({ status: "todo", description: "", priority: 4, project: "" });
  expect(props.createdAt).toBe(props.updatedAt);

  await page.keyboard.press("Control+z");
  await expect(converted).toHaveAttribute("data-block-type", "paragraph");
  await expect(converted.locator("[data-block-content]")).toHaveText("task   Buy milk");
  await page.keyboard.press("Control+Shift+z");
  await expect(converted).toHaveAttribute("data-block-type", "todo-item");

  const name = converted.getByRole("textbox", { name: "TODO item name" });
  await name.click();
  await page.keyboard.press("End");
  await page.keyboard.type("!");
  await converted.getByRole("button", { name: /Status: todo/ }).click();
  await expect(converted.getByRole("button", { name: /Status: doing/ })).toBeVisible();
  const edited = await page.evaluate((blockId) => (
    (window as unknown as {
      __rivtoDemo: { editor: { editor: { blocks: { getBlock(id: string): { content: string; props: Record<string, unknown> } } } } };
    }).__rivtoDemo.editor.editor.blocks.getBlock(blockId)
  ), id);
  expect(edited.content).toBe("Buy milk!");
  expect(new Date(String(edited.props.updatedAt)).getTime()).toBeGreaterThan(new Date(String(props.updatedAt)).getTime());

  await converted.getByRole("button", { name: "Open TODO properties" }).click();
  let dialog = page.getByRole("dialog", { name: "TODO item properties" });
  await dialog.getByLabel("Description").fill("From X");
  await dialog.getByRole("button", { name: "Close properties" }).click();

  await converted.getByRole("button", { name: "Open TODO properties" }).click();
  dialog = page.getByRole("dialog", { name: "TODO item properties" });
  await dialog.getByLabel("Project").fill("Escape project");
  await page.keyboard.press("Escape");

  await converted.getByRole("button", { name: "Open TODO properties" }).click();
  dialog = page.getByRole("dialog", { name: "TODO item properties" });
  await dialog.getByLabel("Priority").selectOption("1");
  await dialog.click({ position: { x: 2, y: 2 } });
  await expect(dialog).toHaveCount(0);
  const modalProps = await page.evaluate((blockId) => (
    (window as unknown as {
      __rivtoDemo: { editor: { editor: { blocks: { getBlock(id: string): { props: Record<string, unknown> } } } } };
    }).__rivtoDemo.editor.editor.blocks.getBlock(blockId).props
  ), id);
  expect(modalProps).toMatchObject({
    status: "doing",
    description: "From X",
    priority: 1,
    project: "Escape project",
  });

  await converted.getByRole("textbox", { name: "Description" }).fill("Inline description");
  await converted.getByRole("textbox", { name: "Description" }).evaluate((input) => {
    (input as HTMLInputElement).setSelectionRange(6, 6);
  });
  await page.keyboard.type("XY");
  await converted.getByRole("combobox", { name: "Priority" }).selectOption("2");
  await converted.getByRole("textbox", { name: "Project" }).fill("Inline project");
  const inlineProps = await page.evaluate((blockId) => (
    (window as unknown as {
      __rivtoDemo: { editor: { editor: { blocks: { getBlock(id: string): { props: Record<string, unknown> } } } } };
    }).__rivtoDemo.editor.editor.blocks.getBlock(blockId).props
  ), id);
  expect(inlineProps).toMatchObject({
    description: "InlineXY description",
    priority: 2,
    project: "Inline project",
  });
});
