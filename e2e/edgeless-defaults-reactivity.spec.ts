import { expect, test } from "@playwright/test";

for (const repeat of [0, 200]) {
  test(`property previews refresh open tool defaults without another click, repeat=${repeat}`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.goto(`/?test_features=1&repeat=${repeat}`);
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
    const properties = page.getByRole("region", { name: "Visual properties" });
    await expect(properties).toBeVisible();
    const shapes = page.getByRole("button", { name: "Shapes", exact: true });
    await shapes.click();
    const defaultFill = page.getByLabel("Default fill", { exact: true });
    const originalFill = await defaultFill.inputValue();
    await properties.getByLabel("Fill color").fill("#654321");
    await expect(defaultFill).toHaveValue("#654321");
    await properties.getByLabel("Fill color").press("Escape");
    // The open tool popover consumes the first Escape; the second cancels the property edit.
    await properties.getByLabel("Fill color").press("Escape");
    await shapes.click();
    await expect(defaultFill).toHaveValue(originalFill);
    await properties.getByLabel("Fill color").fill("#123456");
    await expect(page.getByLabel("Default fill", { exact: true })).toHaveValue("#123456");
    const width = properties.getByRole("slider", { name: "Stroke width", exact: true });
    await width.focus();
    await width.press("ArrowRight");
    await expect(
      page.getByRole("slider", { name: "Default stroke width", exact: true }),
    ).toHaveAttribute("aria-valuenow", "3");
    expect(
      await page.evaluate(
        (id) => window.__rivtoDemo.editor.elements.getElementNode(id)?.props.fill,
        id,
      ),
    ).toBe("#0000ff");
    await properties.getByRole("button", { name: "Close properties", exact: true }).click();
    await expect(defaultFill).toHaveValue("#123456");
    expect(
      await page.evaluate((id) => window.__rivtoDemo.editor.elements.getElementNode(id)?.props, id),
    ).toMatchObject({ fill: "#123456", strokeWidth: 3 });
  });
}
