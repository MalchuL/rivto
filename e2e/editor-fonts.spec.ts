import { expect, test, type Page } from "@playwright/test";
import type { DocumentEditorAPI } from "@chulane/rivto";

const sans = "Inter, ui-sans-serif, system-ui, sans-serif";
const serif = "Georgia, Cambria, serif";
const mono = "ui-monospace, SFMono-Regular, Menlo, monospace";

/**
 * Reads saved content while ignoring derived auto-height card measurements.
 * Only detached snapshot heights are normalized; the document itself is not changed.
 *
 * @param page - Demo page exposing its core editor through window.__rivtoDemo.
 * @returns Detached document snapshot with auto-height block card heights set to zero,
 * retaining all other geometry and content for persistence assertions.
 */
async function documentSnapshot(page: Page) {
  return page.evaluate(() => {
    const snapshot = (
      window as unknown as {
        __rivtoDemo: { editor: DocumentEditorAPI };
      }
    ).__rivtoDemo.editor.dump();
    for (const element of snapshot.elements ?? []) {
      // Typography reflows auto-height cards; their derived heights bypass undo history.
      if (element.type === "block" && element.props.autoHeight !== false) {
        element.frame.height = 0;
      }
    }
    return snapshot;
  });
}

/**
 * Opens the registered text group and waits for its creation-default controls.
 * Requires the group dialog to be closed; opening it does not arm the Text tool.
 *
 * @param page - Demo page displaying the edgeless surface and its visual toolbar.
 * @returns Locator for the visible text tools dialog with its default font picker ready.
 */
async function armText(page: Page) {
  await page
    .getByRole("toolbar", { name: "Visual objects" })
    .getByRole("button", { name: "Text", exact: true })
    .and(page.locator('[aria-haspopup="dialog"]'))
    .click();
  const menu = page.getByRole("dialog", { name: "text tools" });
  await expect(menu.getByLabel("Default font", { exact: true })).toBeVisible();
  return menu;
}

/**
 * Places text through pointer input and returns its stable persisted ID.
 * Verifies the serif font on the actual creation preview before placing the element,
 * then returns to Select while retaining selection of the newly created text.
 *
 * @param page - Edgeless demo with the serif application default and a closed Text group dialog.
 * @returns Persisted ID of the newly selected text element after its preview is committed.
 */
async function placeText(page: Page) {
  const menu = await armText(page);
  await menu.getByRole("button", { name: "Text", exact: true }).click();
  const bounds = (await page.locator(".edgeless-viewport").boundingBox())!;
  await page.mouse.move(bounds.x + 250, bounds.y + 180);
  const preview = page.locator('[data-edgeless-creation-preview="text"] .edgeless-visual-text');
  await expect(preview).toBeVisible();
  await expect(preview).toHaveCSS("font-family", serif);
  await page.mouse.click(bounds.x + 250, bounds.y + 180);
  const selected = page.locator('[data-edgeless-visual-kind="text"][data-selected="true"]');
  await expect(selected).toHaveCount(1);
  const id = (await selected.getAttribute("data-edgeless-object-id"))!;
  await page
    .getByRole("toolbar", { name: "Visual objects" })
    .getByRole("button", { name: "Select", exact: true })
    .click();
  return id;
}

/**
 * Checks that application configuration does not enter font-edit history or change pasted fonts.
 * Separates creation from the font edit's undo group and commits the preview with an
 * outside pointer click before exercising undo, redo, and clipboard keyboard input.
 *
 * @param page - Edgeless demo displaying the selected text element's font property control.
 * @param id - Stable ID of that element, whose persisted font initially uses the serif stack.
 * @returns No value after asserting font history and preservation of the pasted Sans font
 * while the application default uses Mono.
 */
async function checkFontHistoryAndClipboard(page: Page, id: string) {
  const text = page.locator(`[data-edgeless-object-id="${id}"] .edgeless-visual-text`);
  await page.evaluate(() =>
    (
      window as unknown as {
        __rivtoDemo: { editor: DocumentEditorAPI };
      }
    ).__rivtoDemo.editor.history.stopCapturing(),
  );
  await page.getByLabel("Font family", { exact: true }).selectOption(sans);
  await expect(text).toHaveCSS("font-family", sans);
  await page.locator(".demo-header").click({ position: { x: 1, y: 1 } });
  await page.getByLabel("Application font").selectOption(sans);
  await page.locator(".edgeless-viewport").focus();
  await page.keyboard.press("Control+z");
  await expect(text).toHaveCSS("font-family", serif);
  await page.keyboard.press("Control+Shift+z");
  await expect(text).toHaveCSS("font-family", sans);
  await page.getByLabel("Application font").selectOption(mono);
  await page.locator(".edgeless-viewport").focus();
  const textElements = page.locator('[data-edgeless-visual-kind="text"]');
  const count = await textElements.count();
  await page.keyboard.press("Control+c");
  await page.keyboard.press("Control+v");
  await expect(textElements).toHaveCount(count + 1);
  await expect(
    page.locator('[data-edgeless-visual-kind="text"][data-selected="true"] .edgeless-visual-text'),
  ).toHaveCSS("font-family", sans);
}

/** One font-change sample, including derived layout notifications. */
interface FontTiming {
  /** Milliseconds from the change event to its queued microtask, including synchronous handlers. */
  readonly synchronous: number;
  /** Milliseconds through three animation frames; a rendering proxy including the deferred card batch. */
  readonly rendering: number;
  /** Document notifications observed before the rendering sample is recorded. */
  readonly notifications: number;
}

