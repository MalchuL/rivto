import { expect, test } from "@playwright/test";

for (const reducedMotion of ["no-preference", "reduce"] as const) {
  test(`updates TODO status immediately with ${reducedMotion} motion`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion });
    await page.goto("/?test_features=1");
    const todo = page
      .locator('[data-journal-document="today"] [data-block-type="todo-item"]')
      .first();
    const id = await todo.getAttribute("data-block-id");
    expect(id).toBeTruthy();
    const row = page.locator(`[data-journal-document="today"] [data-block-id="${id}"]`);
    const button = row.getByRole("button", { name: /Status: todo/ });
    await button.focus();
    await page.keyboard.press("Space");
    const next = row.getByRole("button", { name: /Status: doing/ });
    await expect(next).toBeVisible();
    await expect(next.locator("svg")).toHaveCount(1);
    expect(await next.locator("svg").evaluate((element) => element.getAnimations().length)).toBe(0);
    await next.click();
    await expect(row.getByRole("button", { name: /Status: done/ })).toBeVisible();
  });
}
