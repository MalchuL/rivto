import { expect, test } from "@playwright/test";

test("dismisses the standalone canvas toolbar on Escape", async ({ page }) => {
  await page.goto("/");
  const toolbar = page.getByRole("toolbar", { name: "Canvas tools" });
  const group = toolbar.getByRole("button", { name: "Shapes" });
  const samples: { sync: number; frames: number }[] = [];
  for (let index = 0; index < 4; index += 1) {
    await group.click();
    await expect(toolbar.getByRole("dialog", { name: "shapes" })).toBeVisible();
    await page.evaluate(() => {
      const state = window as unknown as { toolbarTiming: { sync: number; frames: number } | null };
      state.toolbarTiming = null;
      let start = 0;
      window.addEventListener(
        "keydown",
        () => {
          start = performance.now();
        },
        { capture: true, once: true },
      );
      document.addEventListener(
        "keydown",
        () => {
          const sync = performance.now() - start;
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              state.toolbarTiming = { sync, frames: performance.now() - start };
            }),
          );
        },
        { once: true },
      );
    });
    await page.keyboard.press("Escape");
    await expect(toolbar.getByRole("dialog", { name: "shapes" })).toHaveCount(0);
    await page.waitForFunction(
      () => (window as unknown as { toolbarTiming: unknown }).toolbarTiming !== null,
    );
    samples.push(
      await page.evaluate(
        () =>
          (window as unknown as { toolbarTiming: { sync: number; frames: number } }).toolbarTiming,
      ),
    );
  }
  console.log(
    JSON.stringify({ interaction: "canvas-toolbar-dismissal", samples: samples.slice(1) }),
  );
});
