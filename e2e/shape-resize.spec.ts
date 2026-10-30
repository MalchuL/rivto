import { expect, test } from "@playwright/test";
import type { DocumentEditorAPI } from "@chulane/rivto";

for (const repeat of [0, 200]) {
  for (const kind of ["Rectangle", "Ellipse"]) {
    test(`${kind} borders stay fixed during resize, repeat=${repeat}`, async ({ page }) => {
      test.setTimeout(120_000);
      await page.goto(`/?repeat=${repeat}`);
      await page.locator('[data-editor-mode="edgeless"]').click();
      const toolbar = page.getByRole("toolbar", { name: "Visual objects" });
      await toolbar.getByRole("button", { name: "Shapes", exact: true }).click();
      await toolbar.getByRole("button", { name: kind, exact: true }).click();
      const canvas = page.locator(".edgeless-viewport");
      const bounds = (await canvas.boundingBox())!;
      await page.mouse.click(bounds.x + 200, bounds.y + 220);
      await toolbar.getByRole("button", { name: "Select", exact: true }).click();
      const host = page.locator(`[data-edgeless-visual-kind="${kind.toLowerCase()}"]`).last();
      const node = host.locator("rect, ellipse");
      const id = (await host.getAttribute("data-edgeless-object-id"))!;
      const stored = () =>
        page.evaluate((id) => {
          const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
            .__rivtoDemo.editor;
          return editor.elements.getElementNode(id);
        }, id);
      await page.evaluate((id) => {
        const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
          .__rivtoDemo.editor;
        editor.elements.updateElement(id, { props: { strokeWidth: 16 } });
      }, id);
      await expect(node).toHaveAttribute("stroke-width", "16");
      const original = await stored();
      const originalHost = (await host.boundingBox())!;
      const originalNode = (await node.boundingBox())!;
      const originalScale = await node.evaluate(
        (shape: SVGGraphicsElement) => shape.getScreenCTM()!.a,
      );
      const handle = page.locator(
        '[data-edgeless-controls-for] [data-edgeless-resize-handle="se"]',
      );
      const start = (await handle.boundingBox())!;
      const x = start.x + start.width / 2,
        y = start.y + start.height / 2;
      await page.keyboard.down("Alt");
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.evaluate(() => {
        const state = window as unknown as {
          __rivtoDemo: { editor: DocumentEditorAPI };
          resizeDocumentUpdates: number;
          stopResizeObservation: () => void;
        };
        state.resizeDocumentUpdates = 0;
        state.stopResizeObservation = state.__rivtoDemo.editor.subscribe(() => {
          state.resizeDocumentUpdates += 1;
        });
      });
      const samples = [];
      await page.mouse.move(x + 20, y + 10);
      for (const delta of [40, 60, 80]) {
        await page.evaluate(() => {
          const state = window as unknown as {
            resizeTiming: null | { sync: number; frames: number };
          };
          state.resizeTiming = null;
          let start = 0;
          window.addEventListener(
            "mousemove",
            () => {
              start = performance.now();
            },
            { capture: true, once: true },
          );
          window.addEventListener(
            "mousemove",
            () => {
              const sync = performance.now() - start;
              requestAnimationFrame(() =>
                requestAnimationFrame(() => {
                  state.resizeTiming = { sync, frames: performance.now() - start };
                }),
              );
            },
            { once: true },
          );
        });
        await page.mouse.move(x + delta, y + delta / 2);
        await page.waitForFunction(
          () => (window as unknown as { resizeTiming: unknown }).resizeTiming !== null,
        );
        samples.push(
          await page.evaluate(() => (window as unknown as { resizeTiming: unknown }).resizeTiming),
        );
        expect(await stored()).toEqual(original);
        expect(
          await page.evaluate(
            () => (window as unknown as { resizeDocumentUpdates: number }).resizeDocumentUpdates,
          ),
        ).toBe(0);
      }
      console.log(JSON.stringify({ interaction: "shape-resize-preview", kind, repeat, samples }));
      const previewHost = (await host.boundingBox())!;
      const previewNode = (await node.boundingBox())!;
      expect(previewHost.width).toBeGreaterThan(originalHost.width + 50);
      expect(previewHost.width - previewNode.width).toBeCloseTo(
        originalHost.width - originalNode.width,
        1,
      );
      expect(previewHost.height - previewNode.height).toBeCloseTo(
        originalHost.height - originalNode.height,
        1,
      );
      if (kind === "Rectangle") {
        expect(
          await node.evaluate((shape: SVGGraphicsElement) => shape.getScreenCTM()!.a),
        ).toBeCloseTo(originalScale, 3);
        await expect(node).toHaveAttribute("rx", "3");
      }
      await page.mouse.up();
      await page.keyboard.up("Alt");
      const updates = await page.evaluate(() => {
        const state = window as unknown as {
          resizeDocumentUpdates: number;
          stopResizeObservation: () => void;
        };
        state.stopResizeObservation();
        return state.resizeDocumentUpdates;
      });
      expect(updates).toBeGreaterThan(0);
      expect((await stored())!.frame.width).toBeCloseTo(
        (original!.frame.width * previewHost.width) / originalHost.width,
        1,
      );
      const committedFrame = (await stored())!.frame;
      const committedNode = (await node.boundingBox())!;
      for (const key of ["x", "y", "width", "height"] as const) {
        expect(committedNode[key]).toBeCloseTo(previewNode[key], 1);
      }
      await canvas.focus();
      await page.keyboard.press("ControlOrMeta+z");
      expect(await stored()).toEqual(original);
      expect((await node.boundingBox())!.width).toBeCloseTo(originalNode.width, 1);

      // Cancellation restores DOM preview geometry and leaves the document unchanged.
      const cancelStart = (await handle.boundingBox())!;
      await page.mouse.move(
        cancelStart.x + cancelStart.width / 2,
        cancelStart.y + cancelStart.height / 2,
      );
      await page.mouse.down();
      await page.mouse.move(cancelStart.x + 50, cancelStart.y + 35, { steps: 3 });
      await page.keyboard.press("Escape");
      await page.mouse.up();
      expect(await stored()).toEqual(original);
      expect((await node.boundingBox())!.width).toBeCloseTo(originalNode.width, 1);

      // Undo and cancellation do not replace the last committed Shapes dimensions.
      const nextKind = kind === "Rectangle" ? "Ellipse" : "Rectangle";
      await toolbar.getByRole("button", { name: "Shapes", exact: true }).click();
      await toolbar.getByRole("button", { name: nextKind, exact: true }).click();
      await page.mouse.move(bounds.x + 500, bounds.y + 220);
      const preview = page.locator(`[data-edgeless-creation-preview="${nextKind.toLowerCase()}"]`);
      await expect(preview).toBeVisible();
      const nextPreview = (await preview.boundingBox())!;
      expect(nextPreview.width).toBeCloseTo(previewHost.width, 1);
      expect(nextPreview.height).toBeCloseTo(previewHost.height, 1);
      await page.mouse.click(bounds.x + 500, bounds.y + 220);
      const next = page.locator(`[data-edgeless-visual-kind="${nextKind.toLowerCase()}"]`).last();
      const nextId = (await next.getAttribute("data-edgeless-object-id"))!;
      const nextFrame = await page.evaluate((id) => {
        const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
          .__rivtoDemo.editor;
        return editor.elements.getElementNode(id)!.frame;
      }, nextId);
      expect(nextFrame.width).toBeCloseTo(committedFrame.width, 1);
      expect(nextFrame.height).toBeCloseTo(committedFrame.height, 1);
    });
  }
}
