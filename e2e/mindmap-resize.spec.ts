import { expect, test } from "@playwright/test";
import type { DocumentEditorAPI } from "@chulane/rivto";

for (const repeat of [0, 200]) {
  test(`mindmap scales during resize without document writes, repeat=${repeat}`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.goto(`/?repeat=${repeat}`);
    await page.locator('[data-editor-mode="edgeless"]').click();
    const toolbar = page.getByRole("toolbar", { name: "Visual objects" });
    await toolbar.getByRole("button", { name: "Diagrams", exact: true }).click();
    await toolbar.getByRole("button", { name: "Mindmap", exact: true }).click();
    const canvas = page.locator(".edgeless-viewport");
    const bounds = (await canvas.boundingBox())!;
    await page.mouse.click(bounds.x + 200, bounds.y + 220);
    await toolbar.getByRole("button", { name: "Select", exact: true }).click();
    await page.getByRole("button", { name: "Add branch to Mindmap" }).click();
    const host = page.locator('[data-edgeless-visual-kind="mindmap"]');
    const node = host.locator("[data-mindmap-node]").first();
    const id = (await host.getAttribute("data-edgeless-object-id"))!;
    const stored = () =>
      page.evaluate((id) => {
        const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
          .__rivtoDemo.editor;
        return editor.elements.getElementNode(id);
      }, id);
    const original = await stored();
    const originalHost = (await host.boundingBox())!;
    const originalNode = (await node.boundingBox())!;
    const handle = page.locator('[data-edgeless-controls-for] [data-edgeless-resize-handle="se"]');
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
    console.log(JSON.stringify({ interaction: "mindmap-resize-preview", repeat, samples }));
    const previewHost = (await host.boundingBox())!;
    const previewNode = (await node.boundingBox())!;
    expect(previewHost.width).toBeGreaterThan(originalHost.width + 50);
    expect(previewNode.width / originalNode.width).toBeCloseTo(
      previewHost.width / originalHost.width,
      2,
    );
    expect(previewNode.height / originalNode.height).toBeCloseTo(
      previewHost.height / originalHost.height,
      2,
    );
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
    expect((await node.boundingBox())!.width).toBeCloseTo(previewNode.width, 1);
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
  });
}
