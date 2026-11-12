import { expect, test, type Page } from "@playwright/test";
import type { DocumentEditorAPI } from "@chulane/rivto";

/** One frame of the selected blocks while their movement is visible. */
interface MovementFrame {
  readonly gap: number;
  readonly width: number;
  readonly height: number;
  readonly moving: boolean;
}

/**
 * Captures selected block geometry while a real keyboard command runs.
 *
 * @param page - Mounted demo page with the two selected fixture blocks.
 * @param key - Indent or outdent shortcut.
 * @param surfaceSelector - DOM boundary containing the fixture blocks.
 * @returns Browser-frame samples spanning the movement and its cleanup.
 */
async function sampleMovement(
  page: Page,
  key: "Tab" | "Shift+Tab",
  surfaceSelector = '[data-journal-document="today"] > .page-surface',
): Promise<MovementFrame[]> {
  await page.evaluate((selector) => {
    const host = window as unknown as { movementSamples: Promise<MovementFrame[]> };
    host.movementSamples = new Promise((resolve) => {
      document.addEventListener(
        "keydown",
        () => {
          const started = performance.now();
          const frames: MovementFrame[] = [];
          const sample = () => {
            const surface = document.querySelector(selector)!;
            const first = surface.querySelector<HTMLElement>('[data-block-id="resize-first"]')!;
            const last = surface.querySelector<HTMLElement>('[data-block-id="resize-last"]')!;
            const a = first.getBoundingClientRect();
            const b = last.getBoundingClientRect();
            frames.push({
              gap: b.top - a.top,
              width: a.width,
              height: a.height,
              moving: first
                .getAnimations()
                .some((animation) =>
                  (animation.effect as KeyframeEffect)
                    .getKeyframes()
                    .some((frame) => "transform" in frame),
                ),
            });
            if (performance.now() - started < 450) {
              requestAnimationFrame(sample);
            } else {
              resolve(frames);
            }
          };
          requestAnimationFrame(sample);
        },
        { capture: true, once: true },
      );
    });
  }, surfaceSelector);
  await page.keyboard.press(key);
  return page.evaluate(
    () => (window as unknown as { movementSamples: Promise<MovementFrame[]> }).movementSamples,
  );
}

/**
 * Checks that grouped movement retains its measured size and internal spacing.
 *
 * @param frames - Browser-frame samples from the keyboard interaction.
 * @param before - Bounds of the first shell before it moved.
 * @returns The movement samples have stable dimensions and spacing.
 */
function expectStableMovement(
  frames: MovementFrame[],
  before: { width: number; height: number },
): void {
  const moving = frames.filter((frame) => frame.moving);
  expect(moving.length).toBeGreaterThan(2);
  for (const field of ["gap", "width", "height"] as const) {
    const values = moving.map((frame) => frame[field]);
    expect(Math.max(...values) - Math.min(...values), field).toBeLessThan(2);
  }
  expect(moving[0]!.width).toBeCloseTo(before.width, 0);
  expect(moving[0]!.height).toBeCloseTo(before.height, 0);
}

/**
 * Mounts adjacent blocks whose first paragraph changes height when indented.
 *
 * @param page - Browser page receiving the isolated document and narrow surface.
 * @returns The demo fixture is ready to select and move.
 */
async function prepareWrappingPage(page: Page): Promise<void> {
  await page.goto("/?test_features=1");
  const surface = page.locator('[data-journal-document="today"] > .page-surface');
  await expect(surface).toBeVisible();
  await surface.evaluate((element: HTMLElement) => {
    element.style.width = "400px";
  });
  await page.evaluate(() => {
    const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }).__rivtoDemo
      .editor;
    editor.load({ ...editor.dump(), blocks: [], elements: [], rootElementIds: [] });
    editor.blocks.insertBlock({ id: "resize-parent", type: "paragraph", content: "Parent" });
    editor.blocks.insertBlock({
      id: "resize-first",
      type: "paragraph",
      content: "A long block that wraps when nesting changes the available width. ".repeat(5),
    });
    editor.blocks.insertBlock({ id: "resize-last", type: "paragraph", content: "Following block" });
  });
}

test("holds wrapping blocks at a stable size and spacing during grouped moves", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await prepareWrappingPage(page);
  const surface = page.locator('[data-journal-document="today"] > .page-surface');
  const first = surface.locator('[data-block-id="resize-first"]');
  const last = surface.locator('[data-block-id="resize-last"]');
  await first.locator("[data-block-content]").click();
  await last.locator("[data-block-content]").click({ modifiers: ["Shift"] });
  for (const [key, parent] of [
    ["Tab", "resize-parent"],
    ["Shift+Tab", null],
  ] as const) {
    const before = await first.boundingBox();
    expect(before!.height).toBeGreaterThan(100);
    const frames = await sampleMovement(page, key);
    expectStableMovement(frames, before!);
    const after = await first.boundingBox();
    expect(Math.abs(after!.width - before!.width)).toBeGreaterThan(10);
    expect(Math.abs(after!.height - before!.height)).toBeGreaterThan(10);
    await expect
      .poll(() =>
        page.evaluate(() => {
          const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
            .__rivtoDemo.editor;
          return [
            editor.blocks.getParentId("resize-first"),
            editor.blocks.getParentId("resize-last"),
          ];
        }),
      )
      .toEqual([parent, parent]);
    await expect(first).toHaveAttribute("data-block-selected", "true");
    await expect(last).toHaveAttribute("data-block-selected", "true");
    for (const block of [first, last]) {
      const inline = await block.evaluate((element: HTMLElement) => ({
        width: element.style.width,
        height: element.style.height,
        boxSizing: element.style.boxSizing,
      }));
      expect(inline).toEqual({ width: "", height: "", boxSizing: "" });
    }
  }
});

test("holds grouped wrapping blocks steady inside a zoomed canvas card", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto("/?test_features=1");
  await expect(page.locator('[data-journal-document="today"] > .page-surface')).toBeVisible();
  await page.evaluate(() => {
    const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }).__rivtoDemo
      .editor;
    editor.load({ ...editor.dump(), blocks: [], elements: [], rootElementIds: [] });
    editor.blocks.insertBlock({
      id: "canvas-resize-root",
      type: "paragraph",
      content: "Canvas root",
      children: [
        { id: "resize-parent", type: "paragraph", content: "Parent" },
        {
          id: "resize-first",
          type: "paragraph",
          content: "A long block that wraps when nesting changes the available width. ".repeat(3),
        },
        { id: "resize-last", type: "paragraph", content: "Following block" },
      ],
    });
  });
  await page.locator('[data-editor-mode="edgeless"]').click();
  await page.getByRole("button", { name: "Zoom out" }).click();
  const surfaceSelector = '.edgeless-card-content:has([data-block-id="canvas-resize-root"])';
  const surface = page.locator(surfaceSelector);
  const first = surface.locator('[data-block-id="resize-first"]');
  const last = surface.locator('[data-block-id="resize-last"]');
  await first.locator("[data-block-content]").click();
  await last.locator("[data-block-content]").click({ modifiers: ["Shift"] });
  const before = await first.boundingBox();
  const frames = await sampleMovement(page, "Tab", surfaceSelector);
  expectStableMovement(frames, before!);
  await expect(first).toHaveAttribute("data-block-selected", "true");
  await expect(last).toHaveAttribute("data-block-selected", "true");
  await expect
    .poll(() =>
      first.evaluate((element: HTMLElement) => [element.style.width, element.style.height]),
    )
    .toEqual(["", ""]);
});
