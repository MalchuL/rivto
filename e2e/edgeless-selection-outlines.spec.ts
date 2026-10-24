import { expect, test } from "@playwright/test";
import type { DocumentEditorAPI } from "@chulane/rivto";

interface OutlineTestWindow extends Window {
  __rivtoDemo: { editor: DocumentEditorAPI };
}

for (const repeat of [0, 200]) {
  test(`each selected shape has its own frame, repeat=${repeat}`, async ({ page }) => {
    await page.goto(`/?repeat=${repeat}`);
    await page.locator('[data-editor-mode="edgeless"]').click();
    const canvas = page.locator(".edgeless-viewport");
    await canvas.evaluate((root) => root.scrollIntoView({ block: "start" }));
    const ids = await page.evaluate(() => {
      const editor = (window as unknown as OutlineTestWindow).__rivtoDemo.editor;
      return [380, 600, 820].map(
        (x, index) =>
          editor.elements.insertElement({
            type: "rectangle",
            frame: { x, y: 150, width: 120, height: 80 },
            props: { fill: "#ddddff", rotation: index === 1 ? 25 : 0 },
            zIndex: 10000 + index,
          }).id,
      );
    });
    const first = canvas.locator(`[data-edgeless-object-id="${ids[0]}"]`);
    const second = canvas.locator(`[data-edgeless-object-id="${ids[1]}"]`);
    const third = canvas.locator(`[data-edgeless-object-id="${ids[2]}"]`);
    await first.click();
    await second.click({ modifiers: ["Control"] });
    await expect(first).toHaveAttribute("data-selected", "true");
    await expect(second).toHaveAttribute("data-selected", "true");
    await expect(third).not.toHaveAttribute("data-selected", "true");
    const frames = canvas.locator(".moveable-control-box .moveable-control-box");
    await expect(frames).toHaveCount(2);
    for (const frame of await frames.all()) {
      const lines = frame.locator(":scope > .moveable-line");
      await expect(lines).toHaveCount(4);
      for (const line of await lines.all()) {
        await expect(line).toBeVisible();
      }
    }
    await page.getByRole("button", { name: "Zoom in", exact: true }).click();
    await expect(canvas).toHaveAttribute("data-edgeless-zoom", "1.1");
    await expect(frames.locator(":scope > .moveable-line")).toHaveCount(8);
    await second.click({ modifiers: ["Control"] });
    await expect(second).not.toHaveAttribute("data-selected", "true");
    await expect(frames).toHaveCount(0);
    await expect(first).toHaveAttribute("data-selected", "true");
  });
}

for (const repeat of [0, 200]) {
  test(`mixed card and shape selection keeps individual frames, repeat=${repeat}`, async ({
    page,
  }) => {
    await page.goto(`/?repeat=${repeat}`);
    await page.locator('[data-editor-mode="edgeless"]').click();
    const canvas = page.locator(".edgeless-viewport");
    await canvas.evaluate((root) => root.scrollIntoView({ block: "start" }));
    const id = await page.evaluate(
      () =>
        (window as unknown as OutlineTestWindow).__rivtoDemo.editor.elements.insertElement({
          type: "rectangle",
          frame: { x: 450, y: 220, width: 120, height: 80 },
          props: { fill: "#ddddff" },
          zIndex: 10000,
        }).id,
    );
    const card = canvas.locator("[data-edgeless-root]").first();
    const bounds = (await card.boundingBox())!;
    await page.mouse.click(bounds.x + bounds.width - 4, bounds.y + 4);
    await expect(card).toHaveAttribute("data-block-selected", "true");
    const shape = canvas.locator(`[data-edgeless-object-id="${id}"]`);
    await shape.click({ modifiers: ["Control"] });
    await expect(shape).toHaveAttribute("data-selected", "true");
    await expect(card).toHaveAttribute("data-block-selected", "true");
    const frames = canvas.locator(".moveable-control-box .moveable-control-box");
    await expect(frames).toHaveCount(2);
    await expect(frames.locator(":scope > .moveable-line")).toHaveCount(8);
  });
}
