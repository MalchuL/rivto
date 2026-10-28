/** Page image resize preserves its visible bounds when the pointer moves downward. */
import { expect, test } from "@playwright/test";
import type { DocumentEditorAPI } from "@chulane/rivto";

const uri =
  'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="120" height="60"%3E%3Crect width="120" height="60" fill="red"/%3E%3C/svg%3E';

for (const repeat of [0, 200]) {
  test(`image resize follows downward movement and remains bounded, repeat=${repeat}`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    await page.goto(`/?repeat=${repeat}`);
    await page.evaluate((uri) => {
      const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
        .__rivtoDemo.editor;
      editor.blocks.insertBlock(
        {
          id: "resize-overflow",
          type: "image",
          props: {
            uri,
            alt: "resize",
            name: "resize.svg",
            mimeType: "image/svg+xml",
            intrinsicWidth: 120,
            intrinsicHeight: 60,
          },
        },
        editor.blocks.getInsertionDestinationAfter(editor.blocks.getRootIds()[0]),
      );
    }, uri);
    const image = page.locator('[data-block-id="resize-overflow"] .rivto-image');
    const frame = page.locator('[data-block-id="resize-overflow"] .rivto-image-frame');
    await expect(image).toBeVisible();
    const original = (await image.boundingBox())!;
    const props = () =>
      page.evaluate(() => {
        const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
          .__rivtoDemo.editor;
        return editor.blocks.getBlockNode("resize-overflow")?.props;
      });
    const originalProps = await props();
    await page.mouse.move(original.x + original.width - 4, original.y + original.height - 4);
    const handle = (await frame.locator(".rivto-image-resize").boundingBox())!;
    const x = handle.x + handle.width / 2;
    const y = handle.y + handle.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + 40, { steps: 4 });
    const downward = (await image.boundingBox())!;
    expect(downward.height).toBeGreaterThan(original.height + 20);
    const viewport = page.viewportSize()!;
    await page.mouse.move(
      Math.min(x + 1000, viewport.width - 10),
      Math.min(y + 500, viewport.height - 10),
      { steps: 6 },
    );
    const bounded = (await frame.boundingBox())!;
    const availableWidth = await frame.evaluate(
      (element) => element.parentElement!.getBoundingClientRect().width,
    );
    expect(bounded.width).toBeCloseTo(availableWidth, 0);
    expect(bounded.width / bounded.height).toBeCloseTo(2, 1);
    expect(await props()).toEqual(originalProps);
    await page.mouse.up();
    await expect.poll(async () => (await props())?.width).toBeCloseTo(bounded.width, 0);
    await expect
      .poll(async () => (await frame.boundingBox())!.width / (await frame.boundingBox())!.height)
      .toBeCloseTo(2, 1);
    await page.locator(".page-surface").first().focus();
    await page.keyboard.press("ControlOrMeta+z");
    await expect.poll(props).toEqual(originalProps);
    const restored = (await image.boundingBox())!;
    await page.mouse.move(restored.x + restored.width - 4, restored.y + restored.height - 4);
    const freeHandle = (await frame.locator(".rivto-image-resize").boundingBox())!;
    const freeX = freeHandle.x + freeHandle.width / 2;
    const freeY = freeHandle.y + freeHandle.height / 2;
    await page.keyboard.down("Shift");
    await page.mouse.move(freeX, freeY);
    await page.mouse.down();
    await page.mouse.move(freeX + 40, freeY + 5, { steps: 4 });
    const free = (await frame.boundingBox())!;
    expect(free.width).toBeGreaterThan(restored.width + 30);
    expect(free.height).toBeLessThan(restored.height + 15);
    await page.mouse.up();
    await page.keyboard.up("Shift");
  });
}
