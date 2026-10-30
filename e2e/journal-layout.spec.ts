import { expect, test } from "@playwright/test";

for (const repeat of [0, 200]) {
  test(`journal chrome follows Page and Edgeless mode, repeat=${repeat}`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.goto(`/?repeat=${repeat}`);
    const stack = page.locator(".journal-stack");
    const today = page.locator('[data-journal-document="today"]');
    const title = today.locator(".journal-date");
    await expect(today.locator(":scope > .page-surface")).toBeVisible();
    await expect(title).toBeVisible();
    const initial = (await stack.boundingBox())!;
    await expect(stack).toHaveCSS("overflow", "hidden");
    await today.getByRole("button", { name: "Edgeless", exact: true }).click();
    await expect(today.locator(":scope > .edgeless-viewport")).toBeVisible();
    await expect(stack).toHaveCSS("overflow", "visible");
    await expect(stack).toHaveCSS("border-top-width", "0px");
    await expect(title).toBeHidden();
    expect((await stack.boundingBox())!.width).toBeGreaterThan(initial.width);
    await today.getByRole("button", { name: "Page", exact: true }).click();
    await expect(today.locator(":scope > .page-surface")).toBeVisible();
    await expect(title).toBeVisible();
    await expect(stack).toHaveCSS("overflow", "hidden");
    await expect(stack).toHaveCSS("border-top-width", "1px");
    expect((await stack.boundingBox())!.width).toBeCloseTo(initial.width, 0);
    await expect(page.locator('[data-journal-document="yesterday"]')).toBeVisible();
  });
}
