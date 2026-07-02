import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Reset document" }).click();
});

test("edits blocks, opens slash commands, and persists content", async ({ page }) => {
  const paragraph = page.getByRole("textbox", { name: "Paragraph" }).first();
  await paragraph.fill("Persistent paragraph");
  await expect(paragraph).toHaveText("Persistent paragraph");

  await page.reload();
  await expect(page.getByRole("textbox", { name: "Paragraph" }).first()).toHaveText("Persistent paragraph");

  await paragraph.fill("/");
  await expect(page.getByRole("menu")).toBeVisible();
  await page.getByRole("menuitem", { name: "Heading 2" }).click();
  await expect(page.locator('[data-type="heading2"]')).toBeVisible();
});

test("switches the same document between page and edgeless views", async ({ page }) => {
  const text = "One document, two views";
  await page.getByRole("textbox", { name: "Paragraph" }).first().fill(text);
  await page.getByRole("button", { name: "Edgeless" }).click();
  await expect(page.locator(".rv-canvas")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Paragraph" }).first()).toHaveText(text);

  await page.getByRole("button", { name: "Page" }).click();
  await expect(page.locator(".rv-page")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Paragraph" }).first()).toHaveText(text);
});
