/** Browser coverage for image file paste and page/canvas drop routing. */
import { expect, test, type Locator } from "@playwright/test";
import { resolve } from "node:path";

const BLOCK_CONTENT_SELECTOR = "[data-block-content]";
const IMAGE_BLOCK_SELECTOR = '[data-block-type="image"]';
const IMAGE_ELEMENT_SELECTOR = '[data-edgeless-visual-kind="image"]';
const IMAGE_RESIZE_SELECTOR = ".rivto-image-resize";
const EDGELESS_VISUAL_RESIZE_SELECTOR = ".edgeless-visual-resize";
const FILE_BLOCK_SELECTOR = '[data-block-type="file"]';
const FILE_ELEMENT_SELECTOR = '[data-edgeless-visual-kind="file"]';
const FILE_NAME_SELECTOR = ".rivto-file-name";
const FILE_TEXT_ICON_SELECTOR = ".lucide-file-text";

/** Dispatches one tiny valid PNG through a clipboard or drop event. */
async function sendImage(target: Locator, eventType: "paste" | "drop", itemOnly = false, name = "pixel.png"): Promise<void> {
  await target.evaluate((element, { type, itemOnlyPayload, fileName }) => {
    const bytes = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="), (character) => character.charCodeAt(0));
    const data = new DataTransfer();
    const file = new File([bytes], fileName, { type: "image/png" });
    data.items.add(file);
    const payload = itemOnlyPayload
      ? { files: [], items: [{ kind: "file", getAsFile: () => file }], types: ["Files"], getData: () => "" }
      : data;
    const event = type === "paste"
      ? new ClipboardEvent("paste", { bubbles: true, cancelable: true })
      : new DragEvent("drop", { bubbles: true, cancelable: true, clientX: 300, clientY: 300 });
    Object.defineProperty(event, type === "paste" ? "clipboardData" : "dataTransfer", { value: payload });
    element.dispatchEvent(event);
  }, { type: eventType, itemOnlyPayload: itemOnly, fileName: name });
}

/** Dispatches one ordinary file through the shared ingestion path. */
async function sendFile(target: Locator, eventType: "paste" | "drop", name = "notes.txt"): Promise<void> {
  await target.evaluate((element, { type, fileName }) => {
    const data = new DataTransfer();
    data.items.add(new File(["hello"], fileName, { type: "text/plain" }));
    const event = type === "paste"
      ? new ClipboardEvent("paste", { bubbles: true, cancelable: true })
      : new DragEvent("drop", { bubbles: true, cancelable: true, clientX: 300, clientY: 300 });
    Object.defineProperty(event, type === "paste" ? "clipboardData" : "dataTransfer", { value: data });
    element.dispatchEvent(event);
  }, { type: eventType, fileName: name });
}

/** Dispatches the plain absolute path produced by desktop file-manager copy. */
async function sendLocalImagePath(target: Locator, path: string): Promise<void> {
  await target.evaluate((element, localPath) => {
    Object.defineProperty(navigator.clipboard, "readText", {
      configurable: true,
      value: async () => localPath,
    });
    const event = new ClipboardEvent("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", {
      value: {
        files: [],
        items: [],
        types: ["text/uri-list"],
        getData: () => "",
      },
    });
    element.dispatchEvent(event);
  }, path);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("pastes an image file as an inline macro at a text caret", async ({ page }) => {
  const content = page.locator(BLOCK_CONTENT_SELECTOR).first();
  await content.click();
  await page.keyboard.press("End");
  await sendImage(content, "paste", false, "");

  await expect.poll(() => page.evaluate(() => {
    const demo = window as typeof window & { __rivtoDemo?: { editor: { editor: { blocks: { getBlocks(): Array<{ content: string }> } } } } };
    return demo.__rivtoDemo?.editor.editor.blocks.getBlocks()[0]?.content ?? "";
  })).toContain("rivto-files");
  await page.locator("h1").first().click();
  await expect(page.locator(".markdown-preview .rivto-image").first()).toHaveAttribute("alt", "Image");
});

test("converts a resized standard Markdown image to an adjustable image macro", async ({ page }) => {
  await page.evaluate(() => {
    const demo = window as typeof window & { __rivtoDemo?: { editor: { editor: { blocks: {
      getBlocks(): Array<{ id: string }>;
      updateBlock(id: string, patch: { content: string }): void;
    } } } } };
    const block = demo.__rivtoDemo?.editor.editor.blocks.getBlocks()[0];
    if (!block) throw new Error("Demo block is unavailable");
    demo.__rivtoDemo!.editor.editor.blocks.updateBlock(block.id, { content: "![Plain image](missing.png)" });
  });

  const frame = page.locator('.markdown-preview [data-image-kind="inline"]').first();
  await frame.hover();
  const resize = frame.locator(IMAGE_RESIZE_SELECTOR);
  const handle = await resize.boundingBox();
  if (!handle) throw new Error("Markdown image resize handle has no bounds");
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + 48, handle.y + 48);
  await page.mouse.up();

  await expect.poll(() => page.evaluate(() => {
    const demo = window as typeof window & { __rivtoDemo?: { editor: { editor: { blocks: { getBlocks(): Array<{ content: string }> } } } } };
    return demo.__rivtoDemo?.editor.editor.blocks.getBlocks()[0]?.content ?? "";
  })).toMatch(/^\{\{image path="missing\.png" alt="Plain image" width=\d+ height=\d+\}\}$/);
});

