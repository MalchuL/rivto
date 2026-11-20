import { expect, test } from "@playwright/test";

test("suppresses pointer click activation while preserving Enter and Space", async ({ page }) => {
  await page.goto("/");
  await page.locator('[data-editor-mode="edgeless"]').click();
  const toolbar = page.getByRole("toolbar", { name: "Visual objects" });
  await toolbar.getByRole("button", { name: "Shapes", exact: true }).click();
  const preset = toolbar.getByRole("button", { name: "Ellipse", exact: true });
  await page.evaluate(() => {
    const state = window as Window & {
      presetClicks?: Array<{ detail: number; prevented: boolean }>;
    };
    state.presetClicks = [];
    window.addEventListener("click", (event) => {
      const target = event.target;
      if (target instanceof Element && target.closest('[data-canvas-tool="ellipse"]')) {
        state.presetClicks?.push({ detail: event.detail, prevented: event.defaultPrevented });
      }
    });
  });
  await preset.click();
  await expect(page.locator(".edgeless-drawing-capture[data-active]")).toBeVisible();
  await preset.focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Space");
  const clicks = await page.evaluate(
    () => (window as Window & { presetClicks?: unknown }).presetClicks,
  );
  expect(clicks).toEqual([
    { detail: 1, prevented: true },
    { detail: 0, prevented: false },
    { detail: 0, prevented: false },
  ]);
});
