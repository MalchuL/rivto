import { expect, test, type Page } from "@playwright/test";
import type { DocumentEditorAPI } from "@chulane/rivto";
import type { ReactEditorApi } from "@chulane/rivto-react";

for (const repeat of [0, 200]) {
  test(`creation preview renders the actual mindmap without document writes, repeat=${repeat}`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.goto(`/?repeat=${repeat}`);
    await page.locator('[data-editor-mode="edgeless"]').click();
    const toolbar = page.getByRole("toolbar", { name: "Visual objects" });
    await toolbar.getByRole("button", { name: "Diagrams", exact: true }).click();
    const bounds = (await page.locator(".edgeless-viewport").boundingBox())!;
    const stored = () =>
      page.evaluate(() =>
        (
          window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
        ).__rivtoDemo.editor.dump(),
      );
    const original = await stored();
    await page.evaluate(() => {
      const state = window as unknown as {
        __rivtoDemo: { editor: DocumentEditorAPI };
        creationUpdates: number;
        stopCreationObservation: () => void;
      };
      state.creationUpdates = 0;
      state.stopCreationObservation = state.__rivtoDemo.editor.subscribe(() => {
        state.creationUpdates += 1;
      });
    });
    await page.evaluate(() => {
      const state = window as unknown as {
        __rivtoDemo: { reactEditor: ReactEditorApi };
        creationFactoryCalls: number;
      };
      state.creationFactoryCalls = 0;
      const creation = state.__rivtoDemo.reactEditor.elementTypes.get("mindmap")!.creation!;
      const create = creation.create;
      Object.assign(creation, {
        create: (panel: Parameters<typeof create>[0]) => {
          state.creationFactoryCalls += 1;
          const input = create(panel);
          return {
            ...input,
            props: {
              ...input.props,
              nodes: [{ id: "root", parentId: null, label: `Draft ${state.creationFactoryCalls}` }],
            },
          };
        },
      });
    });
    await page.mouse.move(bounds.x + 250, bounds.y + 180);
    const preview = page.locator("[data-edgeless-creation-preview]");
    await expect(preview.locator('[data-mindmap-node="root"]')).toBeVisible();
    await expect(preview).toHaveAttribute("inert", "");
    await expect(preview).toHaveAttribute("aria-hidden", "true");
    await expect(
      page.locator('[data-edgeless-object-id][data-edgeless-visual-kind="mindmap"]'),
    ).toHaveCount(0);
    const natural = (await preview.boundingBox())!;
    expect(natural.width).not.toBe(160);
    await page.keyboard.down("Alt");
    await page.mouse.down();
    await page.mouse.move(bounds.x + 450, bounds.y + 280);
    const smallNode = (await preview.locator("[data-mindmap-node]").boundingBox())!;
    const samples = [];
    for (const offset of [250, 275, 300]) {
      samples.push(
        await measurePointer(page, "pointermove", () =>
          page.mouse.move(bounds.x + 250 + offset, bounds.y + 200 + offset / 2),
        ),
      );
    }
    console.log(JSON.stringify({ interaction: "creation-preview", repeat, samples }));
    expect((await preview.locator("[data-mindmap-node]").boundingBox())!.width).toBeGreaterThan(
      smallNode.width,
    );
    expect(await stored()).toEqual(original);
    expect(
      await page.evaluate(() => (window as unknown as { creationUpdates: number }).creationUpdates),
    ).toBe(0);
    expect(
      await page.evaluate(
        () => (window as unknown as { creationFactoryCalls: number }).creationFactoryCalls,
      ),
    ).toBe(1);
    const finalBox = (await preview.boundingBox())!;
    const commit = await measurePointer(page, "pointerup", () => page.mouse.up());
    console.log(JSON.stringify({ interaction: "creation-commit", repeat, samples: [commit] }));
    await page.keyboard.up("Alt");
    await toolbar.getByRole("button", { name: "Select", exact: true }).click();
    await expect(preview).toHaveCount(0);
    const created = page.locator('[data-edgeless-visual-kind="mindmap"]');
    await expect(created).toHaveCount(1);
    await expect(created.getByRole("textbox")).toHaveValue("Draft 1");
    expect(
      await page.evaluate(
        () => (window as unknown as { creationFactoryCalls: number }).creationFactoryCalls,
      ),
    ).toBe(1);
    const createdBox = (await created.boundingBox())!;
    for (const key of ["x", "y", "width", "height"] as const) {
      expect(createdBox[key]).toBeCloseTo(finalBox[key], 0);
    }
    await page.locator(".edgeless-viewport").focus();
    await page.keyboard.press("ControlOrMeta+z");
    await expect(created).toHaveCount(0);
    await toolbar.getByRole("button", { name: "Diagrams", exact: true }).click();
    await page.mouse.move(bounds.x + 300, bounds.y + 200);
    await page.mouse.down();
    await page.mouse.move(bounds.x + 500, bounds.y + 300);
    await page.keyboard.press("Escape");
    await page.mouse.up();
    await toolbar.getByRole("button", { name: "Select", exact: true }).click();
    await expect(preview).toHaveCount(0);
    await expect(created).toHaveCount(0);
    await page.evaluate(() =>
      (window as unknown as { stopCreationObservation: () => void }).stopCreationObservation(),
    );
  });
}

