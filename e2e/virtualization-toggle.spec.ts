import { expect, test } from "@playwright/test";

for (const repeat of [0, 200]) {
  test(`keeps the visible block in place across virtualization toggles, repeat=${repeat}`, async ({
    page,
  }) => {
    await page.goto(`/?repeat=${repeat}`);
    const surface = page.locator('[data-journal-document="today"] .page-surface').first();
    await surface.locator("[data-block-id]").first().waitFor();
    const id = await surface.evaluate((root) => {
      const blocks = Array.from(root.querySelectorAll<HTMLElement>("[data-virtual-block-id]"));
      const target = blocks[Math.min(12, blocks.length - 1)]!;
      target.scrollIntoView({ block: "start" });
      window.scrollBy(0, -180);
      return target.dataset.virtualBlockId!;
    });
    const target = surface.locator(`[data-block-id="${id}"]`).first();
    const before = (await target.boundingBox())!.y;
    const toggle = page.getByRole("checkbox", { name: "Virtualize page", exact: true });
    for (const enabled of [true, false, true, false]) {
      await toggle.evaluate((control) => control.focus({ preventScroll: true }));
      await page.keyboard.press("Space");
      await expect(toggle).toBeChecked({ checked: enabled });
      await expect
        .poll(async () => {
          const rect = await target.boundingBox();
          return rect ? Math.abs(rect.y - before) : Infinity;
        })
        .toBeLessThan(2);
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );
      expect(Math.abs((await target.boundingBox())!.y - before)).toBeLessThan(2);
      await expect(surface.locator(":scope > .rivto-virtual-tree")).toHaveAttribute(
        "data-virtualized",
        String(enabled),
      );
    }
  });
}

for (const repeat of [0, 200]) {
  test(`retains visible embedding DOM while switching virtualization, repeat=${repeat}`, async ({
    page,
  }) => {
    await page.goto(`/?repeat=${repeat}`);
    const embedding = page
      .locator('[data-journal-document="today"] .rivto-embedding')
      .first()
      .locator("xpath=ancestor::*[@data-block-id][1]");
    await expect(embedding.locator("[data-rivto-block-editor]").first()).toBeVisible({
      timeout: 20000,
    });
    await embedding.scrollIntoViewIfNeeded();
    const original = await embedding.locator("[data-rivto-block-editor]").first().elementHandle();
    const toggle = page.getByRole("checkbox", { name: "Virtualize page", exact: true });
    for (const enabled of [true, false, true, false]) {
      await toggle.evaluate((control) => control.focus({ preventScroll: true }));
      await page.keyboard.press("Space");
      await expect(toggle).toBeChecked({ checked: enabled });
      expect(await original!.evaluate((element) => element.isConnected)).toBe(true);
      await expect(embedding.getByText("Loading embedded block…", { exact: true })).toHaveCount(0);
    }
  });
}
