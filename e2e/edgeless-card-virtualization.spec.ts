import { expect, test } from "@playwright/test";
import type { DocumentEditorAPI } from "@chulane/rivto";

type DemoWindow = Window & { __rivtoDemo: { editor: DocumentEditorAPI } };

test("landing below a stale auto-height card reveals its edited descendant without another pan", async ({
  page,
}) => {
  await page.goto("/?test_features=1");
  await page.waitForFunction(() => Boolean((window as DemoWindow).__rivtoDemo));
  await page.evaluate(() => {
    const { blocks } = (window as DemoWindow).__rivtoDemo.editor;
    blocks.removeBlocks(blocks.getRootIds());
    blocks.insertBlock({
      id: "virtual-card",
      type: "paragraph",
      children: [{ id: "virtual-child", type: "paragraph", content: "Short" }],
    });
  });
  await page.locator('[data-editor-mode="edgeless"]').first().click();
  const viewport = page.locator(".edgeless-viewport").first();
  const card = viewport.locator('[data-edgeless-root]:has([data-block-id="virtual-card"])');
  await expect(card).toBeAttached();
  const id = (await card.getAttribute("data-edgeless-root"))!;
  await viewport.hover({ position: { x: 15, y: 15 } });
  await page.mouse.wheel(0, 3000);
  await expect(card).toHaveCount(0);
  await page.evaluate(() => {
    const { blocks } = (window as DemoWindow).__rivtoDemo.editor;
    blocks.updateBlock("virtual-child", { content: "Long paragraph ".repeat(4000) });
  });
  await page.mouse.wheel(0, -1000);
  await expect(viewport).toHaveAttribute("data-edgeless-pan-y", "-2000");
  await expect(card).toBeInViewport();
  await expect(card.locator('[data-block-id="virtual-child"]')).toBeInViewport();
  await page.evaluate(() => (window as DemoWindow).__rivtoDemo.editor.history.undo());
  await expect(card).toHaveCount(0);
  const frame = await page.evaluate(
    (id) => (window as DemoWindow).__rivtoDemo.editor.elements.getElementNode(id)!.frame,
    id,
  );
  expect(frame.height).toBeLessThan(500);
});

test("narrowing an unmounted card reveals wrapped text at a stationary zoomed viewport", async ({
  page,
}) => {
  await page.goto("/?test_features=1");
  await page.waitForFunction(() => Boolean((window as DemoWindow).__rivtoDemo));
  await page.evaluate(() => {
    const { blocks } = (window as DemoWindow).__rivtoDemo.editor;
    blocks.removeBlocks(blocks.getRootIds());
    blocks.insertBlock({
      id: "width-probe",
      type: "paragraph",
      content: "Wrapping text ".repeat(160),
    });
  });
  await page.locator('[data-editor-mode="edgeless"]').first().click();
  const viewport = page.locator(".edgeless-viewport").first();
  const card = viewport.locator('[data-edgeless-root]:has([data-block-id="width-probe"])');
  await expect(card).toBeAttached();
  const id = (await card.getAttribute("data-edgeless-root"))!;
  await viewport.getByRole("button", { name: "Zoom out", exact: true }).click();
  await expect(viewport).toHaveAttribute("data-edgeless-zoom", "0.9");
  await viewport.hover({ position: { x: 15, y: 15 } });
  await page.mouse.wheel(0, 3000);
  await page.mouse.wheel(0, -1000);
  await expect(card).toHaveCount(0);
  await page.evaluate(
    (id) =>
      (window as DemoWindow).__rivtoDemo.editor.elements.updateElement(id, {
        frame: { width: 180 },
      }),
    id,
  );
  await expect(card).toBeInViewport();
  await expect(card.locator('[data-block-id="width-probe"]')).toBeInViewport();
});
