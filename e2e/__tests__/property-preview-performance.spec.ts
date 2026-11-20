import { expect, test } from "@playwright/test";

interface MeasuredWindow extends Window {
  __rivtoDemo: {
    editor: {
      elements: {
        updateElements: (...args: unknown[]) => unknown;
        getElementNode: (id: string) => { props: Record<string, unknown> } | undefined;
      };
    };
  };
  propertyTiming: { sync: number[]; rendered: number[] };
}

for (const repeat of [0, 200]) {
  test(`property preview commits outside the panel at repeat=${repeat}`, async ({ page }) => {
    await page.goto(repeat ? `/?repeat=${repeat}` : "/");
    await page.locator('[data-editor-mode="edgeless"]').click();
    const viewport = page.locator(".edgeless-viewport");
    await viewport.evaluate((element) => element.scrollIntoView({ block: "start" }));
    const box = await viewport.boundingBox();
    if (!box) {
      throw new Error("Expected the edgeless viewport");
    }
    await page
      .getByRole("toolbar", { name: "Visual objects" })
      .getByRole("button", { name: "Shapes" })
      .click();
    await page
      .getByRole("dialog", { name: "shapes tools" })
      .getByRole("button", { name: "Rectangle", exact: true })
      .click();
    await page.mouse.click(box.x + box.width - 300, box.y + 200);
    const rectangle = page.locator('[data-edgeless-visual-kind="rectangle"][data-selected="true"]');
    await expect(rectangle).toHaveCount(1);
    const id = await rectangle.getAttribute("data-edgeless-object-id");
    if (!id) {
      throw new Error("Expected a selected rectangle");
    }
    await page
      .getByRole("toolbar", { name: "Visual objects" })
      .getByRole("button", { name: "Select" })
      .click();
    await page.evaluate(() => {
      const win = window as unknown as MeasuredWindow;
      win.propertyTiming = { sync: [], rendered: [] };
      const elements = win.__rivtoDemo.editor.elements;
      const update = elements.updateElements.bind(elements);
      elements.updateElements = (...args) => {
        const start = performance.now();
        try {
          return update(...args);
        } finally {
          win.propertyTiming.sync.push(performance.now() - start);
        }
      };
      window.addEventListener(
        "pointerdown",
        () => {
          const start = performance.now();
          requestAnimationFrame(() =>
            requestAnimationFrame(() =>
              win.propertyTiming.rendered.push(performance.now() - start),
            ),
          );
        },
        true,
      );
    });
    const samples: { sync: number; rendered: number }[] = [];
    for (let index = 0; index < 4; index += 1) {
      const properties = page.getByRole("region", { name: "Visual properties" });
      if ((await properties.getAttribute("data-collapsed")) === "true") {
        await properties.getByRole("button", { name: "Expand properties" }).click();
      }
      const color = index % 2 ? "#123456" : "#654321";
      await properties.getByLabel("Fill color").evaluate((element, value) => {
        (element as HTMLInputElement).value = value;
        element.dispatchEvent(new InputEvent("input", { bubbles: true }));
      }, color);
      await expect(rectangle.locator("rect")).toHaveAttribute("fill", color);
      await page.evaluate(() => {
        (window as unknown as MeasuredWindow).propertyTiming = { sync: [], rendered: [] };
      });
      await viewport.click({ position: { x: 24, y: 24 } });
      await expect
        .poll(() =>
          page.evaluate(
            (elementId) =>
              (window as unknown as MeasuredWindow).__rivtoDemo.editor.elements.getElementNode(
                elementId,
              )?.props.fill,
            id,
          ),
        )
        .toBe(color);
      await expect
        .poll(() =>
          page.evaluate(() => (window as unknown as MeasuredWindow).propertyTiming.rendered.length),
        )
        .toBeGreaterThan(0);
      const timing = await page.evaluate(
        () => (window as unknown as MeasuredWindow).propertyTiming,
      );
      expect(timing.sync.length).toBeGreaterThan(0);
      if (index > 0) {
        samples.push({ sync: timing.sync[0]!, rendered: timing.rendered[0]! });
      }
      if (index < 3) {
        await page.locator(`[data-edgeless-object-id="${id}"]`).click();
      }
    }
    console.log(`property preview repeat=${repeat}: ${JSON.stringify(samples)}`);
  });
}
