import { expect, test } from "@playwright/test";

test("routes pointer capture to the nearest wrapper through remounts", async ({ page }) => {
  await page.goto("/");
  const enabled = page.getByRole("checkbox", { name: "Demo wrapper", exact: true });
  await enabled.check();
  const outer = page.locator('[data-demo-wrapper="block-1"]');
  const inner = page.locator('[data-demo-wrapper="child-0"]');
  const text = page.getByRole("textbox", { name: "Text child-0", exact: true });
  await text.click();
  await expect(inner).toHaveAttribute("data-demo-wrapper-pointer", "true");
  await expect(outer).not.toHaveAttribute("data-demo-wrapper-pointer");
  await page.getByRole("checkbox", { name: "Editor mounted", exact: true }).uncheck();
  await page.getByRole("checkbox", { name: "Editor mounted", exact: true }).check();
  await expect(inner).not.toHaveAttribute("data-demo-wrapper-pointer");
  await text.click();
  await expect(inner).toHaveAttribute("data-demo-wrapper-pointer", "true");
  await expect(outer).not.toHaveAttribute("data-demo-wrapper-pointer");
  await enabled.uncheck();
  await expect(page.locator("[data-demo-wrapper]")).toHaveCount(0);
});
