import { expect, test } from "@playwright/test";

for (const repeat of [0, 200]) {
  for (const brush of ["Pen", "Pencil", "Marker"]) {
    test(`${brush} keeps smooth curves during drawing and after release, repeat=${repeat}`, async ({
      page,
    }) => {
      test.setTimeout(120_000);
      await page.goto(`/?repeat=${repeat}`);
      await page.locator('[data-editor-mode="edgeless"]').click();
      const toolbar = page.getByRole("toolbar", { name: "Visual objects" });
      await toolbar.getByRole("button", { name: "Drawing", exact: true }).click();
      await page
        .getByRole("dialog", { name: "drawing tools" })
        .getByRole("button", { name: brush, exact: true })
        .click();
      const canvas = page.locator(".edgeless-viewport");
      const bounds = (await canvas.boundingBox())!;
      const drawings = canvas.locator('[data-edgeless-visual-kind="drawing"]');
      const before = await drawings.count();
      await page.mouse.move(bounds.x + 450, bounds.y + 300);
      await page.mouse.down();
      await page.mouse.move(bounds.x + 490, bounds.y + 340);
      await page.mouse.move(bounds.x + 530, bounds.y + 300);
      await page.mouse.move(bounds.x + 570, bounds.y + 340);
      const preview = canvas.locator(".edgeless-drawing-capture path");
      await expect(preview).toHaveAttribute("d", /Q/);
      await expect(drawings).toHaveCount(before);
      const previewLength = await preview.evaluate((path: SVGPathElement) => path.getTotalLength());
      await page.mouse.up();
      await expect(drawings).toHaveCount(before + 1);
      const stroke = drawings.last().locator(".edgeless-drawing-stroke");
      await expect(stroke).toHaveAttribute("d", /Q/);
      expect(await stroke.evaluate((path: SVGPathElement) => path.getTotalLength())).toBeCloseTo(
        previewLength,
        1,
      );
      await expect(drawings.last().locator(".edgeless-drawing-hit")).toHaveAttribute(
        "d",
        (await stroke.getAttribute("d"))!,
      );
      await toolbar.getByRole("button", { name: "Select", exact: true }).click();
      await canvas.focus();
      await page.keyboard.press("ControlOrMeta+z");
      await expect(drawings).toHaveCount(before);
    });
  }
}
