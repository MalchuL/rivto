import { expect, test } from "@playwright/test";

for (const reducedMotion of [false, true]) {
  test(`transitions TODO priority with reduced motion ${reducedMotion}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: reducedMotion ? "reduce" : "no-preference" });
    await page.goto("/?test_features=1");
    const todo = page.locator('[data-journal-document="today"] .rivto-todo-item').first();
    await todo.getByLabel("Priority").selectOption("1");
    await expect(todo).toHaveAttribute("data-todo-priority", "1");
    await expect(todo).toHaveCSS("transition-duration", reducedMotion ? "0.1s" : "0.2s");
  });
}
