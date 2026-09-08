import { expect, test } from "@playwright/test";
import { BLOCK_ID_ATTRIBUTE } from "./dom-markers";

test("edits and restores a live binding without reloading the editor", async ({ page }) => {
  await page.goto("/");
  const token = await page.evaluate(() => (
    (window as unknown as { __rivtoDemo?: { token: string } }).__rivtoDemo?.token
  ));
  expect(token).toBeTruthy();

  const panel = page.locator("[data-keyboard-panel]");
  await panel.locator("summary").click();
  const indentRow = panel.locator(`[data-binding-id="block.indent"]`);
  await expect(indentRow).toHaveAttribute("data-binding-status", "default");
  await indentRow.getByRole("button", { name: "Shortcut for block.indent" }).click();
  const recorder = page.getByRole("dialog", { name: /Record shortcut for block.indent/ });
  await expect(recorder).toBeVisible();
  await page.keyboard.press("Control+ArrowRight");
  await expect(page.locator("[data-keyboard-recorder-preview]")).toHaveText("Primary+ArrowRight");
  await page.keyboard.press("Enter");
  await expect(recorder).toHaveCount(0);
  await expect(indentRow).toHaveAttribute("data-binding-status", "overridden");

  const contents = page.locator("[data-journal-document=today] [data-block-content]");
  const first = contents.nth(0).locator(`xpath=ancestor::*[@${BLOCK_ID_ATTRIBUTE}][1]`);
  const secondContent = contents.nth(1);
  const second = secondContent.locator(`xpath=ancestor::*[@${BLOCK_ID_ATTRIBUTE}][1]`);
  const firstId = await first.getAttribute(BLOCK_ID_ATTRIBUTE);
  expect(firstId).toBeTruthy();

  await secondContent.click();
  await page.keyboard.press("Control+ArrowRight");
  await expect(second.locator(`xpath=ancestor::*[@${BLOCK_ID_ATTRIBUTE}][1]`))
    .toHaveAttribute(BLOCK_ID_ATTRIBUTE, firstId!);

  await indentRow.getByRole("button", { name: "Restore" }).click();
  await expect(indentRow).toHaveAttribute("data-binding-status", "default");
  expect(await page.evaluate(() => (
    (window as unknown as { __rivtoDemo?: { token: string } }).__rivtoDemo?.token
  ))).toBe(token);
});
