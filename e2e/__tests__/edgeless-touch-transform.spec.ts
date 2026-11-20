import { expect, test } from "@playwright/test";
import type { DocumentEditorAPI } from "@chulane/rivto";

test.use({ hasTouch: true });

test("touch drag moves a selected shape and commits its geometry", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "Playwright exposes touch drag input through Chromium CDP");
  await page.goto("/");
  await page.locator('[data-editor-mode="edgeless"]').click();
  const toolbar = page.getByRole("toolbar", { name: "Visual objects" });
  await toolbar.getByRole("button", { name: "Shapes", exact: true }).click();
  await page
    .getByRole("dialog", { name: "shapes tools" })
    .getByRole("button", { name: "Rectangle", exact: true })
    .click();
  const capture = page.locator(".edgeless-drawing-capture[data-active]");
  const area = (await capture.boundingBox())!;
  await page.mouse.click(area.x + area.width / 2, area.y + area.height / 2);
  const shape = page.locator('[data-edgeless-visual-kind="rectangle"][data-selected="true"]');
  await expect(shape).toHaveCount(1);
  await toolbar.getByRole("button", { name: "Select", exact: true }).click();
  const id = (await shape.getAttribute("data-edgeless-object-id"))!;
  const originalX = await page.evaluate(
    (elementId) =>
      (
        window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
      ).__rivtoDemo.editor.elements.getElementNode(elementId)!.frame.x,
    id,
  );
  const before = (await shape.boundingBox())!;
  const start = { x: before.x + before.width / 2, y: before.y + before.height / 2, id: 1 };
  const session = await page.context().newCDPSession(page);
  await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [start] });
  await session.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ ...start, x: start.x + 60, y: start.y + 30 }],
  });
  await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect.poll(async () => (await shape.boundingBox())!.x - before.x).toBeGreaterThan(30);
  await expect
    .poll(() =>
      page.evaluate(
        (elementId) =>
          (
            window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
          ).__rivtoDemo.editor.elements.getElementNode(elementId)!.frame.x,
        id,
      ),
    )
    .toBeGreaterThan(originalX + 30);
  await session.detach();
});
