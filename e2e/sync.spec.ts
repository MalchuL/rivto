import { expect, test } from "@playwright/test";

for (const mode of ["Page", "Edgeless"] as const) {
  test(`keeps Markdown typing visible after inserting a paragraph in ${mode}`, async ({ page }) => {
    await page.goto(`/?sync=1&room=typing-${Date.now()}`);
    const left = page.locator('[data-editor-sync="left"]');
    const right = page.locator('[data-editor-sync="right"]');
    const selector = '[data-block-type="paragraph"] [data-block-content]';
    if (mode === "Edgeless") {
      await left.getByRole("button", { name: mode, exact: true }).click();
      await right.getByRole("button", { name: mode, exact: true }).click();
    }
    await expect(right.locator(selector)).toHaveCount(2);
    await left.locator(selector).first().click();
    await page.keyboard.press("Control+End");
    await page.keyboard.press("Enter");
    await expect(left.locator(selector)).toHaveCount(3);
    await expect(right.locator(selector)).toHaveCount(3);
    await page.keyboard.type("New paragraph");
    await expect(left.locator(selector).nth(1)).toHaveText("New paragraph");
    await expect(right.locator(selector).nth(1)).toHaveText("New paragraph");
    await expect(left.locator(selector).nth(1)).toHaveCSS("position", "static");
    await expect(left.locator(selector).nth(1).locator("..")).toHaveCSS(
      "content-visibility",
      "visible",
    );
    await expect(right.locator(".markdown-preview").nth(1)).toHaveText("New paragraph");
    await left.locator(selector).last().click();
    await page.keyboard.press("Control+End");
    await page.keyboard.type(" existing");
    await expect(left.locator(selector).last()).toContainText(" existing");
    await expect(right.locator(selector).last()).toContainText(" existing");
    await expect(left.locator(selector).last().locator("..")).toHaveCSS(
      "content-visibility",
      "visible",
    );
    await right.locator(selector).nth(1).click();
    await page.keyboard.press("Control+End");
    await page.keyboard.type(" remote");
    await expect(right.locator(selector).nth(1)).toHaveText("New paragraph remote");
    await expect(left.locator(selector).nth(1)).toHaveText("New paragraph remote");
    await page.keyboard.press("Enter");
    await expect(left.locator(selector)).toHaveCount(4);
    await page.keyboard.type("Right paragraph");
    await expect(right.locator(selector).nth(2)).toHaveText("Right paragraph");
    await expect(left.locator(selector).nth(2)).toHaveText("Right paragraph");
    await expect(right.locator(selector).nth(2).locator("..")).toHaveCSS(
      "content-visibility",
      "visible",
    );
  });
}
