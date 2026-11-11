import { expect, test } from "@playwright/test";
import type { DocumentEditorAPI } from "@chulane/rivto";

for (const container of [false, true]) {
  test(`Backspace removes the first empty ${container ? "container child" : "root"}`, async ({
    page,
  }) => {
    await page.goto("/?test_features=1");
    const ids = await page.evaluate((container) => {
      const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
        .__rivtoDemo.editor;
      const parent = container
        ? editor.blocks.insertBlock({
            type: "bento",
            content: "",
            children: [
              { type: "paragraph", content: "" },
              { type: "paragraph", content: "Next block" },
            ],
          })
        : undefined;
      const first = parent
        ? parent.children[0]!
        : editor.blocks.insertBlock({ type: "paragraph", content: "" });
      const next = parent
        ? parent.children[1]!
        : editor.blocks.insertBlock({ type: "paragraph", content: "Next block" });
      editor.load({
        ...editor.dump(),
        rootElementIds: [],
        blocks: parent ? [parent] : [first, next],
        elements: [],
      });
      return {
        first: container ? parent!.children[0]!.id : first.id,
        next: container ? parent!.children[1]!.id : next.id,
      };
    }, container);
    const first = page.locator(`[data-block-id="${ids.first}"]`);
    const next = page.locator(`[data-block-id="${ids.next}"]`);
    await first.locator("[data-block-content]").first().click();
    await page.keyboard.press("Backspace");
    await expect(first).toHaveCount(0);
    await expect(next.locator("[data-block-content]").first()).toBeFocused();
    await page.keyboard.press("Control+z");
    await expect(first).toBeVisible();
  });
}

test("Backspace removes the first empty block in an edgeless card", async ({ page }) => {
  await page.goto("/?test_features=1");
  const ids = await page.evaluate(() => {
    const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }).__rivtoDemo
      .editor;
    const before = editor.blocks.insertBlock({ type: "paragraph", content: "Other card" });
    const separator = editor.blocks.insertBlock({ type: "separator", content: "" });
    const first = editor.blocks.insertBlock({ type: "paragraph", content: "" });
    const next = editor.blocks.insertBlock({ type: "paragraph", content: "Next block" });
    editor.load({
      ...editor.dump(),
      rootElementIds: [],
      blocks: [before, separator, first, next],
      elements: [],
    });
    editor.elements.insertElement({
      type: "block",
      zIndex: 0,
      frame: { x: 800, y: 20, width: 300, height: 200 },
      props: { startBlockId: before.id, endBlockId: before.id },
    });
    const card = editor.elements.insertElement({
      type: "block",
      zIndex: 0,
      frame: { x: 20, y: 20, width: 600, height: 400 },
      props: { startBlockId: first.id, endBlockId: next.id },
    });
    return { first: first.id, next: next.id, card: card.id };
  });
  await page.locator('[data-editor-mode="edgeless"]').click();
  const first = page.locator(`[data-block-id="${ids.first}"]`);
  const next = page.locator(`[data-block-id="${ids.next}"]`);
  await first.locator("[data-block-content]").first().click();
  await page.keyboard.press("Backspace");
  await expect(first).toHaveCount(0);
  await expect(next.locator("[data-block-content]").first()).toBeFocused();
  expect(
    await page.evaluate((id) => {
      const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
        .__rivtoDemo.editor;
      return editor.elements.getElement(id)?.props;
    }, ids.card),
  ).toMatchObject({ startBlockId: ids.next, endBlockId: ids.next });
  await page.keyboard.press("Control+z");
  await expect(first).toBeVisible();
  expect(
    await page.evaluate((id) => {
      const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
        .__rivtoDemo.editor;
      return editor.elements.getElement(id)?.props;
    }, ids.card),
  ).toMatchObject({ startBlockId: ids.first, endBlockId: ids.next });
});

for (const mode of ["page", "container", "edgeless", "edgeless-container"] as const) {
  test(`Backspace removes the only empty block in ${mode}`, async ({ page }) => {
    await page.goto("/?test_features=1");
    const ids = await page.evaluate((mode) => {
      const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
        .__rivtoDemo.editor;
      const parent = mode.includes("container")
        ? editor.blocks.insertBlock({
            type: "bento",
            content: "",
            children: [{ type: "paragraph", content: "" }],
          })
        : undefined;
      const block = parent
        ? parent.children[0]!
        : editor.blocks.insertBlock({ type: "paragraph", content: "" });
      editor.load({
        ...editor.dump(),
        rootElementIds: [],
        blocks: [parent ?? block],
        elements: [],
      });
      editor.history.clear();
      return { block: block.id, parent: parent?.id };
    }, mode);
    if (mode.startsWith("edgeless")) {
      await page.locator('[data-editor-mode="edgeless"]').click();
    }
    const card =
      mode === "edgeless"
        ? await page.evaluate((id) => {
            const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
              .__rivtoDemo.editor;
            return editor.elements
              .getElementNodes()
              .find((element) => element.type === "block" && element.props.startBlockId === id);
          }, ids.block)
        : undefined;
    if (mode === "edgeless") {
      expect(card).toBeDefined();
    }
    const block = page.locator(`[data-block-id="${ids.block}"]`);
    await block.locator("[data-block-content]").first().click();
    await page.keyboard.press("Backspace");
    await expect(block).toHaveCount(0);
    expect(
      await page.evaluate((id) => {
        const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
          .__rivtoDemo.editor;
        return editor.blocks.getBlock(id);
      }, ids.block),
    ).toBeUndefined();
    if (card) {
      await expect(page.locator(`[data-edgeless-object-id="${card.id}"]`)).toHaveCount(0);
    }
    if (ids.parent) {
      await expect(page.locator(`[data-block-id="${ids.parent}"]`)).toBeVisible();
    }
    await page.keyboard.press("Control+z");
    await expect(block).toBeVisible();
    if (card) {
      expect(
        await page.evaluate((id) => {
          const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
            .__rivtoDemo.editor;
          return editor.elements.getElement(id);
        }, card.id),
      ).toMatchObject({ id: card.id, props: card.props });
    }
    await page.keyboard.press("Control+Shift+z");
    await expect(block).toHaveCount(0);
  });
}

test("Backspace removes a one-block card without changing another card", async ({ page }) => {
  await page.goto("/?test_features=1");
  const ids = await page.evaluate(() => {
    const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }).__rivtoDemo
      .editor;
    const before = editor.blocks.insertBlock({ type: "paragraph", content: "Other card" });
    const separator = editor.blocks.insertBlock({ type: "separator", content: "" });
    const empty = editor.blocks.insertBlock({ type: "paragraph", content: "" });
    editor.load({
      ...editor.dump(),
      rootElementIds: [],
      blocks: [before, separator, empty],
      elements: [],
    });
    return { before: before.id, empty: empty.id };
  });
  await page.locator('[data-editor-mode="edgeless"]').click();
  const empty = page.locator(`[data-block-id="${ids.empty}"]`);
  const other = page.locator(`[data-block-id="${ids.before}"]`);
  await empty.locator("[data-block-content]").click();
  await page.keyboard.press("Backspace");
  await expect(empty).toHaveCount(0);
  await expect(other).toContainText("Other card");
  await page.keyboard.press("Control+z");
  await expect(empty).toBeVisible();
  await expect(other).toContainText("Other card");
});