test("built-in placement previews use the same renderer and creation defaults", async ({
  page,
}) => {
  await page.goto("/?repeat=0");
  await page.locator('[data-editor-mode="edgeless"]').click();
  const toolbar = page.getByRole("toolbar", { name: "Visual objects" });
  for (const [group, label, type, content] of [
    ["Shapes", "Rectangle", "rectangle", ".edgeless-shape rect"],
    ["Shapes", "Ellipse", "ellipse", ".edgeless-shape ellipse"],
    ["Text", "Text", "text", ".edgeless-visual-text"],
    ["Stickies", "Pink sticky", "sticker", ".edgeless-sticker-text"],
  ]) {
    await toolbar.getByRole("button", { name: group, exact: true }).click();
    const menu = toolbar.getByRole("dialog");
    if (group === "Shapes") {
      await menu.getByLabel("Default fill", { exact: true }).fill("#123456");
    }
    await menu.getByRole("button", { name: label, exact: true }).click();
    const bounds = (await page.locator(".edgeless-viewport").boundingBox())!;
    await page.mouse.move(bounds.x + 600, bounds.y + 200);
    const preview = page.locator(`[data-edgeless-creation-preview="${type}"]`);
    await expect(preview.locator(content)).toBeVisible();
    if (group === "Shapes") {
      await expect(preview.locator(content)).toHaveAttribute("fill", "#123456");
    }
    const previewText = await preview.textContent();
    await page.mouse.down();
    await page.mouse.up();
    await toolbar.getByRole("button", { name: "Select", exact: true }).click();
    const placed = page.locator(`[data-edgeless-visual-kind="${type}"]`).last();
    await expect(placed.locator(content)).toBeVisible();
    if (group === "Shapes") {
      await expect(placed.locator(content)).toHaveAttribute("fill", "#123456");
    }
    expect(await placed.textContent()).toBe(previewText);
  }
});

test("toolbar drag renders the real ellipse and Escape discards the draft", async ({ page }) => {
  await page.goto("/?repeat=0");
  await page.locator('[data-editor-mode="edgeless"]').click();
  const toolbar = page.getByRole("toolbar", { name: "Visual objects" });
  await toolbar.getByRole("button", { name: "Shapes", exact: true }).click();
  await toolbar.getByRole("button", { name: "Rectangle", exact: true }).click();
  const area = (await page.locator(".edgeless-viewport").boundingBox())!;
  await page.keyboard.down("Alt");
  await page.mouse.move(area.x + 350, area.y + 220);
  await page.mouse.down();
  await page.mouse.move(area.x + 590, area.y + 370, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.up("Alt");
  const rectangle = page.locator('[data-edgeless-visual-kind="rectangle"]').last();
  const remembered = (await rectangle.boundingBox())!;
  await toolbar.getByRole("button", { name: "Select", exact: true }).click();
  await toolbar.getByRole("button", { name: "Shapes", exact: true }).click();
  const button = (await toolbar
    .getByRole("button", { name: "Ellipse", exact: true })
    .boundingBox())!;
  const canvas = (await page.locator(".edgeless-viewport").boundingBox())!;
  const count = await page.locator('[data-edgeless-visual-kind="ellipse"]').count();
  await page.mouse.move(button.x + button.width / 2, button.y + button.height / 2);
  await page.mouse.down();
  await page.mouse.move(canvas.x + 600, canvas.y + 240, { steps: 8 });
  const ghost = page.locator(".edgeless-preset-ghost");
  await expect(ghost.locator(".edgeless-shape ellipse")).toBeVisible();
  expect((await ghost.boundingBox())!.width).toBeCloseTo(remembered.width, 1);
  expect((await ghost.boundingBox())!.height).toBeCloseTo(remembered.height, 1);
  await expect(ghost.locator("[data-edgeless-creation-preview]")).toHaveAttribute("inert", "");
  await expect(page.locator('[data-edgeless-visual-kind="ellipse"]')).toHaveCount(count);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(ghost).toHaveCount(0);
  await expect(page.locator('[data-edgeless-visual-kind="ellipse"]')).toHaveCount(count);
  await toolbar.getByRole("button", { name: "Select", exact: true }).click();
  await toolbar.getByRole("button", { name: "Shapes", exact: true }).click();
  await page.mouse.move(button.x + button.width / 2, button.y + button.height / 2);
  await page.mouse.down();
  await page.mouse.move(canvas.x + 650, canvas.y + 400, { steps: 8 });
  await expect(ghost).toBeVisible();
  await page.mouse.up();
  await expect(ghost).toHaveCount(0);
  await expect(page.locator('[data-edgeless-visual-kind="ellipse"]')).toHaveCount(count + 1);
  const placed = (await page
    .locator('[data-edgeless-visual-kind="ellipse"]')
    .last()
    .boundingBox())!;
  expect(placed.width).toBeCloseTo(remembered.width, 1);
  expect(placed.height).toBeCloseTo(remembered.height, 1);
});

/**
 * Samples a real pointer event including synchronous subscribers and two animation frames.
 *
 * @param page - Warm production demo with the intended tool and gesture already active.
 * @param type - Browser event dispatched by the supplied action.
 * @param action - Real mouse input; fixture setup and assertions remain outside its timing.
 * @returns Event duration and two-frame rendering proxy in milliseconds.
 */
async function measurePointer(
  page: Page,
  type: "pointermove" | "pointerup",
  action: () => Promise<void>,
) {
  await page.evaluate((type) => {
    const state = window as unknown as {
      toolTiming: null | { sync: number; frames: number };
    };
    state.toolTiming = null;
    let start = 0;
    window.addEventListener(
      type,
      () => {
        start = performance.now();
      },
      { capture: true, once: true },
    );
    window.addEventListener(
      type,
      () => {
        const sync = performance.now() - start;
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            state.toolTiming = { sync, frames: performance.now() - start };
          }),
        );
      },
      { once: true },
    );
  }, type);
  await action();
  await page.waitForFunction(
    () => (window as unknown as { toolTiming: unknown }).toolTiming !== null,
  );
  return page.evaluate(
    () => (window as unknown as { toolTiming: { sync: number; frames: number } }).toolTiming,
  );
}
