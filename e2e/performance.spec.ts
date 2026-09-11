/**
 * Browser regression coverage for focused block rendering on large documents.
 *
 * The fixture intentionally mounts 500 checkbox-decorated Markdown blocks so
 * the timing includes the real DOM and renderer load that exposed the lag.
 *
 * @module
 */
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

/** Mounts the large checkbox-decorated Markdown fixture in one undo item. */
async function seedLargeDocument(page: Page): Promise<void> {
  await page.goto("/");
  await page.evaluate(() => {
    const runtime = (window as unknown as {
      __rivtoDemo: { editor: import("@chulane/rivto-react").ReactEditor };
    }).__rivtoDemo.editor.editor;
    runtime.batchUpdates(() => {
      let afterId = runtime.blocks.getRootIds().at(-1);
      for (let index = 0; index < 500; index += 1) {
        afterId = runtime.blocks.insertBlock({
          type: "paragraph",
          content: `Performance block **${index}**`,
          listProps: { type: "checkbox" },
        }, afterId);
      }
    });
  });
  await expect(page.getByText("Performance block 499", { exact: true })).toBeVisible();
}

test("toggles a checkbox responsively with 500 additional Markdown blocks", async ({
  browserName,
  page,
}) => {
  test.skip(browserName !== "chromium", "The timing budget is calibrated for Chromium; behavior is covered cross-browser by lists.spec.ts");
  await seedLargeDocument(page);

  const checkbox = page.getByRole("checkbox", { name: /Mark block as .*Try the interactive checkbox/ });
  await checkbox.click();
  await expect(checkbox).toBeChecked();
  await page.locator('[data-editor-action="undo"]').click();
  await expect(checkbox).not.toBeChecked();
  await checkbox.click();
  await expect(checkbox).toBeChecked();

  const samples: number[] = [];
  for (let index = 0; index < 7; index += 1) {
    samples.push(await checkbox.evaluate(async (element) => {
      const start = performance.now();
      (element as HTMLInputElement).click();
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      return performance.now() - start;
    }));
  }
  samples.sort((left, right) => left - right);
  expect(samples[Math.floor(samples.length / 2)]).toBeLessThan(100);
});

for (const mode of ["block", "edgeless"] as const) {
  const surface = mode === "block" ? "page" : "edgeless";
  test(`keeps ${surface} block drag feedback responsive with 500 mounted blocks`, async ({
    browserName,
    page,
  }) => {
    test.skip(browserName !== "chromium", "The timing budget is calibrated for Chromium");
    await seedLargeDocument(page);
    if (mode === "edgeless") await page.locator('[data-editor-mode="edgeless"]').click();

    const source = page.getByRole("button", { name: "Move block: Performance block **0**" });
    const blockSelector = mode === "block"
      ? ".page-surface > [data-block-id]"
      : "[data-edgeless-root] [data-block-id]";
    const targets = page.locator(blockSelector).filter({
      has: page.getByText(/^Performance block [1-7]$/),
    });
    await source.scrollIntoViewIfNeeded();
    const sourceBox = await source.boundingBox();
    if (!sourceBox) throw new Error("Expected drag source geometry");
    await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
    await page.mouse.down();
    const activationStart = await page.evaluate(() => performance.now());
    await page.mouse.move(sourceBox.x + sourceBox.width / 2 + 8, sourceBox.y + sourceBox.height / 2);
    const activationTime = await page.evaluate(async (started) => {
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return performance.now() - started;
    }, activationStart);
    await expect(page.locator(".page-drag-overlay")).toBeVisible();
    expect(activationTime).toBeLessThan(100);

    const samples: number[] = [];
    for (let index = 0; index < 7; index += 1) {
      const targetBox = await targets.nth(index).locator(":scope > .page-block-row").boundingBox();
      if (!targetBox) throw new Error("Expected drag target geometry");
      const start = await page.evaluate(() => performance.now());
      await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2);
      samples.push(await page.evaluate(async (started) => {
        await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        return performance.now() - started;
      }, start));
    }
    const commitStart = await page.evaluate(() => performance.now());
    await page.mouse.up();
    const commitTime = await page.evaluate(async (started) => {
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return performance.now() - started;
    }, commitStart);

    samples.sort((left, right) => left - right);
    expect(samples[Math.floor(samples.length / 2)]).toBeLessThan(100);
    expect(commitTime).toBeLessThan(100);
  });
}
