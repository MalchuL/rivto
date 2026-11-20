import { expect, test } from "@playwright/test";

test("preserves nested layout input order after a view remount", async ({ page }) => {
  await page.goto("/__tests__/layout-input.html");
  const control = page.getByRole("button", { name: "Control child-0", exact: true });
  const order = page.getByLabel("Input order");
  await control.click();
  const delivery = "children capture,row capture,row bubble,children bubble";
  await expect(order).toHaveText(delivery);
  await page.getByRole("button", { name: "Toggle editor" }).click();
  await expect(control).toHaveCount(0);
  await page.getByRole("button", { name: "Toggle editor" }).click();
  await control.click();
  await expect(order).toHaveText(`${delivery},${delivery}`);
});

test("preserves nested slot capture and bubble order after remount", async ({ page }) => {
  await page.goto("/__tests__/layout-input.html");
  const control = page.getByRole("button", { name: "Slot child-0", exact: true });
  const order = page.getByLabel("Input order");
  const delivery =
    "children capture,row capture,slot capture,slot bubble,row bubble,children bubble";
  await control.click();
  await expect(order).toHaveText(delivery);
  await page.getByRole("button", { name: "Toggle editor" }).click();
  await expect(control).toHaveCount(0);
  await page.getByRole("button", { name: "Toggle editor" }).click();
  await control.click();
  await expect(order).toHaveText(`${delivery},${delivery}`);
});

test("preserves shell input through composed drop targeting and remount", async ({ page }) => {
  await page.goto("/__tests__/layout-input.html");
  const control = page.getByRole("button", { name: "Shell control", exact: true });
  const order = page.getByLabel("Input order");
  await control.click();
  await expect(order).toHaveText("shell capture,shell bubble");
  await page.getByRole("button", { name: "Toggle editor" }).click();
  await expect(control).toHaveCount(0);
  await page.getByRole("button", { name: "Toggle editor" }).click();
  await control.click();
  await expect(order).toHaveText("shell capture,shell bubble,shell capture,shell bubble");
});

test("preserves foreign DOM target identity after its window is removed", async ({ page }) => {
  await page.goto("/__tests__/layout-input.html");
  await page.getByRole("button", { name: "Check foreign target" }).click();
  await expect(page.getByLabel("Input order")).toHaveText("foreign target ok");
});
