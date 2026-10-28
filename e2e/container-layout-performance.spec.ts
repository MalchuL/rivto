import { expect, test } from "@playwright/test";
import type { DocumentEditorAPI } from "@chulane/rivto";

for (const repeat of [0, 200]) {
  test(`container editing timing with repeat=${repeat} @performance`, async ({ page }) => {
    await page.goto(`/?repeat=${repeat}`);
    const text = page.locator('[data-block-type="bento"]').first().getByRole("textbox").first();
    await text.fill("warmup");
    const blockId = await text.evaluate((element) =>
      element.closest("[data-block-id]")?.getAttribute("data-block-id"),
    );
    const samples = [];
    for (let index = 0; index < 5; index += 1) {
      const command = await page.evaluate(async (blockId) => {
        const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
          .__rivtoDemo.editor;
        const content = editor.blocks.getBlockNode(blockId!)!.content;
        const started = performance.now();
        editor.blocks.updateBlock(blockId!, { content: `${content}x` });
        const sync = performance.now() - started;
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        );
        return { sync, rendered: performance.now() - started };
      }, blockId);
      await expect(text).toHaveText(/x$/);
      await text.click();
      await page.keyboard.press("ControlOrMeta+A");
      await text.evaluate((element) => {
        element.addEventListener(
          "input",
          () => {
            const started = performance.now();
            requestAnimationFrame(() =>
              requestAnimationFrame(() => {
                element.setAttribute("data-input-rendered", String(performance.now() - started));
              }),
            );
          },
          { once: true },
        );
        element.removeAttribute("data-input-rendered");
      });
      await page.keyboard.type("y");
      await expect(text).toHaveText("y");
      await expect(text).toHaveAttribute("data-input-rendered", /\d/);
      await expect(text).toBeFocused();
      samples.push({
        ...command,
        inputRendered: Number(await text.getAttribute("data-input-rendered")),
      });
    }
    console.log(JSON.stringify({ repeat, samples }));
  });
}
