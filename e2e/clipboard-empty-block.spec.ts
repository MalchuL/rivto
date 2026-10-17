import { expect, test } from "@playwright/test";
import type { DocumentEditorAPI } from "@chulane/rivto";

type DemoWindow = Window & { __rivtoDemo: { editor: DocumentEditorAPI } };

for (const mode of ["block", "edgeless"]) {
  for (const repeat of [1, 200]) {
    test(`paste replaces an empty caret block in ${mode}, repeat=${repeat}`, async ({ page }) => {
      await page.goto(repeat === 1 ? "/" : "/?repeat=200");
      await page.locator(`[data-editor-mode="${mode}"]`).click();
      const id = await page.evaluate(() => {
        const { editor } = (window as unknown as DemoWindow).__rivtoDemo;
        const nodes = document.querySelectorAll<HTMLElement>("[data-block-id]");
        for (const node of nodes) {
          const id = node.dataset.blockId!;
          const block = editor.blocks.getBlockNode(id);
          if (block?.type === "paragraph" && !block.childIds.length) {
            editor.blocks.updateBlock(id, { content: "" });
            return id;
          }
        }
        throw new Error("Expected a paragraph leaf");
      });
      const content = page.locator(`[data-block-id="${id}"] [data-block-content]`).first();
      const samples: { command: number; rendered: number }[] = [];
      for (let sample = 0; sample < 3; sample++) {
        await content.click();
        samples.push(
          await content.evaluate(async (host) => {
            const data = new DataTransfer();
            data.setData("text/html", "<p>Replacement clipboard block</p>");
            data.setData("text/plain", "Replacement clipboard block");
            const event = new ClipboardEvent("paste", { bubbles: true, cancelable: true });
            Object.defineProperty(event, "clipboardData", { value: data });
            const start = performance.now();
            host.dispatchEvent(event);
            const command = performance.now() - start;
            await new Promise<void>((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
            );
            return { command, rendered: performance.now() - start };
          }),
        );
        await expect(
          page.getByText("Replacement clipboard block", { exact: true }).first(),
        ).toBeVisible();
        const retained = await page.evaluate(
          (id) => (window as unknown as DemoWindow).__rivtoDemo.editor.blocks.hasBlock(id),
          id,
        );
        console.log(JSON.stringify({ mode, repeat, sample, ...samples.at(-1), retained }));
        expect(retained).toBe(false);
        await page.keyboard.press("Control+z");
        await expect(content).toBeVisible();
        await expect(content).toHaveText("");
      }
    });
  }
}
