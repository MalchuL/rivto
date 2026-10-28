import { expect, test } from "@playwright/test";

for (const repeat of [0, 200]) {
  test(`middle-button panning preserves blocks without rereading root ranges, repeat=${repeat}`, async ({
    page,
  }) => {
    await page.goto(`/?test_features=1&repeat=${repeat}`);
    const journal = page.locator('[data-journal-document="today"]');
    await journal.locator('[data-editor-mode="edgeless"]').click();
    const canvas = journal.locator(".edgeless-viewport");
    const card = canvas.locator("[data-edgeless-root]").first();
    await expect(card).toBeVisible();
    await canvas.hover({ position: { x: 150, y: 150 } });
    const before = await canvas
      .locator("[data-edgeless-root]")
      .evaluateAll((cards) => cards.map((card) => card.getAttribute("data-edgeless-root")));
    await page.evaluate(() => {
      const state = window as typeof window & {
        __rivtoDemo: {
          editor: {
            blocks: {
              /**
               * Reads the current canonical document root order.
               *
               * @returns Stable IDs of document roots in order.
               */
              getRootIds(): readonly string[];
            };
          };
        };
        panRootReads: number;
      };
      state.panRootReads = 0;
      const blocks = state.__rivtoDemo.editor.blocks;
      const getRootIds = blocks.getRootIds.bind(blocks);
      blocks.getRootIds = () => {
        state.panRootReads++;
        return getRootIds();
      };
    });

    const bounds = (await canvas.boundingBox())!;
    await page.mouse.move(bounds.x + 150, bounds.y + 150);
    await page.mouse.down({ button: "middle" });
    await expect(canvas).toHaveAttribute("data-panning", "true");
    await page.mouse.move(bounds.x + 154, bounds.y + 153, { steps: 4 });
    await page.mouse.up({ button: "middle" });
    await expect(canvas).toHaveAttribute("data-edgeless-pan-x", "4");
    await expect(canvas).toHaveAttribute("data-edgeless-pan-y", "3");
    await expect(canvas).not.toHaveAttribute("data-panning", "true");
    await expect(canvas).toHaveAttribute("data-edgeless-zoom", "1");
    expect(
      await canvas
        .locator("[data-edgeless-root]")
        .evaluateAll((cards) => cards.map((card) => card.getAttribute("data-edgeless-root"))),
    ).toEqual(before);
    expect(
      await page.evaluate(() => (window as typeof window & { panRootReads: number }).panRootReads),
    ).toBe(0);
  });
}

for (const repeat of [0, 200]) {
  test(`first pan movement reaches the next paint without an extra frame, repeat=${repeat}`, async ({
    page,
  }) => {
    await page.goto(`/?test_features=1&repeat=${repeat}`);
    const journal = page.locator('[data-journal-document="today"]');
    await journal.locator('[data-editor-mode="edgeless"]').click();
    const canvas = journal.locator(".edgeless-viewport");
    const bounds = (await canvas.boundingBox())!;
    await page.mouse.move(bounds.x + 150, bounds.y + 150);
    await page.mouse.down({ button: "middle" });
    await canvas.evaluate((root) => {
      const state = window as typeof window & { firstPanPaint: string | null };
      state.firstPanPaint = null;
      window.addEventListener(
        "pointermove",
        () => {
          requestAnimationFrame(() => {
            state.firstPanPaint = root.getAttribute("data-edgeless-pan-x");
          });
        },
        { capture: true, once: true },
      );
    });
    await page.mouse.move(bounds.x + 154, bounds.y + 153);
    await expect
      .poll(() =>
        page.evaluate(
          () => (window as typeof window & { firstPanPaint: string | null }).firstPanPaint,
        ),
      )
      .toBe("4");
    await page.mouse.up({ button: "middle" });
    await expect(canvas).toHaveAttribute("data-edgeless-pan-y", "3");
  });
}
