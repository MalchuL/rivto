import { expect, test, type Page } from "@playwright/test";
import type { DocumentEditorAPI } from "@chulane/rivto";

type DemoWindow = Window & { __rivtoDemo: { editor: DocumentEditorAPI } };

/**
 * Reads a fixture block's current persisted background value.
 *
 * @param page - Demo page owning the editor.
 * @param blockId - Captured block ID, or null when no fixture was mounted.
 * @returns Background value, or undefined when the target is missing.
 */
async function readBackground(page: Page, blockId: string | null): Promise<unknown> {
  return page.evaluate(
    (id) =>
      (
        (window as unknown as DemoWindow).__rivtoDemo.editor.blocks.getBlockNode(id!)?.listProps
          .style as { background?: { color?: string } } | undefined
      )?.background?.color,
    blockId,
  );
}

for (const repeat of [0, 200]) {
  test(`color picker coalesces rapid input without losing the final color, repeat=${repeat}`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.goto(`/?test_features=1&repeat=${repeat}`);
    const row = page
      .locator('[data-journal-document="today"] [data-block-id] > .rivto-block-row')
      .first();
    await row.waitFor();
    const blockId = await row.locator("..").getAttribute("data-block-id");
    await row.hover();
    await row
      .locator(":scope > :is(.rivto-slot, .rivto-block-slot) > .block-handle")
      .click({ button: "right" });
    const input = page.getByLabel("Custom background color");
    await expect(input).toBeVisible();
    const result = await input.evaluate(async (element) => {
      const editor = (window as unknown as DemoWindow).__rivtoDemo.editor;
      let notifications = 0;
      const unsubscribe = editor.subscribe(() => notifications++);
      const input = element as HTMLInputElement;
      const start = performance.now();
      for (let index = 1; index <= 20; index++) {
        input.value = `#${index.toString(16).padStart(6, "0")}`;
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }
      const duration = performance.now() - start;
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      unsubscribe();
      return { notifications, duration };
    });
    console.log(`color-input repeat=${repeat}: ${JSON.stringify(result)}`);
    expect(result.notifications).toBe(1);
    await expect.poll(() => readBackground(page, blockId)).toBe("#000014");
    await expect(input).toHaveValue("#000014");
  });
}

test("pending picker input flushes before dismissal and does not override another swatch", async ({
  page,
}) => {
  await page.goto("/?test_features=1");
  const row = page
    .locator('[data-journal-document="today"] [data-block-id] > .rivto-block-row')
    .first();
  await row.waitFor();
  const blockId = await row.locator("..").getAttribute("data-block-id");
  const initialColor = await page.evaluate((id) => {
    const editor = (window as unknown as DemoWindow).__rivtoDemo.editor;
    editor.history.stopCapturing();
    return (
      editor.blocks.getBlockNode(id!)?.listProps.style as
        { background?: { color?: string } } | undefined
    )?.background?.color;
  }, blockId);
  await row.hover();
  const handle = row.locator(":scope > :is(.rivto-slot, .rivto-block-slot) > .block-handle");
  await handle.click({ button: "right" });
  const input = page.getByLabel("Custom background color");
  await input.evaluate((element) => {
    const input = element as HTMLInputElement;
    input.value = "#123456";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  });
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect.poll(() => readBackground(page, blockId)).toBe("#123456");
  await page.evaluate(() => (window as unknown as DemoWindow).__rivtoDemo.editor.history.undo());
  await expect.poll(() => readBackground(page, blockId)).toBe(initialColor);
  await page.evaluate(() => (window as unknown as DemoWindow).__rivtoDemo.editor.history.redo());
  await expect.poll(() => readBackground(page, blockId)).toBe("#123456");
  await handle.click({ button: "right" });
  await page.getByLabel("Custom background color").evaluate((element) => {
    const input = element as HTMLInputElement;
    input.value = "#654321";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    document.querySelector<HTMLButtonElement>('button[aria-label="No color"]')!.click();
  });
  await expect.poll(() => readBackground(page, blockId)).toBe("#00000000");
  await expect(page.getByRole("menu").first()).toBeVisible();
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  await expect.poll(() => readBackground(page, blockId)).toBe("#00000000");
});