/** Browser-local measurements; reset before every actual font selection. */
interface FontMeasurementState {
  /** Document notification count reset before each measured selection. */
  fontNotifications: number;
  /** Completed sample, or undefined while its animation-frame callbacks are pending. */
  fontSample?: FontTiming;
}

/**
 * Measures event processing and rendering after the queued card batch and subsequent frame.
 * Confirms inherited block typography changed and limits document notifications to
 * detect a return to one derived-height transaction per card. The frame timing is
 * a rendering proxy rather than proof that asynchronously loaded font files settled.
 *
 * @param page - Font-configuration demo with a subscription updating fontNotifications.
 * @param family - Available CSS family stack different from the current application default.
 * @returns Event and rendering durations in milliseconds, with the document notification count.
 * @throws If the expected typography does not appear or the notification bound is exceeded.
 */
async function measureFontChange(page: Page, family: string) {
  await page.getByLabel("Application font").evaluate((select) => {
    const state = window as unknown as FontMeasurementState;
    state.fontSample = undefined;
    state.fontNotifications = 0;
    select.addEventListener(
      "change",
      () => {
        const start = performance.now();
        queueMicrotask(() => {
          const synchronous = performance.now() - start;
          requestAnimationFrame(() =>
            requestAnimationFrame(() =>
              requestAnimationFrame(() => {
                state.fontSample = {
                  synchronous,
                  rendering: performance.now() - start,
                  notifications: state.fontNotifications,
                };
              }),
            ),
          );
        });
      },
      { capture: true, once: true },
    );
  });
  await page.getByLabel("Application font").selectOption(family);
  await expect(page.locator(".rivto-block-content-flow").first()).toHaveCSS("font-family", family);
  await expect
    .poll(() => page.evaluate(() => (window as unknown as FontMeasurementState).fontSample))
    .toBeTruthy();
  const sample = await page.evaluate(() => (window as unknown as FontMeasurementState).fontSample!);
  // Global typography must batch derived heights instead of notifying once for every card.
  expect(sample.notifications).toBeLessThanOrEqual(4);
  return sample;
}

for (const repeat of [0, 200]) {
  test(`live application fonts preserve document content and element choices, repeat=${repeat}`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.goto(`/?fonts&repeat=${repeat}`);
    const content = page.locator(".rivto-block-content-flow").first();
    await expect(content).toBeVisible();
    const initial = await documentSnapshot(page);
    await page.getByLabel("Application font").selectOption(serif);
    await expect(content).toHaveCSS("font-family", serif);
    expect(await documentSnapshot(page)).toEqual(initial);
    await page.locator('[data-editor-mode="edgeless"]').click();
    await expect(content).toHaveCSS("font-family", serif);
    const id = await placeText(page);
    const text = page.locator(`[data-edgeless-object-id="${id}"] .edgeless-visual-text`);
    await expect(text).toHaveCSS("font-family", serif);
    const saved = await documentSnapshot(page);
    await page.getByLabel("Application font").selectOption(mono);
    await expect(content).toHaveCSS("font-family", mono);
    await expect(text).toHaveCSS("font-family", serif);
    expect(await documentSnapshot(page)).toEqual(saved);
    const creationMenu = await armText(page);
    await expect(creationMenu.getByLabel("Default font", { exact: true })).toHaveValue(mono);
    await page
      .getByRole("toolbar", { name: "Visual objects" })
      .getByRole("button", { name: "Text", exact: true })
      .and(page.locator('[aria-haspopup="dialog"]'))
      .click();
    await page.getByLabel("Offer serif font").uncheck();
    const picker = page.getByLabel("Font family", { exact: true });
    await expect(picker).toHaveValue(serif);
    await expect(picker.locator("option:checked")).toHaveText(serif);
    expect(await documentSnapshot(page)).toEqual(saved);
    await checkFontHistoryAndClipboard(page, id);
    const menu = await armText(page);
    await expect(menu.getByLabel("Default font", { exact: true })).toHaveValue(sans);
    await expect(
      menu.getByLabel("Default font", { exact: true }).locator(`option[value="${serif}"]`),
    ).toHaveCount(0);
    await page.getByLabel("Offer serif font").check();
    await expect(
      menu.getByLabel("Default font", { exact: true }).locator(`option[value="${serif}"]`),
    ).toHaveCount(1);
  });

  test(`font configuration performance, repeat=${repeat}`, async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    await page.goto(`/?fonts&repeat=${repeat}`);
    const content = page.locator(".rivto-block-content-flow").first();
    await expect(content).toBeVisible();
    await page.evaluate(() => {
      (
        window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
      ).__rivtoDemo.editor.subscribe(() => {
        (window as unknown as FontMeasurementState).fontNotifications += 1;
      });
    });
    for (const mode of ["block", "edgeless"]) {
      await page.locator(`[data-editor-mode="${mode}"]`).click();
      const original = await documentSnapshot(page);
      await page.getByLabel("Application font").selectOption(serif);
      await expect(content).toHaveCSS("font-family", serif);
      const samples: FontTiming[] = [];
      for (const family of [mono, serif, mono, serif, mono]) {
        samples.push(await measureFontChange(page, family));
      }
      expect(await documentSnapshot(page)).toEqual(original);
      console.log(JSON.stringify({ browser: testInfo.project.name, repeat, mode, samples }));
    }
  });
}
