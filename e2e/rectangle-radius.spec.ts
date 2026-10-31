import { expect, test } from "@playwright/test";
import type { DocumentEditorAPI } from "@chulane/rivto";

for (const repeat of [0, 200]) {
  test(`rectangle radius previews locally and commits on release, repeat=${repeat}`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.goto(`/?test_features=1&repeat=${repeat}`);
    await page.locator('[data-editor-mode="edgeless"]').click();
    const toolbar = page.getByRole("toolbar", { name: "Visual objects" });
    await toolbar.getByRole("button", { name: "Shapes", exact: true }).click();
    await toolbar.getByRole("button", { name: "Rectangle", exact: true }).click();
    const canvas = page.locator(".edgeless-viewport");
    const bounds = (await canvas.boundingBox())!;
    await page.mouse.click(bounds.x + 200, bounds.y + 220);
    await toolbar.getByRole("button", { name: "Select", exact: true }).click();
    const host = page.locator('[data-edgeless-visual-kind="rectangle"]').last();
    const rect = host.locator("rect");
    const handle = host.getByRole("slider", { name: "Rectangle corner radius" });
    const id = (await host.getAttribute("data-edgeless-object-id"))!;
    const stored = () =>
      page.evaluate((id) => {
        const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
          .__rivtoDemo.editor;
        return editor.elements.getElementNode(id);
      }, id);
    const original = await stored();
    await expect(rect).toHaveAttribute("rx", "3");
    await handle.click({ trial: true });
    const start = (await handle.boundingBox())!;
    const x = start.x + start.width / 2;
    const y = start.y + start.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.evaluate(() => {
      const state = window as unknown as {
        __rivtoDemo: { editor: DocumentEditorAPI };
        radiusUpdates: number;
        stopRadiusObservation: () => void;
      };
      state.radiusUpdates = 0;
      state.stopRadiusObservation = state.__rivtoDemo.editor.subscribe(() => state.radiusUpdates++);
    });
    const samples = [];
    for (const delta of [10, 20, 30]) {
      await page.evaluate(() => {
        const state = window as unknown as {
          radiusTiming: null | { sync: number; frames: number };
        };
        state.radiusTiming = null;
        let start = 0;
        window.addEventListener(
          "pointermove",
          () => {
            start = performance.now();
          },
          { capture: true, once: true },
        );
        document.querySelector("[data-edgeless-plane]")!.addEventListener(
          "pointermove",
          () => {
            const sync = performance.now() - start;
            requestAnimationFrame(() =>
              requestAnimationFrame(() => {
                state.radiusTiming = { sync, frames: performance.now() - start };
              }),
            );
          },
          { once: true },
        );
      });
      await page.mouse.move(x + delta, y);
      await page.waitForFunction(
        () => (window as unknown as { radiusTiming: unknown }).radiusTiming !== null,
        undefined,
        { timeout: 5000 },
      );
      samples.push(
        await page.evaluate(() => (window as unknown as { radiusTiming: unknown }).radiusTiming),
      );
      expect(await stored()).toEqual(original);
      expect(
        await page.evaluate(() => (window as unknown as { radiusUpdates: number }).radiusUpdates),
      ).toBe(0);
      expect(Number(await rect.getAttribute("rx"))).toBeGreaterThan(3);
    }
    console.log(JSON.stringify({ interaction: "rectangle-radius", repeat, samples }));
    const preview = await rect.getAttribute("rx");
    await page.mouse.up();
    await expect(rect).toHaveAttribute("rx", preview!);
    expect((await stored())!.props.cornerRadius).toBe(Number(preview));
    await page.evaluate(() =>
      (window as unknown as { stopRadiusObservation: () => void }).stopRadiusObservation(),
    );
    await canvas.focus();
    await page.keyboard.press("ControlOrMeta+z");
    expect(await stored()).toEqual(original);
    await expect(rect).toHaveAttribute("rx", "3");
    await page.keyboard.press("ControlOrMeta+Shift+z");
    await expect(rect).toHaveAttribute("rx", preview!);

    // Escape and pointer cancellation discard a visible draft without changing storage.
    for (const cancel of ["Escape", "pointercancel"]) {
      const before = await stored();
      const box = (await handle.boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + 15, box.y + box.height / 2);
      if (cancel === "Escape") {
        await page.keyboard.press("Escape");
      } else {
        await handle.dispatchEvent("pointercancel");
      }
      await page.mouse.up();
      expect(await stored()).toEqual(before);
      await expect(rect).toHaveAttribute("rx", preview!);
    }

    // The property panel uses its existing preview/cancel/commit lifecycle.
    const property = page.getByRole("slider", { name: "Corner radius", exact: true });
    await property.focus();
    await property.press("Home");
    await expect(rect).toHaveAttribute("rx", "0");
    expect((await stored())!.props.cornerRadius).toBe(Number(preview));
    await property.press("Escape");
    await expect(rect).toHaveAttribute("rx", preview!);
    await expect(property).toHaveAttribute("aria-valuenow", preview!);
    await property.focus();
    await property.press("Home");
    await expect(rect).toHaveAttribute("rx", "0");
    await toolbar.getByRole("button", { name: "Select", exact: true }).click();
    expect((await stored())!.props.cornerRadius).toBe(0);
    await handle.focus();
    await handle.press("ArrowRight");
    expect((await stored())!.props.cornerRadius).toBe(1);

    // Rotated handles convert screen movement back to rectangle-local coordinates.
    await page.evaluate((id) => {
      const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
        .__rivtoDemo.editor;
      editor.elements.updateElement(id, { props: { rotation: 90 } });
    }, id);
    await expect(host).toHaveCSS("transform", /matrix\(0, 1, -1, 0,/);
    await expect(rect).toHaveAttribute("rx", "1");
    await handle.click({ trial: true });
    const rotated = (await handle.boundingBox())!;
    await page.mouse.move(rotated.x + rotated.width / 2, rotated.y + rotated.height / 2);
    await page.mouse.down();
    await page.mouse.move(rotated.x + rotated.width / 2, rotated.y + rotated.height / 2 + 20);
    await expect(rect).toHaveAttribute("rx", "21");
    expect((await stored())!.props.cornerRadius).toBe(1);
    await page.mouse.up();
    expect((await stored())!.props.cornerRadius).toBe(21);

    await toolbar.getByRole("button", { name: "Shapes", exact: true }).click();
    await toolbar.getByRole("button", { name: "Rectangle", exact: true }).click();
    await page.mouse.move(bounds.x + 500, bounds.y + 220);
    await expect(page.locator('[data-edgeless-creation-preview="rectangle"] rect')).toHaveAttribute(
      "rx",
      "21",
    );
    await page.mouse.click(bounds.x + 500, bounds.y + 220);
    await toolbar.getByRole("button", { name: "Select", exact: true }).click();
    await expect(
      page.locator('[data-edgeless-visual-kind="rectangle"]').last().locator("rect"),
    ).toHaveAttribute("rx", "21");

    await canvas.focus();
    const rectangleCount = await page.locator('[data-edgeless-visual-kind="rectangle"]').count();
    await page.keyboard.press("ControlOrMeta+c");
    await page.keyboard.press("ControlOrMeta+v");
    await expect(page.locator('[data-edgeless-visual-kind="rectangle"]')).toHaveCount(
      rectangleCount + 1,
    );
    const copied = page.locator('[data-edgeless-visual-kind="rectangle"]').last();
    await expect(copied).not.toHaveAttribute("data-edgeless-object-id", id);
    await expect(copied.locator("rect")).toHaveAttribute("rx", "21");
    await page.locator('[data-editor-mode="block"]').click();
    await page.locator('[data-editor-mode="edgeless"]').click();
    await expect(page.locator(`[data-edgeless-object-id="${id}"] rect`)).toHaveAttribute(
      "rx",
      "21",
    );
    await toolbar.getByRole("button", { name: "Shapes", exact: true }).click();
    await toolbar.getByRole("button", { name: "Rectangle", exact: true }).click();
    await page.mouse.move(bounds.x + 700, bounds.y + 400);
    await expect(page.locator('[data-edgeless-creation-preview="rectangle"] rect')).toHaveAttribute(
      "rx",
      "3",
    );
  });
}
