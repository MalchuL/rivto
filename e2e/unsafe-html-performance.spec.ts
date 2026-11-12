import { expect, test, type Frame, type Page } from "@playwright/test";
import type { DocumentEditorAPI } from "@chulane/rivto";

interface PerformanceWindow extends Window {
  __rivtoDemo: { editor: DocumentEditorAPI };
  unsafeUpdateDurations: number[];
}

/** Measurements from one real iframe click. */
interface UnsafeMeasurement {
  /** Playwright click until the updated DOM and two animation frames, in milliseconds. */
  readonly clickToPaintMs: number;
  /** Synchronous document update duration, in milliseconds. */
  readonly syncUpdateMs: number;
}

/**
 * Enables the sample and instruments the target's document update.
 *
 * @param page - Production demo page.
 * @returns The current sandbox and target block ID.
 */
async function prepareMeasurement(page: Page): Promise<{ frame: Frame; targetId: string }> {
  const host = page.locator(
    '[data-html-surface="unsafe-block"][data-html-label="Unsafe panel example"]',
  );
  await host.scrollIntoViewIfNeeded();
  await host.getByRole("button", { name: "Edit Unsafe HTML" }).click();
  await host
    .getByRole("checkbox", { name: "Allow this HTML to read and modify editor blocks" })
    .check();
  await host.getByRole("button", { name: "Done", exact: true }).click();
  await expect.poll(() => page.frame({ name: "Unsafe panel example" }) !== null).toBe(true);
  const frame = page.frame({ name: "Unsafe panel example" });
  if (!frame) {
    throw new Error("Missing unsafe frame");
  }
  const targetId = await page.evaluate(() => {
    const hostWindow = window as unknown as PerformanceWindow;
    const manager = hostWindow.__rivtoDemo.editor.blocks;
    const target = manager.getBlocks().find((block) => block.content === "Panel example target");
    if (!target) {
      throw new Error("Missing target block");
    }
    const update = manager.updateBlock.bind(manager);
    hostWindow.unsafeUpdateDurations = [];
    manager.updateBlock = (id, patch) => {
      const start = performance.now();
      try {
        return update(id, patch);
      } finally {
        hostWindow.unsafeUpdateDurations.push(performance.now() - start);
      }
    };
    return target.id;
  });
  return { frame, targetId };
}

/**
 * Measures one click and restores the target with undo.
 *
 * @param page - Production demo page.
 * @param frame - Sandbox containing the interactive button.
 * @param targetId - ID of the preceding block updated by the widget.
 * @returns The synchronous update and click-to-paint durations.
 */
async function measureClick(
  page: Page,
  frame: Frame,
  targetId: string,
): Promise<UnsafeMeasurement> {
  const target = page.locator(`[data-block-id="${targetId}"]`);
  await page.evaluate(() => {
    (window as unknown as PerformanceWindow).unsafeUpdateDurations = [];
  });
  const start = performance.now();
  await frame.getByRole("button", { name: "Append Unsafe!!!" }).click();
  await expect(target).toContainText("Panel example target Unsafe!!!");
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  const clickToPaintMs = performance.now() - start;
  const updates = await page.evaluate(
    () => (window as unknown as PerformanceWindow).unsafeUpdateDurations,
  );
  expect(updates).toHaveLength(1);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(target).not.toContainText("Unsafe!!!");
  await expect
    .poll(() =>
      page.evaluate(
        (id) =>
          (window as unknown as PerformanceWindow).__rivtoDemo.editor.blocks.getBlockNode(id)
            ?.content,
        targetId,
      ),
    )
    .toBe("Panel example target");
  return { clickToPaintMs, syncUpdateMs: updates[0]! };
}

for (const repeat of [0, 200]) {
  test(`unsafe HTML updates the previous block with repeat=${repeat}`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto(`/?repeat=${repeat}`);
    const { frame, targetId } = await prepareMeasurement(page);
    await measureClick(page, frame, targetId);
    const samples: UnsafeMeasurement[] = [];
    for (let sample = 0; sample < 5; sample += 1) {
      samples.push(await measureClick(page, frame, targetId));
    }
    console.log(JSON.stringify({ interaction: "unsafe-panel-append", repeat, samples }));
  });
}
