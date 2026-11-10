import { expect, test } from "@playwright/test";

for (const duration of [0, 1.2]) {
  test(`transitions TODO priority with duration ${duration}`, async ({ page }) => {
    await page.goto("/?test_features=1");
    await page.evaluate((value) => {
      (
        window as unknown as {
          __rivtoDemo: { reactEditor: { animations: Record<string, number> } };
        }
      ).__rivtoDemo.reactEditor.animations.todoPriority = value;
    }, duration);
    const todo = page.locator('[data-journal-document="today"] .rivto-todo-item').first();
    const priority = todo.getByLabel("Priority");
    await priority.selectOption("1");
    await expect(todo).toHaveAttribute("data-todo-priority", "1");
    const durations = await todo.evaluate((element) =>
      element.getAnimations().map((animation) => animation.effect?.getTiming().duration),
    );
    if (duration) {
      expect(durations).toContain(1200);
    } else {
      expect(durations).toHaveLength(0);
    }
  });
}
