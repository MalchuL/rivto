import { expect, test } from "@playwright/test";
import type { DocumentEditorAPI } from "@chulane/rivto";

for (const repeat of [0, 200]) {
  test(`keyboard resize retains its target, repeat=${repeat}`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto(`/?repeat=${repeat}`);
    const today = page.locator('[data-journal-document="today"]');
    await today.locator("[data-block-content]").first().waitFor();
    await today.getByRole("button", { name: "Edgeless", exact: true }).click();
    await page.evaluate(() => {
      const { editor } = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
        .__rivtoDemo;
      editor.elements.insertElement({
        id: "keyboard-timing-shape",
        type: "rectangle",
        frame: { x: 100, y: 100, width: 180, height: 120 },
        zIndex: 1000,
        props: { text: "Keyboard timing" },
      });
      editor.commands.execute("edgeless.selection.set", ["keyboard-timing-shape"]);
    });
    const controls = today.locator('[data-edgeless-controls-for="keyboard-timing-shape"]');
    const handle = controls.locator('[data-edgeless-resize-handle="e"]');
    await expect(handle).toBeVisible();
    await page.keyboard.down("Alt");
    await handle.focus();
    const samples: { sync: number; rendered: number }[] = [];
    for (let sample = 0; sample < 4; sample++) {
      const before = await page.evaluate(
        () =>
          (
            window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
          ).__rivtoDemo.editor.elements.getElementNode("keyboard-timing-shape")!.frame.width,
      );
      const timing = await handle.evaluate(async (element) => {
        const event = new KeyboardEvent("keydown", {
          key: "ArrowRight",
          altKey: true,
          bubbles: true,
          cancelable: true,
        });
        const start = performance.now();
        element.dispatchEvent(event);
        const sync = performance.now() - start;
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        );
        return { sync, rendered: performance.now() - start };
      });
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              (
                window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
              ).__rivtoDemo.editor.elements.getElementNode("keyboard-timing-shape")!.frame.width,
          ),
        )
        .toBeGreaterThan(before);
      samples.push(timing);
    }
    await page.keyboard.up("Alt");
    console.log(
      JSON.stringify({ interaction: "moveable-keyboard", repeat, samples: samples.slice(1) }),
    );
  });
}
