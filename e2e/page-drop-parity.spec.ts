import { expect, test, type Page } from "@playwright/test";
import type { DocumentEditorAPI, EditorBlockInput } from "@chulane/rivto";

const kinds = ["paragraph", "embedding", "bento", "columns", "kanban", "table"] as const;
type Kind = (typeof kinds)[number];

/** Owns a mixed-block pointer fixture using real host commands and browser input. */
class DropParityFixture {
  /**
   * Borrows the browser page without owning its lifecycle.
   *
   * @param page - Production demo page for this test.
   */
  constructor(readonly page: Page) {}

  /**
   * Builds two adjacent roots after a movable ordinary source.
   *
   * @param upper - First stationary block kind.
   * @param lower - Second stationary block kind.
   * @returns The mounted fixture has one cleared history and deterministic identities.
   */
  async load(upper: Kind, lower: Kind): Promise<void> {
    await this.page.setViewportSize({ width: 1280, height: 1500 });
    await this.page.goto("/");
    await this.page.locator('[data-journal-document="today"] .page-surface').first().waitFor();
    await this.page.evaluate(
      ({ upper, lower }) => {
        const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
          .__rivtoDemo.editor;
        const block = (id: string, type: Kind): EditorBlockInput => {
          const child = { id: `${id}-child`, type: "paragraph", content: "Child" };
          if (type === "bento") {
            return { id, type, children: [child] };
          }
          if (type === "columns") {
            return { id, type, children: [{ type: "columns-column", children: [child] }] };
          }
          if (type === "kanban") {
            return {
              id,
              type,
              children: [{ type: "kanban-column", content: "Lane", children: [child] }],
            };
          }
          if (type === "table") {
            return {
              id,
              type,
              children: [
                { type: "table-row", children: [{ type: "table-cell", children: [child] }] },
              ],
            };
          }
          return { id, type, content: type === "paragraph" ? id : "" };
        };
        editor.load({ ...editor.dump(), blocks: [], elements: [], rootElementIds: [] });
        editor.blocks.insertBlock({ id: "moving", type: "paragraph", content: "Moving" });
        editor.blocks.insertBlock(block("upper", upper));
        editor.blocks.insertBlock(block("lower", lower));
        editor.history.clear();
      },
      { upper, lower },
    );
    await this.page.locator('[data-block-id="lower"]').waitFor();
  }

  /**
   * Activates the source handle with actual pointer input.
   *
   * @returns The pointer is pressed on the source's universal handle.
   */
  async start(): Promise<void> {
    const source = this.page.locator('[data-block-id="moving"]');
    await source.locator(":scope > .rivto-block-row").hover();
    const rect = (await source.locator(".block-handle").boundingBox())!;
    await this.page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
    await this.page.mouse.down();
  }
}

for (const upper of kinds) {
  for (const lower of kinds) {
    test(`one insertion gap between ${upper} and ${lower}`, async ({ page }) => {
      const fixture = new DropParityFixture(page);
      await fixture.load(upper, lower);
      const a = (await page.locator('[data-block-id="upper"]').boundingBox())!;
      const b = (await page.locator('[data-block-id="lower"]').boundingBox())!;
      expect(b.y - (a.y + a.height)).toBeCloseTo(16, 0);
      const center = (a.y + a.height + b.y) / 2;
      await fixture.start();
      for (const y of [a.y + a.height - 1, center, b.y + 1]) {
        await page.mouse.move(a.x + 2, y, { steps: 6 });
        const line = page.locator(".rivto-block-drop-line");
        await expect(line).toBeVisible();
        const rect = (await line.boundingBox())!;
        expect(rect.y + rect.height / 2).toBeCloseTo(center, 0);
      }
      await page.mouse.up();
      const roots = await page.evaluate(() =>
        (
          window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
        ).__rivtoDemo.editor.blocks.getRootIds(),
      );
      expect(roots).toEqual(["upper", "moving", "lower"]);
      await page.keyboard.press("Control+z");
      await expect
        .poll(() =>
          page.evaluate(() =>
            (
              window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
            ).__rivtoDemo.editor.blocks.getRootIds(),
          ),
        )
        .toEqual(["moving", "upper", "lower"]);
    });
  }
}

