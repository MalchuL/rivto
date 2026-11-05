import { expect, test, type Page, type Locator } from "@playwright/test";
import { resolve } from "node:path";

const imagePath = resolve("docs/00-rivto/assets/pasted-1786747914356-844df263.png");

/** Viewport coordinates for a file drop. */
interface DropPoint {
  readonly x: number;
  readonly y: number;
}

/**
 * Drops a small image at the fifth character of an editable block.
 *
 * @param content - Editable block receiving the image.
 * @returns Resolves after the drop event is dispatched.
 */
async function dropInitialImage(content: Locator): Promise<void> {
  await content.evaluate((element) => {
    const range = document.createRange();
    range.setStart(element.firstChild!, 5);
    range.collapse(true);
    const box = range.getBoundingClientRect();
    const data = new DataTransfer();
    const bytes = Uint8Array.from(
      atob(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      ),
      (character) => character.charCodeAt(0),
    );
    data.items.add(new File([bytes], "first.png", { type: "image/png" }));
    const event = new DragEvent("drop", {
      bubbles: true,
      cancelable: true,
      clientX: box.x,
      clientY: box.y + box.height / 2,
    });
    Object.defineProperty(event, "dataTransfer", { value: data });
    element.dispatchEvent(event);
  });
}

/**
 * Drops an image into text and returns the rendered inline image's viewport point.
 *
 * @param page - Demo page receiving the image.
 * @returns A point inside the rendered image frame.
 * @throws If the image cannot be measured or hit-tested after scrolling.
 */
async function createInlineImage(page: Page): Promise<DropPoint> {
  await page.evaluate(() => {
    const host = window as unknown as {
      __rivtoDemo: { editor: import("@chulane/rivto").DocumentEditorAPI };
    };
    host.__rivtoDemo.editor.blocks.insertBlock({
      id: "repeat-drop-target",
      type: "paragraph",
      content: "alpha omega",
    });
  });
  const content = page.locator('[data-block-id="repeat-drop-target"] [data-block-content]');
  await content.click();
  await dropInitialImage(content);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const host = window as unknown as {
          __rivtoDemo: { editor: import("@chulane/rivto").DocumentEditorAPI };
        };
        return host.__rivtoDemo.editor.blocks.getBlockNode("repeat-drop-target")?.content;
      }),
    )
    .toContain("{{image ");
  await page.locator("h1").first().click();
  const frame = page.locator(
    '[data-block-id="repeat-drop-target"] .markdown-preview .rivto-image-frame',
  );
  await frame.scrollIntoViewIfNeeded();
  const box = await frame.boundingBox();
  if (!box) {
    throw new Error("Inline image has no bounds");
  }
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(point.x, point.y);
  await page.evaluate(
    () =>
      new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))),
  );
  return imageCenterPoint(frame);
}

/**
 * Finds the center of an inline image after the browser makes it hit-testable.
 *
 * @param frame - Rendered inline image frame.
 * @returns Viewport coordinates inside the frame.
 * @throws If the image disappears while scrolling or remains unhit-testable.
 */
async function imageCenterPoint(frame: Locator): Promise<DropPoint> {
  await expect
    .poll(() =>
      frame.evaluate((element) => {
        const box = element.getBoundingClientRect();
        const hit = element.ownerDocument.elementFromPoint(
          box.x + box.width / 2,
          box.y + box.height / 2,
        );
        return Boolean(hit && element.contains(hit));
      }),
    )
    .toBe(true);
  const settled = await frame.boundingBox();
  if (!settled) {
    throw new Error("Inline image disappeared after scrolling");
  }
  return { x: settled.x + settled.width / 2, y: settled.y + settled.height / 2 };
}

/**
 * Dispatches an image drag and drop to the browser's current hit target.
 *
 * @param page - Page receiving the drag.
 * @param point - Viewport coordinates of the drop.
 * @returns Whether the drag-over and drop were claimed by the editor.
 */
async function dropImageAtPoint(page: Page, point: DropPoint): Promise<boolean> {
  return page.evaluate(({ x, y }) => {
    const target = document.elementFromPoint(x, y);
    if (!target) {
      throw new Error("Image drop has no target");
    }
    const bytes = Uint8Array.from(
      atob(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      ),
      (character) => character.charCodeAt(0),
    );
    const data = new DataTransfer();
    data.items.add(new File([bytes], "next.png", { type: "image/png" }));
    const options = { bubbles: true, cancelable: true, clientX: x, clientY: y };
    const over = new DragEvent("dragover", options);
    Object.defineProperty(over, "dataTransfer", { value: data });
    target.dispatchEvent(over);
    const drop = new DragEvent("drop", options);
    Object.defineProperty(drop, "dataTransfer", { value: data });
    target.dispatchEvent(drop);
    return over.defaultPrevented && drop.defaultPrevented;
  }, point);
}

test("routes another image drop through a pending upload card", async ({ page, context }) => {
  await page.goto("/");
  const point = await createInlineImage(page);
  let release!: () => void;
  const pending = new Promise<void>((resolvePending) => {
    release = resolvePending;
  });
  let uploads = 0;
  await page.route("**/__rivto_demo_clipboard_file**", async (route) => {
    uploads += 1;
    await pending;
    await route.continue();
  });
  try {
    expect(await dropImageAtPoint(page, point)).toBe(true);
    await expect.poll(() => uploads).toBe(1);
    await expect(page.locator('.rivto-file-upload[role="status"]')).toBeVisible();
    expect(await dropImageAtPoint(page, { x: point.x + 3, y: point.y + 3 })).toBe(true);
    await expect.poll(() => uploads).toBe(2);
  } finally {
    release();
  }
  await expect(page.locator('[data-block-type="image"]')).toHaveCount(2);
  await expect(page).toHaveURL(/\/$/);
  expect(context.pages()).toHaveLength(1);
});

test("accepts repeated native image drops while an upload card overlaps the image", async ({
  page,
  context,
  browserName,
}) => {
  test.skip(
    browserName !== "chromium",
    "Native file-manager drag is exercised through Chromium CDP",
  );
  await page.goto("/");
  const point = await createInlineImage(page);
  let release!: () => void;
  const pending = new Promise<void>((resolvePending) => {
    release = resolvePending;
  });
  let uploads = 0;
  await page.route("**/__rivto_demo_clipboard_file**", async (route) => {
    uploads += 1;
    await pending;
    await route.continue();
  });
  const session = await context.newCDPSession(page);
  const data = { items: [], files: [imagePath], dragOperationsMask: 1 };
  try {
    for (const type of ["dragEnter", "dragOver", "drop"] as const) {
      await session.send("Input.dispatchDragEvent", { type, ...point, data });
    }
    await expect.poll(() => uploads).toBe(1);
    await expect(page.locator('.rivto-file-upload[role="status"]')).toBeVisible();
    for (const type of ["dragEnter", "dragOver", "drop"] as const) {
      await session.send("Input.dispatchDragEvent", { type, x: point.x + 3, y: point.y + 3, data });
    }
    await expect.poll(() => uploads).toBe(2);
  } finally {
    release();
  }
  await expect(page.locator('[data-block-type="image"]')).toHaveCount(2);
  await expect(page).toHaveURL(/\/$/);
  expect(context.pages()).toHaveLength(1);
});
