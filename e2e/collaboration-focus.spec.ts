import { expect, test, type Page } from "@playwright/test";

/**
 * Opens independent collaborators with the requested surface combination.
 *
 * @param page - Browser page receiving the demo and real input.
 * @param modes - Left and right surface modes, respectively.
 * @returns Locators for the two mounted editors after initial synchronization.
 */
async function openCollaborators(page: Page, modes: readonly string[]) {
  await page.goto(`/?sync=1&room=focus-coverage-${crypto.randomUUID()}`);
  const panes = ["left", "right"].map((side) => page.locator(`[data-editor-sync="${side}"]`));
  await expect(panes[1]!.locator("[data-block-content]")).toHaveCount(2);
  for (const [index, mode] of modes.entries()) {
    if (mode === "Edgeless") {
      await panes[index]!.getByRole("button", { name: mode, exact: true }).click();
    }
  }
  return panes;
}

/**
 * Selects a short source-text range with real keyboard input.
 *
 * @param page - Browser page whose active text host receives the keys.
 * @returns Leaves the first two characters of the focused block selected.
 */
async function selectStart(page: Page) {
  await page.keyboard.press("ControlOrMeta+Home");
  await page.keyboard.press("Shift+ArrowRight");
  await page.keyboard.press("Shift+ArrowRight");
}

/**
 * Selects source offsets three through six in the focused text block.
 *
 * @param page - Browser page receiving native keyboard selection gestures.
 * @param backward - Whether the caret ends at offset three instead of six.
 * @returns Leaves a three-character range selected in the requested direction.
 */
async function selectMiddle(page: Page, backward = false) {
  await page.keyboard.press("ControlOrMeta+Home");
  for (let index = 0; index < (backward ? 6 : 3); index++) {
    await page.keyboard.press("ArrowRight");
  }
  for (let index = 0; index < 3; index++) {
    await page.keyboard.press(backward ? "Shift+ArrowLeft" : "Shift+ArrowRight");
  }
}

/**
 * Checks the remote highlight against the actual receiver's source-text geometry.
 *
 * @param page - Browser page containing exactly one noncollapsed remote range.
 * @param start - Expected UTF-16 start offset in the right editor's first block.
 * @param end - Expected exclusive UTF-16 end offset in that block.
 * @returns Resolves when the visible highlight matches the expected DOM range.
 */
async function expectRightHighlight(page: Page, start: number, end: number) {
  const highlight = page.locator('[data-collaboration-kind="selection"]');
  await expect(highlight).toHaveCount(1);
  await expect(highlight).toHaveCSS("color", "rgb(124, 58, 237)");
  await expect
    .poll(async () => {
      const expected = await page
        .locator('[data-editor-sync="right"] [data-block-content]')
        .first()
        .evaluate(
          (host, offsets) => {
            const range = document.createRange();
            range.setStart(host.firstChild!, offsets[0]!);
            range.setEnd(host.firstChild!, offsets[1]!);
            const rect = range.getBoundingClientRect();
            return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
          },
          [start, end],
        );
      const actual = await highlight.boundingBox();
      if (!actual) {
        return Infinity;
      }
      return Math.max(
        ...(["x", "y", "width", "height"] as const).map((key) =>
          Math.abs(actual[key] - expected[key]),
        ),
      );
    })
    .toBeLessThan(2);
}

