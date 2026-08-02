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
