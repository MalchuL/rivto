/**
 * Covers the opt-in OpenUI block in the journal demo: drawn examples stay
 * visual until Edit is used, and Draw writes the edited program back.
 *
 * @module
 */
import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("draws seeded OpenUI programs and edits one through the Draw control", async ({ page }) => {
  const document = page.locator('[data-journal-document="today"]');
  const blocks = document.locator('[data-block-type="openui"]');
  await expect(blocks).toHaveCount(3);

  const table = blocks.nth(0);
  const chart = blocks.nth(1);
  const form = blocks.nth(2);
  await expect(table).toContainText("Top Languages");
  await expect(table).toContainText("TypeScript");
  await expect(chart).toContainText("Q4 Revenue");
  await expect(form).toContainText("Contact Us");
  await expect(form.getByRole("button", { name: "Submit", exact: true })).toBeVisible();
  await expect(table.locator("textarea")).toHaveCount(0);

  await table.getByText("Python").click();
  await expect(table.locator("[data-openui-mode]")).toHaveAttribute("data-openui-mode", "draw");
  await expect(table.locator("textarea")).toHaveCount(0);

  await table.getByRole("button", { name: "Edit OpenUI source" }).click();
  const source = table.getByRole("textbox", { name: "OpenUI source" });
  await expect(source).toBeVisible();
  await expect(table.locator("[data-openui-mode]")).toHaveAttribute("data-openui-mode", "edit");
  const value = await source.inputValue();
  await source.fill(value.replace("Top Languages", "Edited Languages"));
  await table.getByRole("button", { name: "Draw OpenUI source" }).click();

  await expect(table.locator("[data-openui-mode]")).toHaveAttribute("data-openui-mode", "draw");
  await expect(table).toContainText("Edited Languages");
  await expect(table.locator("textarea")).toHaveCount(0);
  await expect(chart).toContainText("Q4 Revenue");
});
