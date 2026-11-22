import { measureEventDelivery } from "./measure-event-delivery";
import { expect, test, type Page } from "@playwright/test";

for (const repeat of [0, 200]) {
  test(`cancels a visual property preview, repeat=${repeat}`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto(`/?repeat=${repeat}`);
    await page.locator('[data-editor-mode="edgeless"]').click();
    const id = await page.evaluate(
      () =>
        window.__rivtoDemo.editor.elements.insertElement({
          type: "rectangle",
          frame: { x: 300, y: 200, width: 160, height: 120 },
          props: { fill: "#0000ff", strokeWidth: 2 },
          zIndex: 1000,
        }).id,
    );
    await page.locator(`[data-edgeless-object-id="${id}"]`).click();
    const input = page.getByRole("region", { name: "Visual properties" }).getByLabel("Fill color");
    const original = await input.inputValue();
    const samples = [];
    for (let index = 0; index < 3; index++) {
      await input.fill("#654321");
      samples.push(await measureEscape(page));
      await expect(input).toHaveValue(original);
      expect(
        await page.evaluate(
          (elementId) => window.__rivtoDemo.editor.elements.getElementNode(elementId)?.props.fill,
          id,
        ),
      ).toBe("#0000ff");
    }
    console.log(JSON.stringify({ interaction: "visual-properties-escape", repeat, samples }));
  });
}

/**
 * Measures one Escape delivery and two following browser frames.
 *
 * @param page - Warm demo with the property editor focused and previewing a change.
 * @returns Synchronous delivery and two-frame durations in milliseconds.
 */
async function measureEscape(page: Page) {
  return measureEventDelivery(page, "keydown", () => page.keyboard.press("Escape"));
}
