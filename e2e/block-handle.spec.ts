import { expect, test, type Page } from "@playwright/test";
import type { ReactEditorApi } from "@chulane/rivto-react";
import type { DocumentEditorAPI } from "@chulane/rivto";

type Demo = { __rivtoDemo: { editor: DocumentEditorAPI; reactEditor: ReactEditorApi } };

/** Seeds nested blocks without including setup in interaction measurements. */
async function seed(page: Page, repeat = 0) {
  await page.goto(`/?repeat=${repeat}`);
  await page.locator('[data-journal-document="today"] [data-block-content]').first().waitFor();
  return page.evaluate(() => {
    const { editor } = (window as unknown as Demo).__rivtoDemo;
    const first = editor.blocks.getRootIds()[0]!;
    const parent = editor.blocks.insertBlock(
      {
        type: "paragraph",
        content: "Handle parent",
        children: [
          {
            type: "paragraph",
            content: "Handle child",
            children: [{ type: "paragraph", content: "Handle leaf" }],
          },
        ],
      },
      editor.blocks.getInsertionDestinationAfter(first),
    );
    const other = editor.blocks.insertBlock(
      { type: "paragraph", content: "Handle other" },
      editor.blocks.getInsertionDestinationAfter(parent.id),
    );
    return { parent: parent.id, child: parent.children[0]!.id, other: other.id };
  });
}

/** Opens a row's own menu without accidentally selecting a nested handle. */
async function menu(page: Page, id: string) {
  const row = page
    .locator(`[data-journal-document="today"] [data-block-id="${id}"] > .page-block-row`)
    .first();
  await row.hover();
  await row.locator(":scope > .rivto-slot > .block-handle").click({ button: "right" });
  await expect(page.getByRole("menu").first()).toBeVisible();
}

