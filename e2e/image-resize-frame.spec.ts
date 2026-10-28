/** Verifies image frame and resize control geometry in both editor surfaces. */
import { expect, test } from "@playwright/test";
import type { DocumentEditorAPI } from "@chulane/rivto";

const URI =
  'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="120" height="60"%3E%3Crect width="120" height="60" fill="red"/%3E%3C/svg%3E';

for (const repeat of [0, 200]) {
  test(`image block handle follows the visible image, repeat=${repeat}`, async ({ page }) => {
    await page.goto(`/?repeat=${repeat}`);
    await page.evaluate((uri) => {
      const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
        .__rivtoDemo.editor;
      editor.blocks.insertBlock(
        {
          id: "resize-image",
          type: "image",
          props: {
            uri,
            alt: "image",
            name: "image.svg",
            mimeType: "image/svg+xml",
            intrinsicWidth: 120,
            intrinsicHeight: 60,
          },
        },
        editor.blocks.getInsertionDestinationAfter(editor.blocks.getRootIds()[0]),
      );
    }, URI);
    const block = page.locator('[data-block-id="resize-image"]').first();
    const image = block.locator(".rivto-image");
    await expect(image).toBeVisible();
    const frame = (await image.boundingBox())!;
    await page.mouse.move(frame.x + frame.width + 12, frame.y + frame.height + 12);

    await expect(block.locator(".rivto-image-resize")).toHaveCSS("opacity", "1");
    const handle = (await block.locator(".rivto-image-resize").boundingBox())!;
    expect(frame.width).toBeCloseTo(120, 0);
    expect(frame.height).toBeCloseTo(60, 0);
    expect(handle.x + handle.width / 2).toBeCloseTo(frame.x + frame.width, 0);
    expect(handle.y + handle.height / 2).toBeCloseTo(frame.y + frame.height, 0);
    await page.mouse.down();
    await page.mouse.move(handle.x + handle.width / 2 + 48, handle.y + handle.height / 2 + 24, {
      steps: 4,
    });
    const preview = (await image.boundingBox())!;
    expect(preview.width).toBeGreaterThan(frame.width + 30);
    await page.mouse.up();
    await expect
      .poll(() =>
        page.evaluate(() => {
          const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
            .__rivtoDemo.editor;
          return editor.blocks.getBlockNode("resize-image")?.props.width;
        }),
      )
      .toBeGreaterThan(150);
  });
  test(`canvas image fills its freely resized box, repeat=${repeat}`, async ({ page }) => {
    await page.goto(`/?repeat=${repeat}`);
    await page.locator('[data-editor-mode="edgeless"]').click();
    await page.evaluate((uri) => {
      const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
        .__rivtoDemo.editor;
      editor.elements.insertElement({
        id: "resize-image",
        type: "image",
        frame: { x: 100, y: 100, width: 120, height: 60 },
        zIndex: 100,
        props: { uri, alt: "image", name: "image.svg", mimeType: "image/svg+xml" },
      });
    }, URI);
    const host = page.locator('[data-edgeless-object-id="resize-image"]');
    const image = host.locator(".rivto-image");
    await expect(image).toBeVisible();
    await expect(image).toHaveCSS("object-fit", "fill");
    await host.click();
    const before = (await image.boundingBox())!;
    const stored = () =>
      page.evaluate(() => {
        const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
          .__rivtoDemo.editor;
        return editor.elements.getElementNode("resize-image");
      });
    const original = await stored();
    const handle = (await page
      .locator('[data-edgeless-controls-for] [data-edgeless-resize-handle="se"]')
      .boundingBox())!;
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(handle.x + handle.width / 2 + 60, handle.y + handle.height / 2 + 5, {
      steps: 5,
    });
    const during = (await image.boundingBox())!;
    expect(during.width).toBeGreaterThan(before.width + 30);
    expect(during.height).toBeLessThan(before.height + 20);
    expect(await stored()).toEqual(original);
    await page.mouse.up();
    await expect
      .poll(async () => (await stored())!.frame.width)
      .toBeGreaterThan(original!.frame.width);
    await page.locator(".edgeless-viewport").focus();
    await page.keyboard.press("ControlOrMeta+z");
    await expect.poll(stored).toEqual(original);
    await expect.poll(async () => (await image.boundingBox())!.width).toBeCloseTo(before.width, 0);
  });
}