test("drops an image block and pastes an item-only clipboard image on canvas", async ({ page }) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: "http://127.0.0.1:5173" });
  await sendImage(page.locator(".page-surface").first(), "drop");
  const imageBlock = page.locator(IMAGE_BLOCK_SELECTOR);
  await expect(imageBlock).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => {
    const demo = window as typeof window & { __rivtoDemo?: { editor: { editor: { blocks: { getBlocks(): Array<{ type: string; props: Record<string, unknown> }> } } } } };
    return demo.__rivtoDemo?.editor.editor.blocks.getBlocks().find(({ type }) => type === "image")?.props.uri;
  })).toContain("data:image/png;base64,");
  await imageBlock.locator(".rivto-image").click({ button: "right" });
  const copyImage = page.getByRole("menuitem", { name: "Copy image" });
  await expect(copyImage).toBeVisible();
  await copyImage.click();
  await expect(copyImage).toBeHidden();
  await expect.poll(() => page.evaluate(async () => {
    const items = await navigator.clipboard.read();
    return items.some(({ types }) => types.includes("image/png"));
  })).toBe(true);
  await imageBlock.hover();
  const resize = imageBlock.locator(IMAGE_RESIZE_SELECTOR);
  await expect(resize).toBeVisible();
  const handle = await resize.boundingBox();
  if (!handle) throw new Error("Image resize handle has no bounds");
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + 54, handle.y + 24);
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => {
    const demo = window as typeof window & { __rivtoDemo?: { editor: { editor: { blocks: { getBlocks(): Array<{ type: string; props: Record<string, unknown> }> } } } } };
    const props = demo.__rivtoDemo?.editor.editor.blocks.getBlocks().find(({ type }) => type === "image")?.props;
    return typeof props?.width === "number" && props.width > 24 && props.width === props.height;
  })).toBe(true);
  await imageBlock.hover();
  await resize.dblclick();
  await expect.poll(() => page.evaluate(() => {
    const demo = window as typeof window & { __rivtoDemo?: { editor: { editor: { blocks: { getBlocks(): Array<{ type: string; props: Record<string, unknown> }> } } } } };
    const props = demo.__rivtoDemo?.editor.editor.blocks.getBlocks().find(({ type }) => type === "image")?.props;
    return [props?.width, props?.height];
  })).toEqual([undefined, undefined]);

  await page.locator('[data-editor-mode="edgeless"]').click();
  await sendImage(page.locator(".edgeless-viewport").first(), "paste", true);
  await expect(page.locator(IMAGE_ELEMENT_SELECTOR)).toHaveCount(1);
  await expect(page.locator(`${IMAGE_ELEMENT_SELECTOR} .rivto-image`)).toHaveAttribute("alt", "pixel.png");
  await expect(page.locator(`${IMAGE_ELEMENT_SELECTOR} ${IMAGE_RESIZE_SELECTOR}`)).toHaveCount(0);
  await expect(page.locator(`${IMAGE_ELEMENT_SELECTOR} ${EDGELESS_VISUAL_RESIZE_SELECTOR}`)).toHaveCount(1);
});

test("pastes a desktop filesystem path in page and edgeless modes", async ({ page }) => {
  const localImage = resolve("docs/00-rivto/assets/pasted-1786747914356-844df263.png");
  await sendLocalImagePath(page.locator(".page-surface").first(), localImage);
  await expect(page.locator(IMAGE_BLOCK_SELECTOR)).toHaveCount(1);
  await expect(page.locator(`${IMAGE_BLOCK_SELECTOR} .rivto-image`)).toBeVisible();

  await page.locator('[data-editor-mode="edgeless"]').click();
  await sendLocalImagePath(page.locator(".edgeless-viewport").first(), localImage);
  await expect(page.locator(IMAGE_ELEMENT_SELECTOR)).toHaveCount(1);
  await expect(page.locator(`${IMAGE_ELEMENT_SELECTOR} .rivto-image`)).toBeVisible();
});

test("falls back to file cards for non-image files", async ({ page }) => {
  let openRequests = 0;
  await page.route("**/__rivto_demo_open_file**", async (route) => {
    openRequests += 1;
    await route.fulfill({ status: 204 });
  });
  await sendFile(page.locator(".page-surface").first(), "drop");
  await expect(page.locator(FILE_BLOCK_SELECTOR)).toHaveCount(1);
  await expect(page.locator(`${FILE_BLOCK_SELECTOR} ${FILE_NAME_SELECTOR}`)).toHaveText("notes.txt");
  await expect(page.locator(`${FILE_BLOCK_SELECTOR} ${FILE_TEXT_ICON_SELECTOR}`)).toHaveCount(1);
  await page.locator(`${FILE_BLOCK_SELECTOR} .rivto-file`).dblclick();
  await expect.poll(() => openRequests).toBe(1);
  await page.locator(`${FILE_BLOCK_SELECTOR} .rivto-file`).click({ button: "right" });
  const openFile = page.getByRole("menuitem", { name: "Open file" });
  await expect(openFile).toBeVisible();
  await openFile.click();
  await expect.poll(() => openRequests).toBe(2);

  await page.locator('[data-editor-mode="edgeless"]').click();
  await sendFile(page.locator(".edgeless-viewport").first(), "paste");
  await expect(page.locator(FILE_ELEMENT_SELECTOR)).toHaveCount(1);
  await expect(page.locator(`${FILE_ELEMENT_SELECTOR} ${FILE_NAME_SELECTOR}`)).toHaveText("notes.txt");
});