for (const modes of [
  ["Page", "Page"],
  ["Page", "Edgeless"],
  ["Edgeless", "Page"],
  ["Edgeless", "Edgeless"],
]) {
  test.describe(modes.join(" → "), () => {
    test("backward ranges retain their geometry and caret endpoint after focus transfer", async ({
      page,
    }) => {
      const [left, right] = await openCollaborators(page, modes);
      await left!.locator("[data-block-content]").first().click();
      await selectMiddle(page, true);
      await right!.locator("[data-block-content]").nth(1).click();
      await expectRightHighlight(page, 3, 6);
      const caret = page.locator('[data-collaboration-kind="caret"]').filter({ hasText: "Vlad" });
      await expect(caret).toHaveCount(1);
      await expect
        .poll(async () => {
          const range = await page.locator('[data-collaboration-kind="selection"]').boundingBox();
          const endpoint = await caret.boundingBox();
          return Math.abs(endpoint!.x - range!.x);
        })
        .toBeLessThan(2);
    });

    for (const prefix of ["++", "Ж🙂"]) {
      test(`inserting ${prefix} before an inactive peer's range moves its highlight with the text`, async ({
        page,
      }) => {
        const [left, right] = await openCollaborators(page, modes);
        const source = left!.locator("[data-block-content]").first();
        const original = (await source.textContent())!;
        await source.click();
        await selectMiddle(page);
        await right!.locator("[data-block-content]").first().click();
        await page.keyboard.press("ControlOrMeta+Home");
        await page.keyboard.insertText(prefix);
        for (const pane of [left!, right!]) {
          await expect(pane.locator("[data-block-content]").first()).toHaveText(prefix + original);
        }
        await expectRightHighlight(page, 3 + prefix.length, 6 + prefix.length);
        await expect
          .poll(() => page.evaluate(() => window.getSelection()!.focusOffset))
          .toBe(prefix.length);
      });
    }

    test("deleting text before an inactive peer's range shifts only its coordinates", async ({
      page,
    }) => {
      const [left, right] = await openCollaborators(page, modes);
      const source = left!.locator("[data-block-content]").first();
      const original = (await source.textContent())!;
      await source.click();
      await selectMiddle(page);
      await right!.locator("[data-block-content]").first().click();
      await page.keyboard.press("ControlOrMeta+Home");
      await page.keyboard.press("Delete");
      await page.keyboard.press("Delete");
      for (const pane of [left!, right!]) {
        await expect(pane.locator("[data-block-content]").first()).toHaveText(original.slice(2));
      }
      await expectRightHighlight(page, 1, 4);
      await expect.poll(() => page.evaluate(() => window.getSelection()!.focusOffset)).toBe(0);
    });

    test("undo and redo of another user's prefix keep the retained range anchored", async ({
      page,
    }) => {
      const [left, right] = await openCollaborators(page, modes);
      const source = left!.locator("[data-block-content]").first();
      const original = (await source.textContent())!;
      await source.click();
      await selectMiddle(page);
      await right!.locator("[data-block-content]").first().click();
      await page.keyboard.press("ControlOrMeta+Home");
      await page.keyboard.insertText("++");
      await expectRightHighlight(page, 5, 8);
      await page.keyboard.press("ControlOrMeta+z");
      for (const pane of [left!, right!]) {
        await expect(pane.locator("[data-block-content]").first()).toHaveText(original);
      }
      await expectRightHighlight(page, 3, 6);
      await page.keyboard.press("ControlOrMeta+Shift+z");
      for (const pane of [left!, right!]) {
        await expect(pane.locator("[data-block-content]").first()).toHaveText("++" + original);
      }
      await expectRightHighlight(page, 5, 8);
    });

    test("collapsing one overlapping range preserves the other user's highlight", async ({
      page,
    }) => {
      const [left, right] = await openCollaborators(page, modes);
      await left!.locator("[data-block-content]").first().click();
      await selectStart(page);
      await right!.locator("[data-block-content]").first().click();
      await selectStart(page);
      const highlights = page.locator('[data-collaboration-kind="selection"]');
      await expect(highlights).toHaveCount(2);
      await expect(page.locator('[data-collaboration-kind="caret"]')).toHaveCount(2);
      await page.keyboard.press("ArrowRight");
      await expect(highlights).toHaveCount(1);
      await expect(highlights).toHaveCSS("color", "rgb(124, 58, 237)");
      await expect(page.locator('[data-collaboration-kind="caret"]')).toHaveCount(2);
      // Own retained source text and the remote source text must use identical geometry.
      await expect(left!.locator("[data-collaboration-text]")).toHaveCount(1);
      await expect(right!.locator("[data-collaboration-text]")).toHaveCount(1);
    });

    test("moving one range to another block removes its old marker without clearing its peer", async ({
      page,
    }) => {
      const [left, right] = await openCollaborators(page, modes);
      await left!.locator("[data-block-content]").first().click();
      await selectStart(page);
      await right!.locator("[data-block-content]").first().click();
      await selectStart(page);
      await right!.locator("[data-block-content]").nth(1).click();
      await selectStart(page);
      for (const pane of [left!, right!]) {
        await expect(pane.locator("[data-collaboration-text]")).toHaveCount(2);
      }
      await left!.locator("[data-block-content]").nth(1).click();
      await selectStart(page);
      for (const pane of [left!, right!]) {
        await expect(pane.locator("[data-block-content]").first()).not.toHaveAttribute(
          "data-collaboration-text",
          "",
        );
        await expect(pane.locator("[data-block-content]").nth(1)).toHaveAttribute(
          "data-collaboration-text",
          "",
        );
      }
      await expect(page.locator('[data-collaboration-kind="selection"]')).toHaveCount(2);
    });

    test("typing and undo after focus transfer preserve the other block and highlight", async ({
      page,
    }) => {
      const [left, right] = await openCollaborators(page, modes);
      const upper = left!.locator("[data-block-content]").first();
      const lower = right!.locator("[data-block-content]").nth(1);
      const originalUpper = (await upper.textContent())!;
      const originalLower = (await lower.textContent())!;
      await upper.click();
      await selectStart(page);
      await lower.click();
      await selectStart(page);
      await page.keyboard.type("XYZ");
      for (const pane of [left!, right!]) {
        await expect(pane.locator("[data-block-content]").first()).toHaveText(originalUpper);
        await expect(pane.locator("[data-block-content]").nth(1)).toHaveText(
          "XYZ" + originalLower.slice(2),
        );
      }
      await expect(page.locator('[data-collaboration-kind="selection"]')).toHaveCount(1);
      await expect(page.locator('[data-collaboration-kind="selection"]')).toHaveCSS(
        "color",
        "rgb(124, 58, 237)",
      );
      await page.keyboard.press("ControlOrMeta+z");
      for (const pane of [left!, right!]) {
        await expect(pane.locator("[data-block-content]").first()).toHaveText(originalUpper);
        await expect(pane.locator("[data-block-content]").nth(1)).toHaveText(originalLower);
      }
      await expect(right!.locator("[data-block-content]").first()).toHaveAttribute(
        "data-collaboration-text",
        "",
      );
    });

    test("deleting one selected block preserves the other participant's highlight", async ({
      page,
    }) => {
      const [left, right] = await openCollaborators(page, modes);
      await left!.locator("[data-block-content]").first().click();
      await selectStart(page);
      await right!.locator("[data-block-content]").nth(1).click();
      await selectStart(page);
      await expect(page.locator('[data-collaboration-kind="selection"]')).toHaveCount(2);
      const remaining = await right!.locator("[data-block-content]").nth(1).textContent();
      await page.evaluate(() => {
        const { right } = (
          window as unknown as {
            __rivtoSync: { right: { editor: import("@chulane/rivto").DocumentEditorAPI } };
          }
        ).__rivtoSync;
        right.editor.blocks.removeBlock(right.editor.blocks.getRootIds()[0]!);
      });
      for (const pane of [left!, right!]) {
        await expect(pane.locator("[data-block-content]")).toHaveCount(1);
        await expect(pane.locator("[data-block-content]")).toHaveText(remaining!);
      }
      await expect(page.locator('[data-collaboration-kind="selection"]')).toHaveCount(1);
      await expect(page.locator('[data-collaboration-kind="selection"]')).toHaveCSS(
        "color",
        "rgb(234, 179, 8)",
      );
      await expect(page.locator('[data-collaboration-kind="caret"]')).toHaveText("Olga");
    });

    test("hiding the tab clears both highlights and returning republishes only new input", async ({
      page,
    }) => {
      const [left, right] = await openCollaborators(page, modes);
      await left!.locator("[data-block-content]").first().click();
      await selectStart(page);
      await right!.locator("[data-block-content]").nth(1).click();
      await selectStart(page);
      await expect(page.locator('[data-collaboration-kind="selection"]')).toHaveCount(2);
      await page.evaluate(() => {
        // Headless browsers do not consistently hide background tabs; model the visibility state.
        Object.defineProperty(document, "hidden", { configurable: true, value: true });
        document.dispatchEvent(new Event("visibilitychange"));
      });
      await expect(page.locator("[data-collaboration-kind]")).toHaveCount(0);
      await expect(page.locator("[data-collaboration-text]")).toHaveCount(0);
      await page.evaluate(() => {
        Object.defineProperty(document, "hidden", { configurable: true, value: false });
        document.dispatchEvent(new Event("visibilitychange"));
      });
      await left!.locator("[data-block-content]").first().click();
      await selectStart(page);
      await expect(page.locator('[data-collaboration-kind="selection"]')).toHaveCount(1);
      await expect(page.locator('[data-collaboration-kind="caret"]')).toHaveText("Vlad");
      await expect(right!.locator("[data-block-content]").nth(1)).not.toHaveAttribute(
        "data-collaboration-text",
        "",
      );
    });

    test("both highlights survive alternating surface replacements", async ({ page }) => {
      const [left, right] = await openCollaborators(page, modes);
      await left!.locator("[data-block-content]").first().click();
      await selectStart(page);
      await right!.locator("[data-block-content]").nth(1).click();
      await selectStart(page);
      for (const mode of ["Edgeless", "Page", "Edgeless", "Page"]) {
        for (const pane of [left!, right!]) {
          await pane.getByRole("button", { name: mode, exact: true }).click();
          await expect(page.locator('[data-collaboration-kind="selection"]')).toHaveCount(2);
          await expect(
            page.locator('[data-collaboration-kind="caret"]').filter({ hasText: "Vlad" }),
          ).toHaveCount(1);
          await expect(
            page.locator('[data-collaboration-kind="caret"]').filter({ hasText: "Olga" }),
          ).toHaveCount(1);
          await expect(left!.locator("[data-collaboration-text]")).toHaveCount(2);
          await expect(right!.locator("[data-collaboration-text]")).toHaveCount(2);
        }
      }
    });
  });
}
