import { expect, test, type Page } from "@playwright/test";
import type { RivtoEditorApi, EditorBlock } from "@chulane/rivto";
import type { EditorRuntime } from "@chulane/rivto-react";

type DemoWindow = Window & { __rivtoDemo: { editor: RivtoEditorApi; editorRuntime: EditorRuntime } };

async function paste(page: Page, data: Record<string, string>, plain = false) {
  const content = page.locator('[data-journal-document="today"] [data-block-content]').first();
  await content.click();
  await page.keyboard.press("End");
  await content.evaluate((host, { data, plain }) => {
    if (plain) host.dispatchEvent(new KeyboardEvent("keydown", { key: "v", ctrlKey: true, shiftKey: true, bubbles: true }));
    const clipboardData = new DataTransfer();
    Object.entries(data).forEach(([type, value]) => clipboardData.setData(type, value));
    const event = new ClipboardEvent("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", { value: clipboardData });
    host.dispatchEvent(event);
  }, { data, plain });
}

async function blocks(page: Page) {
  return page.evaluate(() => {
    const flatten = (items: EditorBlock[]): EditorBlock[] => items.flatMap(block => [block, ...flatten(block.children)]);
    return flatten((window as unknown as DemoWindow).__rivtoDemo.editor.blocks.getBlocks());
  });
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.locator('[data-journal-document="today"] [data-block-content]').first().waitFor();
});

test("HTML type converters preserve neighboring paragraphs and nested lists", async ({ page }) => {
  const before = new Set((await blocks(page)).map(block => block.id));
  await paste(page, { "text/html": '<section><p>Before custom</p><p data-rivto-block="counter" data-count="42">Count: 42</p><p>After custom</p><ol><li>Parent<ul><li>Child</li></ul></li></ol><script>window.clipboardExecuted=true</script></section>', "text/plain": "fallback" });
  const inserted = (await blocks(page)).filter(block => !before.has(block.id));
  expect(inserted.map(block => block.type)).toEqual(["paragraph", "demo.counter", "paragraph", "paragraph", "paragraph"]);
  expect(inserted[1]!.props.count).toBe(42);
  expect(inserted[3]!.listProps.type).toBe("numbered_list");
  expect(inserted[3]!.children[0]!.content).toBe("Child");
  expect(await page.evaluate(() => (window as unknown as { clipboardExecuted?: boolean }).clipboardExecuted)).toBeUndefined();
  await page.keyboard.press("Control+z");
  expect((await blocks(page)).filter(block => !before.has(block.id))).toHaveLength(0);
});

test("text converters recognize Counter while plain-text paste bypasses them", async ({ page }) => {
  const initial = (await blocks(page)).filter(block => block.type === "demo.counter").length;
  await paste(page, { "text/plain": "Count: 73" });
  expect((await blocks(page)).filter(block => block.type === "demo.counter")).toHaveLength(initial + 1);
  await paste(page, { "text/plain": "Count: 91" }, true);
  expect((await blocks(page)).filter(block => block.type === "demo.counter")).toHaveLength(initial + 1);
  await expect(page.locator('[data-journal-document="today"] [data-block-content]').first()).toContainText("Count: 91");
});

test("a copied mixed canvas group becomes page blocks without duplicating card content", async ({ page }) => {
  const today = page.locator('[data-journal-document="today"]');
  await today.getByRole("button", { name: "Edgeless", exact: true }).click();
  await page.evaluate(() => {
    const { editor } = (window as unknown as DemoWindow).__rivtoDemo;
    editor.blocks.insertBlock({ type: "separator" });
    editor.blocks.insertBlock({ id: "clipboard-card-block", type: "paragraph", content: "Card content" });
    editor.elements.insertElement({ id: "clipboard-group", type: "group", zIndex: 4000, children: [
      { id: "clipboard-sticker", type: "sticker", props: { text: "Sticker content" }, frame: { x: 100, y: 100, width: 160, height: 100 }, zIndex: 1 },
      { id: "clipboard-card", type: "block", props: { startBlockId: "clipboard-card-block", endBlockId: "clipboard-card-block", rotation: 30, autoHeight: false }, frame: { x: 300, y: 100, width: 240, height: 100 }, zIndex: 2 },
    ] });
    editor.commands.execute("edgeless.selection.set", ["clipboard-group"]);
  });
  const data = await today.locator('[data-rivto-surface="edgeless"]').evaluate(host => {
    const clipboardData = new DataTransfer();
    const event = new ClipboardEvent("copy", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", { value: clipboardData });
    host.dispatchEvent(event);
    return Object.fromEntries([...clipboardData.types].map(type => [type, clipboardData.getData(type)]));
  });
  expect(data["text/plain"]).toBe("Sticker content\nCard content");
  await today.getByRole("button", { name: "Page", exact: true }).click();
  const before = new Set((await blocks(page)).map(block => block.id));
  await paste(page, data);
  const inserted = (await blocks(page)).filter(block => !before.has(block.id));
  expect(inserted.map(block => block.content)).toEqual(["Sticker content", "Card content"]);
});

test("external element HTML creates a sticker in edgeless and text in Page", async ({ page }) => {
  const html = '<p data-rivto-element="sticker">Portable<br>sticker</p>';
  await paste(page, { "text/html": html, "text/plain": "Portable\nsticker" });
  expect((await blocks(page)).some(block => block.content === "Portable\nsticker")).toBe(true);
  const today = page.locator('[data-journal-document="today"]');
  await today.getByRole("button", { name: "Edgeless", exact: true }).click();
  const before = (await blocks(page)).map(block => block.id);
  await paste(page, { "text/html": html, "text/plain": "Portable\nsticker" });
  expect((await blocks(page)).map(block => block.id)).toEqual(before);
  const stickers = await page.evaluate(() => (window as unknown as DemoWindow).__rivtoDemo.editor.elements.getElementNodes().filter(node => node.type === "sticker" && node.props.text === "Portable\nsticker"));
  expect(stickers).toHaveLength(1);
});
