import { expect, test } from "@playwright/test";

test("secondary input cancels drawing tools outside editor controls", async ({ page }) => {
  await page.goto("/");
  await page.locator('[data-editor-mode="edgeless"]').click();
  const surface = page.locator('[data-rivto-block-editor][data-rivto-surface="edgeless"]').first();
  await expect(surface).toBeVisible();
  const toolbar = page.getByRole("toolbar", { name: "Visual objects" });
  const drawing = toolbar.getByRole("button", { name: "Drawing" });
  await drawing.click();
  await page
    .getByRole("dialog", { name: "drawing tools" })
    .getByRole("button", { name: "Marker", exact: true })
    .click();
  await expect(surface).toHaveAttribute("data-edgeless-capture-tool", "true");
  await drawing.dispatchEvent("pointerdown", { button: 2, bubbles: true, cancelable: true });
  await expect(surface).toHaveAttribute("data-edgeless-capture-tool", "true");
  await surface.dispatchEvent("pointerdown", { button: 2, bubbles: true, cancelable: true });
  await expect(surface).toHaveAttribute("data-edgeless-capture-tool", "false");
  await drawing.click();
  await page
    .getByRole("dialog", { name: "drawing tools" })
    .getByRole("button", { name: "Marker", exact: true })
    .click();
  const defaultPrevented = await surface.evaluate((element) => {
    const event = new MouseEvent("contextmenu", { button: 2, bubbles: true, cancelable: true });
    element.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(defaultPrevented).toBe(true);
  await expect(surface).toHaveAttribute("data-edgeless-capture-tool", "false");
});
