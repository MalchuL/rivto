import { expect, test } from "@playwright/test";

for (const repeat of [0, 200]) {
  test(`visual label places the caret near a double-click at repeat=${repeat}`, async ({
    page,
  }) => {
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
    await page.keyboard.type("ABCDEFGHIJ");
    await viewport.click({ position: { x: 24, y: 24 } });
    await expect(label).toHaveText("ABCDEFGHIJ");
    await page.evaluate(() => {
      const win = window as unknown as Window & {
        caretTiming: { sync: number[]; rendered: number[] };
      };
      win.caretTiming = { sync: [], rendered: [] };
      const selection = document.getSelection()!;
      const set = selection.setBaseAndExtent.bind(selection);
      selection.setBaseAndExtent = (...args) => {
        const start = performance.now();
        try {
          return set(...args);
        } finally {
          win.caretTiming.sync.push(performance.now() - start);
        }
      };
      window.addEventListener(
        "pointerdown",
        () => {
          const start = performance.now();
          requestAnimationFrame(() =>
            requestAnimationFrame(() => win.caretTiming.rendered.push(performance.now() - start)),
          );
        },
        true,
      );
    });
    const samples: { sync: number; rendered: number }[] = [];
    for (let index = 0; index < 4; index += 1) {
      const point = await label.evaluate((element) => {
        const text = element.firstChild;
        if (!text) {
          throw new Error("Expected label text");
        }
        const range = document.createRange();
        range.setStart(text, 4);
        range.setEnd(text, 5);
        const rect = range.getBoundingClientRect();
        return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
      });
      await page.evaluate(() => {
        (
          window as unknown as Window & { caretTiming: { sync: number[]; rendered: number[] } }
        ).caretTiming = {
          sync: [],
          rendered: [],
        };
      });
      await page.mouse.dblclick(point.x, point.y);
      await expect(label).toBeFocused();
      const offset = await page.evaluate(() => document.getSelection()?.anchorOffset ?? -1);
      expect(offset).toBeGreaterThan(0);
      expect(offset).toBeLessThan(10);
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              (window as unknown as Window & { caretTiming: { rendered: number[] } }).caretTiming
                .rendered.length,
          ),
        )
        .toBeGreaterThan(1);
      const timing = await page.evaluate(
        () =>
          (window as unknown as Window & { caretTiming: { sync: number[]; rendered: number[] } })
            .caretTiming,
      );
      expect(timing.sync.length).toBeGreaterThan(0);
      if (index > 0) {
        samples.push({ sync: timing.sync.at(-1)!, rendered: timing.rendered.at(-1)! });
      }
      await viewport.click({ position: { x: 24, y: 24 } });
    }
    console.log(`label caret repeat=${repeat}: ${JSON.stringify(samples)}`);
  });
}