test("menu colors selected subtrees, retains child colors, and supports keyboard opening", async ({
  page,
}) => {
  const ids = await seed(page);
  await page.evaluate(({ parent, child, other }) => {
    const { editor } = (window as unknown as Demo).__rivtoDemo;
    editor.blocks.updateBlock(child, { listProps: { backgroundColor: "red" } });
    editor.selection.set({
      type: "selection",
      blocks: [parent, other].map((id) => ({ id, start: 0, end: -1 })),
      anchorBlockId: parent,
      focusBlockId: other,
    });
  }, ids);
  await menu(page, ids.parent);
  await expect(page.getByRole("group", { name: "Block background" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Background", exact: true })).toHaveCount(0);
  await expect(page.getByRole("menu").getByRole("separator")).toHaveCount(4);
  await page.getByRole("menuitem", { name: "blue", exact: true }).click();
  for (const id of [ids.parent, ids.other]) {
    await expect(page.locator(`[data-block-id="${id}"]`).first()).toHaveCSS("border-radius", "8px");
    await expect(page.locator(`[data-block-id="${id}"]`).first()).toHaveAttribute(
      "data-block-background",
      "blue",
    );
  }
  await expect(page.locator(`[data-block-id="${ids.child}"]`).first()).toHaveAttribute(
    "data-block-background",
    "red",
  );
  const handle = page
    .locator(`[data-block-id="${ids.parent}"] > .page-block-row .block-handle`)
    .first();
  await handle.focus();
  await page.keyboard.press("Shift+F10");
  await expect(page.getByRole("menu").first()).toBeVisible();
  const defaultColor = page.getByRole("menuitem", { name: "Default", exact: true });
  await defaultColor.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(`[data-block-id="${ids.parent}"]`).first()).not.toHaveAttribute(
    "data-block-background",
    "blue",
  );
  await handle.focus();
  await page.keyboard.press("Shift+F10");
  await page.keyboard.press("Escape");
  await expect(handle).toBeFocused();
});

test("recursive collapse keeps a visible halo and expand restores hidden descendants", async ({
  page,
}) => {
  const ids = await seed(page);
  await menu(page, ids.parent);
  await page.getByRole("menuitem", { name: "Collapse subtree", exact: true }).click();
  const handle = page
    .locator(`[data-block-id="${ids.parent}"] > .page-block-row .block-handle`)
    .first();
  await page.mouse.move(5, 5);
  await expect(handle).toHaveCSS("opacity", "1");
  await expect(handle).toHaveAttribute("data-collapsed", "true");
  await menu(page, ids.parent);
  await page.getByRole("menuitem", { name: "Expand whole subtree", exact: true }).click();
  await expect(
    page.locator(`[data-block-id="${ids.child}"] [data-block-content]`).last(),
  ).toBeVisible();
});

test("copy embedding pastes a reference without copying or modifying its source", async ({
  page,
  browserName,
  context,
}) => {
  if (browserName === "chromium") {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  }
  const ids = await seed(page);
  await menu(page, ids.parent);
  await page.getByRole("menuitem", { name: "Copy block embedding", exact: true }).click();
  const destination = page.locator(`[data-block-id="${ids.other}"] [data-block-content]`).first();
  await destination.click();
  await page.keyboard.press("End");
  await page.keyboard.press("ControlOrMeta+v");
  await expect
    .poll(() =>
      page.evaluate((id) => {
        const { editor } = (window as unknown as Demo).__rivtoDemo;
        return editor.blocks
          .getBlocks()
          .some((block) => block.type === "embedding" && block.props.targetBlockId === id);
      }, ids.parent),
    )
    .toBe(true);
  await expect(page.locator(`[data-block-id="${ids.parent}"]`).first()).toBeVisible();
});

for (const repeat of [0, 200]) {
  test(`menu opening and recursive action stay local, repeat=${repeat}`, async ({ page }) => {
    test.setTimeout(120_000);
    const ids = await seed(page, repeat);
    await page.evaluate(() => {
      const runtime = window as unknown as Demo & { forestReads: number };
      runtime.forestReads = 0;
      const blocks = runtime.__rivtoDemo.reactEditor.blocks;
      const original = blocks.getBlocks.bind(blocks);
      blocks.getBlocks = () => {
        runtime.forestReads++;
        return original();
      };
    });
    await menu(page, ids.parent);
    await expect(
      page.getByRole("menuitem", { name: "Expand whole subtree", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(() => (window as unknown as { forestReads: number }).forestReads),
    ).toBe(0);
    await page.getByRole("menuitem", { name: "Collapse subtree", exact: true }).click();
    await expect(
      page.locator(`[data-block-id="${ids.parent}"] > .page-block-row .block-handle`).first(),
    ).toHaveAttribute("data-collapsed", "true");
  });
}

test("Space starts a keyboard drag and Escape cancels without opening the block", async ({
  page,
}) => {
  const ids = await seed(page);
  const handle = page
    .locator(`[data-block-id="${ids.parent}"] > .page-block-row .block-handle`)
    .first();
  await handle.focus();
  await expect(handle).toHaveAttribute("aria-roledescription", "draggable");
  await page.keyboard.press("Space");
  await expect(page.locator(`[data-block-id="${ids.parent}"]`).first()).toHaveAttribute(
    "data-dragging",
    "true",
  );
  await page.keyboard.press("Escape");
  await expect(page.locator(`[data-block-id="${ids.parent}"]`).first()).not.toHaveAttribute(
    "data-dragging",
  );
  await expect(page.locator('[data-journal-document="today"] [data-panel-root]')).toHaveAttribute(
    "data-panel-root",
    "",
  );
});

test("multi-block list changes and Cut preserve undo", async ({ page, context, browserName }) => {
  if (browserName === "chromium") {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  }
  const ids = await seed(page);
  await page.evaluate(({ parent, other }) => {
    const { editor } = (window as unknown as Demo).__rivtoDemo;
    editor.selection.set({
      type: "selection",
      blocks: [parent, other].map((id) => ({ id, start: 0, end: -1 })),
      anchorBlockId: parent,
      focusBlockId: other,
    });
  }, ids);
  await menu(page, ids.parent);
  await page.getByRole("menuitem", { name: "List style", exact: true }).hover();
  await page.getByRole("menuitemcheckbox", { name: "Checkboxes", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(({ parent, other }) => {
        const { editor } = (window as unknown as Demo).__rivtoDemo;
        return [parent, other].map((id) => editor.blocks.getBlockNode(id)?.listProps.type);
      }, ids),
    )
    .toEqual(["checkbox", "checkbox"]);
  await menu(page, ids.parent);
  await page.getByRole("menuitem", { name: "Cut", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate((ids) => {
        const { editor } = (window as unknown as Demo).__rivtoDemo;
        return [ids.parent, ids.other, ids.child].some((id) => editor.blocks.hasBlock(id));
      }, ids),
    )
    .toBe(false);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.locator(`[data-block-id="${ids.parent}"]`).first()).toBeVisible();
  await expect(page.locator(`[data-block-id="${ids.other}"]`).first()).toBeVisible();
});

test("the same context actions work inside an edgeless card", async ({ page }) => {
  const ids = await seed(page);
  await page.getByRole("button", { name: "Edgeless", exact: true }).first().click();
  await expect(page.locator(".edgeless-card").first()).toBeVisible();
  await menu(page, ids.parent);
  await page.getByRole("menuitem", { name: "Collapse subtree", exact: true }).click();
  await expect(
    page.locator(`[data-block-id="${ids.parent}"] > .page-block-row .block-handle`).first(),
  ).toHaveAttribute("data-collapsed", "true");
});

for (const [repeat, edgeless] of [
  [0, false],
  [200, false],
  [0, true],
] as const) {
  test(`editing text keeps only its own handle accented and visible, repeat=${repeat}, edgeless=${edgeless}`, async ({
    page,
  }) => {
    const ids = await seed(page, repeat);
    if (edgeless) {
      await page.getByRole("button", { name: "Edgeless", exact: true }).first().click();
    }
    const child = page.locator(`[data-block-id="${ids.child}"] > .page-block-row`).first();
    const handle = child.locator(".block-handle");
    const parentHandle = page
      .locator(`[data-block-id="${ids.parent}"] > .page-block-row .block-handle`)
      .first();
    await child.locator("[data-block-content]").first().click();
    await page.mouse.move(5, 5);
    await expect(handle).toHaveCSS("opacity", "1");
    await expect(handle.locator(".block-handle-grip")).toHaveCSS("color", "rgb(108, 92, 231)");
    const icon = handle.locator(".block-handle-icon");
    await expect(icon).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(icon).not.toHaveCSS("box-shadow", "none");
    await expect(parentHandle.locator(".block-handle-icon")).toHaveCSS(
      "background-color",
      "rgba(0, 0, 0, 0)",
    );
    await expect(parentHandle).toHaveCSS("opacity", "0");
    await handle.focus();
    await expect(handle).toHaveCSS("color", "rgb(107, 100, 120)");
    await expect(icon).toHaveCSS("box-shadow", "none");
    await page.locator(`[data-block-id="${ids.other}"] [data-block-content]`).first().click();
    await page.mouse.move(5, 5);
    await expect(handle).toHaveCSS("opacity", "0");
  });
}
