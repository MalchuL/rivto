import { expect, test } from "@playwright/test";

for (const setting of ["enabled", "zero", "omitted"] as const) {
  test(`uses the ${setting} TODO status animation setting`, async ({ page }) => {
    await page.goto("/?test_features=1");
    await page.evaluate((value) => {
      const animations = (
        window as unknown as {
          __rivtoDemo: { reactEditor: { animations: Record<string, number> } };
        }
      ).__rivtoDemo.reactEditor.animations;
      if (value === "omitted") {
        delete animations.todoStatus;
      } else {
        animations.todoStatus = value === "zero" ? 0 : 1.2;
      }
    }, setting);
    const todo = page
      .locator('[data-journal-document="today"] [data-block-type="todo-item"]')
      .first();
    await todo.getByRole("button", { name: /Status: todo/ }).click();
    const icon = todo.getByRole("button", { name: /Status: doing/ }).locator("span");
    await expect(icon).toBeVisible();
    const timings = await icon.evaluate((element) =>
      element.getAnimations().map((animation) => animation.effect?.getTiming().duration),
    );
    if (setting === "enabled") {
      expect(timings).toContain(1200);
    } else {
      expect(timings).toHaveLength(0);
    }
  });
}

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
    await button.click();
    const next = row.getByRole("button", { name: /Status: doing/ });
    await expect(next).toBeVisible();
    await expect(next.locator("svg")).toHaveCount(1);
    await next.click();
    await expect(row.getByRole("button", { name: /Status: done/ })).toBeVisible();
  });
}
