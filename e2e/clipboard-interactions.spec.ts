import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Reset document" }).click();
});

test("updates focused block DOM immediately after plain paste", async ({ page }) => {
  const content = page.locator("[data-rivto-block-content]").first();
  await content.click();
  await page.keyboard.press("End");

  await content.evaluate((element) => {
    const data = new DataTransfer();
    data.setData("text/plain", " pasted");
    const event = new ClipboardEvent("paste", {
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(event, "clipboardData", { value: data });
    element.dispatchEvent(event);
  });

  await expect(content).toContainText("# Rivto, block by block pasted");
});
