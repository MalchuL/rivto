import { expect, test } from "@playwright/test";

test("updates the virtualized canvas when its viewport changes size and remounts", async ({
  page,
}) => {
  await page.setViewportSize({ width: 600, height: 400 });
  await page.goto("/");
  const viewport = page.getByRole("main", { name: "Independent canvas" });
  const items = viewport.locator("[data-canvas-element]");
  await expect(items.first()).toBeVisible();
  const small = await items.count();
  await page.setViewportSize({ width: 1600, height: 1000 });
  await expect.poll(() => items.count()).toBeGreaterThan(small);
  const large = await items.count();
  await page.getByRole("button", { name: "Hide canvas" }).click();
  await expect(page.getByLabel("Canvas attachment")).toHaveText("detached");
  await page.getByRole("button", { name: "Show canvas" }).click();
  await expect(page.getByLabel("Canvas attachment")).toHaveText("mounted");
  await expect.poll(() => items.count()).toBe(large);
  await page.setViewportSize({ width: 600, height: 400 });
  await expect.poll(() => items.count()).toBe(small);
});
