import { expect, test } from "@playwright/test";
import type { LabelTypingTiming, LabelTypingWindow } from "./types";

for (const repeat of [0, 200]) {
  test(`types into a visual label at repeat=${repeat}`, async ({ page }) => {
    await page.goto(repeat ? `/?repeat=${repeat}` : "/");
    await page.locator('[data-editor-mode="edgeless"]').click();
    const viewport = page.locator(".edgeless-viewport");
    await viewport.evaluate((element) => element.scrollIntoView({ block: "start" }));
    const box = await viewport.boundingBox();
    if (!box) {
      throw new Error("Expected the edgeless viewport");
    }
    const toolbar = page.getByRole("toolbar", { name: "Visual objects" });
    await toolbar.getByRole("button", { name: "Text", exact: true }).click();
    await page
      .getByRole("dialog", { name: "text tools" })
      .getByRole("button", { name: "Text", exact: true })
      .click();
    await page.mouse.click(box.x + box.width - 300, box.y + 200);
    await toolbar.getByRole("button", { name: "Select" }).click();
    const label = page.locator('[data-edgeless-visual-kind="text"] .edgeless-label-editor').last();
    await label.dblclick();
    const samples: LabelTypingTiming[] = [];
    for (let index = 0; index < 4; index += 1) {
      await label.evaluate((element) => {
        const state = window as unknown as LabelTypingWindow;
        state.labelTyping = null;
        let start = 0;
        element.addEventListener(
          "beforeinput",
          () => {
            start = performance.now();
          },
          { once: true, capture: true },
        );
        element.addEventListener(
          "input",
          () => {
            queueMicrotask(() => {
              const sync = performance.now() - start;
              requestAnimationFrame(() =>
                requestAnimationFrame(() => {
                  state.labelTyping = { sync, rendered: performance.now() - start };
                }),
              );
            });
          },
          { once: true },
        );
      });
      await page.keyboard.type("x");
      await expect(label).toHaveText("x".repeat(index + 1));
      await page.waitForFunction(
        () => (window as unknown as LabelTypingWindow).labelTyping !== null,
      );
      const timing = await page.evaluate(
        () => (window as unknown as LabelTypingWindow).labelTyping,
      );
      if (index > 0) {
        if (!timing) {
          throw new Error("Expected a completed label typing measurement");
        }
        samples.push(timing);
      }
    }
    await viewport.click({ position: { x: 24, y: 24 } });
    await expect(label).toHaveText("xxxx");
    console.log(`label typing repeat=${repeat}: ${JSON.stringify(samples)}`);
  });
}
