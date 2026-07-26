import { expect, test } from "@playwright/test";
import { BLOCK_ID_ATTRIBUTE } from "./dom-markers";

test("remaps and disables semantic bindings through the global keymap", async ({ page }) => {
  await page.goto("/?keymap=alternate");
  const contents = page.locator("[data-block-content]");
  const first = contents.nth(0).locator(`xpath=ancestor::*[@${BLOCK_ID_ATTRIBUTE}][1]`);
  const secondContent = contents.nth(1);
  const second = secondContent.locator(`xpath=ancestor::*[@${BLOCK_ID_ATTRIBUTE}][1]`);
  const firstId = await first.getAttribute(BLOCK_ID_ATTRIBUTE);
  expect(firstId).toBeTruthy();

  await secondContent.click();
  await page.keyboard.press("Control+ArrowRight");
  await expect(second.locator(`xpath=ancestor::*[@${BLOCK_ID_ATTRIBUTE}][1]`))
    .toHaveAttribute(BLOCK_ID_ATTRIBUTE, firstId!);

  // The same preset disables the ordinary outdent action. Its key is left to
  // native focus behavior, and the document hierarchy remains unchanged.
  await secondContent.click();
  await page.keyboard.press("Shift+Tab");
  await expect(second.locator("xpath=ancestor::*[@data-block-id][1]"))
    .toHaveAttribute(BLOCK_ID_ATTRIBUTE, firstId!);
});
