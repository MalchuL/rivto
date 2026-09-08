import { expect, test } from "@playwright/test";

test("renders today and yesterday as one seamless two-document journal", async ({ page }) => {
  await page.goto("/");
  const documents = page.locator("[data-journal-document]");
  await expect(documents).toHaveCount(2);

  const expected = await page.evaluate(() => {
    const key = (date: Date) => [date.getFullYear(), date.getMonth() + 1, date.getDate()]
      .map((part) => String(part).padStart(2, "0"))
      .join("-");
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    return [key(today), key(yesterday)];
  });
  await expect(documents.nth(0).locator("time")).toHaveAttribute("datetime", expected[0]!);
  await expect(documents.nth(1).locator("time")).toHaveAttribute("datetime", expected[1]!);
  await expect(documents.nth(1).locator(".page-surface")).toHaveAttribute("data-empty", "true");
  await expect(documents.locator(".page-surface")).toHaveCount(2);

  await documents.nth(1).getByRole("button", { name: "Add block", exact: true }).click();
  await expect(documents.nth(1).locator(".page-surface > [data-block-id]")).toHaveCount(1);
  await expect(documents.nth(0).locator(".page-surface > [data-block-id]")).not.toHaveCount(0);
});

test("moves the caret across journal editors at page boundaries", async ({ page }) => {
  await page.goto("/");
  const today = page.locator('[data-journal-document="today"]');
  const yesterday = page.locator('[data-journal-document="yesterday"]');
  await yesterday.getByRole("button", { name: "Add block", exact: true }).click();

  const lastToday = today.locator("[data-block-content]").last();
  const firstYesterday = yesterday.locator("[data-block-content]").first();
  await lastToday.click();
  await page.keyboard.press("End");
  await page.keyboard.press("ArrowDown");
  await expect(firstYesterday).toBeFocused();

  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowUp");
  await expect(lastToday).toBeFocused();
});
