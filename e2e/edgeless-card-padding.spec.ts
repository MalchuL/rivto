import { expect, test } from "@playwright/test";

test("keeps canvas card top padding equal to its bottom padding", async ({ page }) => {
  await page.goto("/");
  const today = page.locator('[data-journal-document="today"]');
  await expect(today.locator(":scope > .page-surface")).toHaveCSS("padding-top", "12px");
  await page.getByRole("button", { name: "Edgeless", exact: true }).click();
  const content = today.locator(".edgeless-card-content").first();
  await expect(content).toHaveCSS("padding-top", "56px");
  await expect(content).toHaveCSS("padding-bottom", "56px");
  await expect(content).toHaveCSS("padding-left", "56px");
  await expect(content).toHaveCSS("padding-right", "56px");
  await expect
    .poll(() =>
      content.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        const blocks = element.querySelectorAll(":scope > .rivto-block");
        const first = blocks[0].getBoundingClientRect();
        const last = blocks[blocks.length - 1].getBoundingClientRect();
        return Math.abs(first.top - bounds.top - (bounds.bottom - last.bottom));
      }),
    )
    .toBeLessThan(1);
  await today.locator(":scope > .edgeless-viewport").evaluate((element) => {
    (element as HTMLElement).style.setProperty("--rivto-edgeless-card-padding", "24px 32px");
  });
  await expect(content).toHaveCSS("padding-top", "24px");
  await expect(content).toHaveCSS("padding-bottom", "24px");
  await expect(content).toHaveCSS("padding-left", "32px");
  await page.getByRole("button", { name: "Page", exact: true }).click();
  await expect(today.locator(":scope > .page-surface")).toHaveCSS("padding-top", "12px");
  await expect(today.locator(":scope > .page-surface")).toHaveCSS("padding-bottom", "56px");
});