test("container headers do not reserve blank space and ordinary handles cover the full line", async ({
  page,
}) => {
  const fixture = new DropParityFixture(page);
  for (const kind of kinds.filter((kind) => kind !== "paragraph")) {
    await fixture.load(kind, "paragraph");
    const shell = page.locator('[data-block-id="upper"]');
    const body = shell
      .locator(':scope > .rivto-block-children, :scope > [data-slot-position="body"]')
      .first();
    const rect = (await shell.boundingBox())!;
    expect((await body.boundingBox())!.y - rect.y).toBeLessThanOrEqual(2);
  }
  const row = page.locator('[data-block-id="lower"] > .rivto-block-row');
  const rect = (await row.boundingBox())!;
  await page.mouse.move(rect.x - 40, rect.y + rect.height / 2);
  await expect(row.locator(".block-handle")).toHaveCSS("opacity", "1");
});

test("nonempty Bento accepts a block in unused body space", async ({ page }) => {
  const fixture = new DropParityFixture(page);
  await fixture.load("bento", "paragraph");
  const body = page.locator('[data-block-id="upper"] > .rivto-block-children');
  const rect = (await body.boundingBox())!;
  await fixture.start();
  await page.mouse.move(rect.x + rect.width - 24, rect.y + rect.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator('[data-block-id="upper"] [data-block-id="moving"]')).toHaveCount(1);
});

for (const [wrapped, rtl] of [
  [false, false],
  [true, false],
  [false, true],
] as const) {
  test(`Bento sibling boundaries share one ${wrapped ? "wrapped-row" : "inline"} indicator, rtl=${rtl}`, async ({
    page,
  }) => {
    const fixture = new DropParityFixture(page);
    await fixture.load("bento", "paragraph");
    await page.evaluate(() => {
      const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
        .__rivtoDemo.editor;
      editor.blocks.insertBlock(
        { id: "second", type: "paragraph", content: "Second tile" },
        editor.blocks.getInsertionDestinationAfter("upper-child"),
      );
      editor.history.clear();
    });
    await page.locator('[data-block-id="upper"] > .rivto-block-children').evaluate(
      (element, { wrapped, rtl }) => {
        element.style.width = wrapped ? "340px" : "700px";
        element.style.direction = rtl ? "rtl" : "ltr";
      },
      { wrapped, rtl },
    );
    const first = page
      .locator(".rivto-bento-tile")
      .filter({ has: page.locator('[data-block-id="upper-child"]') });
    const second = page
      .locator(".rivto-bento-tile")
      .filter({ has: page.locator('[data-block-id="second"]') });
    const a = (await first.boundingBox())!;
    const b = (await second.boundingBox())!;
    let center = (a.x + a.width + b.x) / 2;
    if (wrapped) {
      center = (a.y + a.height + b.y) / 2;
    } else if (rtl) {
      center = (b.x + b.width + a.x) / 2;
    }
    await fixture.start();
    const edge = wrapped ? "block" : "inline";
    const targets = [
      first.locator(`:scope > [data-drop-placement="after"][data-drop-edge="${edge}"]`),
      second.locator(`:scope > [data-drop-placement="before"][data-drop-edge="${edge}"]`),
    ];
    for (const target of targets) {
      const rect = (await target.boundingBox())!;
      await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2, { steps: 6 });
      const line = page.locator(".rivto-block-drop-line");
      await expect(line).toBeVisible();
      const indicator = (await line.boundingBox())!;
      expect(
        wrapped ? indicator.y + indicator.height / 2 : indicator.x + indicator.width / 2,
      ).toBeCloseTo(center, 0);
      expect(wrapped ? indicator.height : indicator.width).toBe(4);
    }
    await page.mouse.move(
      wrapped ? b.x + b.width / 2 : center,
      wrapped ? center : b.y + b.height / 2,
      { steps: 6 },
    );
    const line = (await page.locator(".rivto-block-drop-line").boundingBox())!;
    expect(wrapped ? line.y + line.height / 2 : line.x + line.width / 2).toBeCloseTo(center, 0);
    await page.mouse.up();
    await expect
      .poll(() =>
        page.evaluate(() =>
          (
            window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
          ).__rivtoDemo.editor.blocks.getChildIds("upper"),
        ),
      )
      .toEqual(["upper-child", "moving", "second"]);
    await page.keyboard.press("Control+z");
    await expect
      .poll(() =>
        page.evaluate(() =>
          (
            window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
          ).__rivtoDemo.editor.blocks.getRootIds(),
        ),
      )
      .toEqual(["moving", "upper", "lower"]);
  });
}
