import { expect, test } from "@playwright/test";
import type { DocumentEditorAPI } from "@chulane/rivto";

type TypingWindow = Window & {
  __rivtoSync: { left: { editor: DocumentEditorAPI } };
  __typing: { started: number; updates: number[]; forestReads: number };
};

for (const mode of ["Page", "Edgeless"] as const) {
  for (const repeat of [0, 200]) {
    test(`collaborative typing in ${mode}, repeat=${repeat}`, async ({ page }, testInfo) => {
      await page.goto(`/?sync=1&repeat=${repeat}&room=typing-cost-${crypto.randomUUID()}`);
      const left = page.locator('[data-editor-sync="left"]');
      const right = page.locator('[data-editor-sync="right"]');
      await expect(right.locator("[data-block-content]")).toHaveCount(2 + repeat);
      if (mode === "Edgeless") {
        await left.getByRole("button", { name: mode, exact: true }).click();
        await right.getByRole("button", { name: mode, exact: true }).click();
      }
      const text = left.locator("[data-block-content]").first();
      await text.click();
      await page.keyboard.press("Home");
      await page.keyboard.press("ArrowRight");
      await page.keyboard.press("ArrowRight");
      const before = (await text.textContent())!;
      await page.evaluate(() => {
        const inspected = window as unknown as TypingWindow;
        const metrics = { started: 0, updates: [] as number[], forestReads: 0 };
        inspected.__typing = metrics;
        const doc = inspected.__rivtoSync.left.editor.getDocument();
        const update = doc.blocks.updateBlocks.bind(doc.blocks);
        doc.blocks.updateBlocks = (patches) => {
          const start = performance.now();
          const result = update(patches);
          metrics.updates.push(performance.now() - start);
          return result;
        };
        const getBlocks = doc.blocks.getBlocks.bind(doc.blocks);
        doc.blocks.getBlocks = () => {
          metrics.forestReads++;
          return getBlocks();
        };
        document.querySelector('[data-editor-sync="left"] [data-rivto-surface]')!.addEventListener(
          "beforeinput",
          () => {
            metrics.started = performance.now();
          },
          true,
        );
      });
      const samples: number[] = [];
      for (let index = 0; index < 6; index++) {
        await page.keyboard.type("x");
        const settled = await page.evaluate(
          () =>
            new Promise<{ elapsed: number; offset: number }>((resolve) => {
              requestAnimationFrame(() =>
                requestAnimationFrame(() =>
                  resolve({
                    elapsed:
                      performance.now() - (window as unknown as TypingWindow).__typing.started,
                    offset: window.getSelection()!.focusOffset,
                  }),
                ),
              );
            }),
        );
        expect(settled.offset).toBe(3 + index);
        await expect(text).toHaveText(before.slice(0, 2) + "x".repeat(index + 1) + before.slice(2));
        samples.push(settled.elapsed);
      }
      await expect(right.locator("[data-block-content]").first()).toHaveText(
        (await text.textContent()) ?? "",
      );
      const metrics = await page.evaluate(() => (window as unknown as TypingWindow).__typing);
      expect(metrics.forestReads).toBe(0);
      expect(metrics.updates).toHaveLength(6);
      console.log(
        JSON.stringify({
          browser: testInfo.project.name,
          mode,
          repeat,
          samples: samples.slice(1),
          synchronous: metrics.updates.slice(1),
          forestReads: metrics.forestReads,
        }),
      );
    });
  }
}
