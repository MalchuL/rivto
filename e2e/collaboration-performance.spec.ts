import { expect, test } from "@playwright/test";
import type { DocumentEditorAPI } from "@chulane/rivto";

interface PresenceMetrics {
  started: number;
  samples: number[];
  synchronous: number[];
  forestReads: number;
  documentUpdates: number;
}
type InspectedWindow = Window & {
  __presenceMetrics: PresenceMetrics;
  __rivtoSync: { left: { editor: DocumentEditorAPI }; right: { editor: DocumentEditorAPI } };
};

for (const mode of ["Page", "Edgeless", "Page whitespace"] as const) {
  for (const repeat of [0, 200]) {
    test(`presence cost in ${mode}, repeat=${repeat}`, async ({ page }, testInfo) => {
      await page.goto(`/?sync=1&repeat=${repeat}&room=presence-cost-${crypto.randomUUID()}`);
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
      await expect(page.locator('[data-collaboration-kind="caret"]')).toHaveCount(1);
      await page.evaluate(() => {
        const inspected = window as unknown as InspectedWindow;
        const metrics: PresenceMetrics = {
          started: 0,
          samples: [],
          synchronous: [],
          forestReads: 0,
          documentUpdates: 0,
        };
        inspected.__presenceMetrics = metrics;
        for (const { editor } of Object.values(inspected.__rivtoSync)) {
          const doc = editor.getDocument();
          const getBlocks = doc.blocks.getBlocks.bind(doc.blocks);
          doc.blocks.getBlocks = () => {
            metrics.forestReads++;
            return getBlocks();
          };
          doc.subscribe(() => metrics.documentUpdates++);
          const publish = doc.collaboration.setLocalState.bind(doc.collaboration);
          doc.collaboration.setLocalState = (state) => {
            const start = performance.now();
            publish(state);
            metrics.synchronous.push(performance.now() - start);
          };
        }
        document
          .querySelector('[data-editor-sync="left"] [data-rivto-surface]')!
          .addEventListener("pointermove", () => (metrics.started = performance.now()), true);
        let previous = "";
        new MutationObserver(() => {
          const pointer = document.querySelector<HTMLElement>(
            '[data-collaboration-kind="pointer"]',
          );
          const current = pointer?.style.cssText ?? "";
          if (pointer && current !== previous && metrics.started) {
            const start = metrics.started;
            metrics.started = 0;
            let previousTransform = "";
            let stillFrames = 0;
            const settled = () => {
              const transform = getComputedStyle(pointer).transform;
              stillFrames = transform === previousTransform ? stillFrames + 1 : 0;
              previousTransform = transform;
              if (stillFrames < 2) {
                requestAnimationFrame(settled);
                return;
              }
              requestAnimationFrame(() =>
                requestAnimationFrame(() => metrics.samples.push(performance.now() - start)),
              );
            };
            requestAnimationFrame(settled);
          }
          previous = current;
        }).observe(document.body, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ["style"],
        });
      });
      const target = mode === "Page whitespace" ? left.locator("[data-rivto-surface]") : text;
      const bounds = (await target.boundingBox())!;
      for (let sample = 0; sample < 6; sample++) {
        await page.mouse.move(
          bounds.x + 40 + sample * 15,
          bounds.y + (mode === "Page whitespace" ? 5 : 10),
        );
        await expect
          .poll(() =>
            page.evaluate(
              () => (window as unknown as InspectedWindow).__presenceMetrics.samples.length,
            ),
          )
          .toBe(sample + 1);
      }
      if (mode === "Page whitespace") {
        await expect
          .poll(() =>
            page.evaluate(() => {
              const collaboration = (
                window as unknown as InspectedWindow
              ).__rivtoSync.left.editor.getDocument().collaboration;
              return collaboration.getStates().get(collaboration.clientId)?.pointer;
            }),
          )
          .toHaveProperty("type", "panel");
      }
      const metrics = await page.evaluate(
        () => (window as unknown as InspectedWindow).__presenceMetrics,
      );
      // Includes the 50 ms throttle, pointer transition, and two frames after settling.
      expect(Math.max(...metrics.samples.slice(1))).toBeLessThan(250);
      expect(metrics.forestReads).toBe(0);
      expect(metrics.documentUpdates).toBe(0);
      await expect(page.locator('[data-collaboration-kind="pointer"]')).toHaveCount(1);
      await expect(page.locator('[data-collaboration-kind="caret"]')).toHaveCount(1);
      await expect(right.locator("[data-collaboration-text]")).toHaveCount(1);
      console.log(
        JSON.stringify({
          browser: testInfo.project.name,
          mode,
          repeat,
          samples: metrics.samples.slice(1),
          synchronous: metrics.synchronous.slice(1),
          forestReads: metrics.forestReads,
          documentUpdates: metrics.documentUpdates,
        }),
      );
    });
  }
}
