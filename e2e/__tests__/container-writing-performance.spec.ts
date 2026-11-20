import { expect, test } from "@playwright/test";

for (const repeat of [0, 200]) {
  test(`starts writing in an empty TODO storage, repeat=${repeat}`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto(`/?repeat=${repeat}`);
    const storageId = await page.evaluate(
      () => window.__rivtoDemo.editor.blocks.insertBlock({ type: "todo-storage", content: "" }).id,
    );
    const storage = page.locator(`[data-block-id="${storageId}"]`).first();
    const control = storage.getByRole("button", { name: "Drop blocks into TODO storage" });
    const samples: Array<{ sync: number; frames: number }> = [];
    for (let index = 0; index < 3; index++) {
      await expect(control).toBeVisible();
      await page.evaluate(() => {
        const state = window as unknown as { containerWritingTiming: unknown };
        state.containerWritingTiming = null;
        window.addEventListener(
          "click",
          () => {
            const start = performance.now();
            document.getElementById("root")!.addEventListener(
              "click",
              () => {
                const sync = performance.now() - start;
                requestAnimationFrame(() =>
                  requestAnimationFrame(() => {
                    state.containerWritingTiming = { sync, frames: performance.now() - start };
                  }),
                );
              },
              { once: true },
            );
          },
          { capture: true, once: true },
        );
      });
      await control.click();
      const child = storage.locator(
        ':scope > .rivto-block-children > [data-block-type="paragraph"]',
      );
      await expect(child).toHaveCount(1);
      await expect(child.locator("[data-block-content]")).toBeFocused();
      await page.waitForFunction(
        () => (window as unknown as { containerWritingTiming: unknown }).containerWritingTiming,
      );
      samples.push(
        await page.evaluate(
          () =>
            (window as unknown as { containerWritingTiming: { sync: number; frames: number } })
              .containerWritingTiming,
        ),
      );
      await page.keyboard.press("ControlOrMeta+z");
      await expect(child).toHaveCount(0);
    }
    console.log(JSON.stringify({ interaction: "container-writing", repeat, samples }));
  });
}
