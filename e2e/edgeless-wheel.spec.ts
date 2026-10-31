import { expect, test, type Locator } from "@playwright/test";

for (const repeat of [0, 200]) {
  test(`touchpad scrolling pans the canvas and preserves zoom, repeat=${repeat}`, async ({
    page,
  }) => {
    await page.goto(`/?test_features=1&repeat=${repeat}`);
    await page.locator('[data-editor-mode="edgeless"]').click();
    const canvas = page.locator(".edgeless-viewport");
    await canvas.hover({ position: { x: 24, y: 24 } });
    const scrollY = await page.evaluate(() => window.scrollY);

    await page.mouse.wheel(48, 72);
    await expect(canvas).toHaveAttribute("data-edgeless-pan-x", "-48");
    await expect(canvas).toHaveAttribute("data-edgeless-pan-y", "-72");
    await expect(canvas).toHaveAttribute("data-edgeless-zoom", "1");
    await expect(canvas.locator(".edgeless-plane")).toHaveCSS(
      "transform",
      "matrix(1, 0, 0, 1, -48, -72)",
    );
    expect(await page.evaluate(() => window.scrollY)).toBe(scrollY);

    await page.mouse.wheel(-48, -72);
    await expect(canvas).toHaveAttribute("data-edgeless-pan-x", "0");
    await expect(canvas).toHaveAttribute("data-edgeless-pan-y", "0");
    await page.getByRole("button", { name: "Zoom in", exact: true }).click();
    await expect(canvas).toHaveAttribute("data-edgeless-zoom", "1.1");
    const before = await canvas.evaluate((element) => ({
      x: Number((element as HTMLElement).dataset.edgelessPanX),
      y: Number((element as HTMLElement).dataset.edgelessPanY),
    }));
    await canvas
      .locator('[data-auto-height="true"] [data-edgeless-card-content]')
      .first()
      .hover({ position: { x: 80, y: 80 } });
    await page.mouse.wheel(20, 30);
    await expect(canvas).toHaveAttribute("data-edgeless-pan-x", String(before.x - 20));
    await expect(canvas).toHaveAttribute("data-edgeless-pan-y", String(before.y - 30));
    await expect(canvas).toHaveAttribute("data-edgeless-zoom", "1.1");

    for (const modifier of ["Control", "Meta"]) {
      const zoom = Number(await canvas.getAttribute("data-edgeless-zoom"));
      await page.keyboard.down(modifier);
      await page.mouse.wheel(0, -40);
      await page.keyboard.up(modifier);
      await expect
        .poll(async () => Number(await canvas.getAttribute("data-edgeless-zoom")))
        .toBeGreaterThan(zoom);
    }
  });
}

