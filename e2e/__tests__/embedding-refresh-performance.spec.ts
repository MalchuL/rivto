import { expect, test } from "@playwright/test";
import type { EditorStorage } from "@chulane/rivto-react";

for (const repeat of [0, 200]) {
  test(`refreshes a loaded embedding in place, repeat=${repeat}`, async ({ page, browserName }) => {
    test.setTimeout(120_000);
    await page.goto(`/?embeddings=1&repeat=${repeat}&room=refresh-${crypto.randomUUID()}`);
    const embedding = page.locator('[data-document-pane="references"] [data-block-id$=":embed-1"]');
    const content = embedding.locator("[data-block-content]").first();
    await expect(content).toHaveText("Source text");
    await embedding.hover();
    await embedding.getByRole("button", { name: "Edit embedding" }).click();
    const refresh = page.getByRole("button", { name: "Refresh embedding" });
    const lookupCount = await page.evaluateHandle(() => {
      const { editor } = (window as unknown as { __rivtoDocuments: { editor: EditorStorage } })
        .__rivtoDocuments;
      const references = editor.blockReferences;
      const resolve = references.resolveBlock.bind(references);
      const counter = { value: 0 };
      references.resolveBlock = (...args) => {
        counter.value++;
        return resolve(...args);
      };
      return counter;
    });
    const samples = [];
    for (let index = 0; index < 4; index++) {
      const before = await lookupCount.evaluate((counter) => counter.value);
      const timing = await refresh.evaluate(async (button: HTMLButtonElement) => {
        const start = performance.now();
        button.click();
        const sync = performance.now() - start;
        await new Promise<void>((done) =>
          requestAnimationFrame(() => requestAnimationFrame(() => done())),
        );
        return { sync, rendered: performance.now() - start };
      });
      await expect
        .poll(() => lookupCount.evaluate((counter) => counter.value))
        .toBeGreaterThan(before);
      await expect(content).toHaveText("Source text");
      if (index > 0) {
        samples.push(timing);
      }
    }
    console.log(JSON.stringify({ interaction: "embedding-refresh", browserName, repeat, samples }));
  });
}