test("touchpad scrolling inside a fixed-height card keeps native scrolling", async ({ page }) => {
  await page.goto("/?test_features=1");
  await page.locator('[data-editor-mode="edgeless"]').click();
  const canvas = page.locator(".edgeless-viewport");
  const card = canvas.locator("[data-edgeless-root]").first();
  await card.click({ position: { x: 12, y: 12 } });
  await page.getByRole("checkbox", { name: "Automatic card height" }).uncheck();
  await card.evaluate((element) => {
    (element as HTMLElement).style.height = "160px";
  });
  const content = card.locator(".edgeless-card-content");
  await content.hover({ position: { x: 80, y: 80 } });
  await page.mouse.wheel(0, 60);
  await expect.poll(() => content.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await expect(canvas).toHaveAttribute("data-edgeless-pan-x", "0");
  await expect(canvas).toHaveAttribute("data-edgeless-pan-y", "0");
});

for (const repeat of [0, 200]) {
  test(`panning preserves card styles and drawing coverage, repeat=${repeat}`, async ({ page }) => {
    await page.goto(`/?test_features=1&repeat=${repeat}`);
    await page.locator('[data-editor-mode="edgeless"]').click();
    const canvas = page.locator(".edgeless-viewport");
    await canvas.hover({ position: { x: 24, y: 24 } });
    const card = canvas.locator("[data-edgeless-root]").first();
    const before = await card.evaluate((element) => {
      const style = getComputedStyle(element);
      return Object.fromEntries(Array.from(style, (key) => [key, style.getPropertyValue(key)]));
    });

    await page.mouse.wheel(48, 72);
    await expect(canvas).toHaveAttribute("data-edgeless-pan-x", "-48");
    await expect(canvas).toHaveAttribute("data-edgeless-pan-y", "-72");
    const after = await card.evaluate((element) => {
      const style = getComputedStyle(element);
      return Object.fromEntries(Array.from(style, (key) => [key, style.getPropertyValue(key)]));
    });
    expect(after).toEqual(before);

    const capture = canvas.locator(".edgeless-drawing-capture");
    const viewportBounds = (await canvas.boundingBox())!;
    const captureBounds = (await capture.boundingBox())!;
    expect(captureBounds.x).toBeCloseTo(viewportBounds.x + 1, 0);
    expect(captureBounds.y).toBeCloseTo(viewportBounds.y + 1, 0);
    expect(captureBounds.width).toBeCloseTo(viewportBounds.width - 2, 0);
    expect(captureBounds.height).toBeCloseTo(viewportBounds.height - 2, 0);
  });
}

/**
 * Records camera displacement during the next real wheel event and two subsequent frames.
 *
 * Timing excludes fixture creation and wheel delivery by the test driver. The camera
 * sampled on event bubbling must already contain the complete native displacement.
 *
 * @param canvas - Mounted edgeless viewport receiving the next wheel sample.
 * @returns Resolves when one-shot timing listeners are installed in the page.
 */
async function observeTrackpadSample(canvas: Locator): Promise<void> {
  await canvas.evaluate((root) => {
    const state = window as typeof window & {
      trackpadSample: {
        start: number;
        sync: number;
        paint: number;
        actual: number;
        before: number;
      };
    };
    const sample = { start: 0, sync: 0, paint: 0, actual: 0, before: 0 };
    state.trackpadSample = sample;
    window.addEventListener(
      "wheel",
      () => {
        sample.before = Number(root.getAttribute("data-edgeless-pan-y"));
        sample.start = performance.now();
      },
      { capture: true, once: true },
    );
    window.addEventListener(
      "wheel",
      () => {
        sample.sync = performance.now() - sample.start;
        sample.actual = Number(root.getAttribute("data-edgeless-pan-y"));
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            sample.paint = performance.now() - sample.start;
          }),
        );
      },
      { once: true },
    );
  });
}

for (const repeat of [0, 200]) {
  test(`fast trackpad movement reaches the camera in the input event, repeat=${repeat}`, async ({
    page,
  }) => {
    await page.goto(`/?test_features=1&repeat=${repeat}`);
    const journal = page.locator('[data-journal-document="today"]');
    await journal.locator('[data-editor-mode="edgeless"]').click();
    const canvas = journal.locator(".edgeless-viewport");
    await canvas.hover({ position: { x: 150, y: 150 } });
    await page.mouse.wheel(0, 1);
    await expect(canvas).toHaveAttribute("data-edgeless-pan-y", "-1");
    const samples = [];
    for (const delta of [72, -72, 100.5, -100.5, 48]) {
      await observeTrackpadSample(canvas);
      await page.mouse.wheel(0, delta);
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              (window as typeof window & { trackpadSample: { paint: number } }).trackpadSample
                .paint,
          ),
        )
        .toBeGreaterThan(0);
      const sample = await page.evaluate(
        () =>
          (
            window as typeof window & {
              trackpadSample: { sync: number; paint: number; actual: number; before: number };
            }
          ).trackpadSample,
      );
      samples.push({ ...sample, expected: sample.before - delta });
      await expect(canvas).toHaveAttribute("data-edgeless-pan-y", String(sample.before - delta));
    }
    console.log(`trackpad repeat=${repeat}: ${JSON.stringify(samples)}`);
    for (const sample of samples) {
      expect(sample.actual).toBe(sample.expected);
    }
    await expect(canvas).toHaveAttribute("data-edgeless-zoom", "1");
  });
}
