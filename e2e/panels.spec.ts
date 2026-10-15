import { expect, test, type Page } from "@playwright/test";
import type { ReactEditor } from "@chulane/rivto-react";
import type { DocumentEditorAPI } from "@chulane/rivto";

type Inspection = { __rivtoDemo: { editor: DocumentEditorAPI; reactEditor: ReactEditor } };

async function seed(page: Page, repeat = 0) {
  await page.goto(`/?repeat=${repeat}`);
  await expect(
    page.locator('[data-journal-document="today"] [data-block-content]').first(),
  ).toBeVisible();
  return page.evaluate(() => {
    const { editor } = (window as unknown as Inspection).__rivtoDemo;
    const first = editor.blocks.getRootIds()[0];
    const root = editor.blocks.insertBlock(
      {
        type: "paragraph",
        content: "Panel section",
        children: [
          { type: "paragraph", content: "Panel child" },
          {
            type: "paragraph",
            content: "Panel branch",
            children: [{ type: "paragraph", content: "Panel detail" }],
          },
        ],
      },
      editor.blocks.getInsertionDestinationAfter(first),
    );
    return {
      root: root.id,
      child: root.children[0]!.id,
      branch: root.children[1]!.id,
      detail: root.children[1]!.children[0]!.id,
    };
  });
}

/**
 * Opens a block through its handle in today's journal.
 *
 * @param page - Demo page containing the seeded journal.
 * @param id - Persisted block ID to open as a panel root.
 * @returns Resolves once the matching panel root is visible.
 * @throws If the block cannot be clicked or the expected panel does not appear.
 */
async function open(page: Page, id: string) {
  const block = page.locator(`[data-journal-document="today"] [data-block-id="${id}"]`).first();
  await block.locator(":scope > .page-block-row").hover();
  await block.locator(":scope > .page-block-row").locator(".block-handle").click();
  await expect(page.locator(`[data-panel-root="${id}"]`)).toBeVisible();
}

for (const repeat of [0, 200]) {
  test(`opens a subtree and returns through breadcrumbs, repeat=${repeat}`, async ({ page }) => {
    test.setTimeout(120_000);
    const ids = await seed(page, repeat);
    await open(page, ids.root);
    const today = page.locator('[data-journal-document="today"]');
    await expect(today.getByRole("heading", { name: "Panel section" })).toBeVisible();
    await expect(today.locator(`.page-surface > [data-block-id="${ids.root}"]`)).toHaveCount(0);
    await expect(today.locator(`.page-surface > [data-block-id="${ids.child}"]`)).toHaveCount(1);
    const child = today.locator(`[data-block-id="${ids.child}"] [data-block-content]`).first();
    await child.fill("Shared child edited");
    await child.press("Home");
    await child.press("Shift+Tab");
    expect(
      await page.evaluate(
        (id) => (window as unknown as Inspection).__rivtoDemo.editor.blocks.getParentId(id),
        ids.child,
      ),
    ).toBe(ids.root);
    await open(page, ids.branch);
    await expect(today.getByRole("heading", { name: "Panel branch" })).toBeVisible();
    const breadcrumbs = today.getByRole("navigation", { name: "Panel breadcrumbs" });
    await expect(breadcrumbs.getByRole("list")).toBeVisible();
    await expect(
      breadcrumbs.getByRole("link", { name: "Panel branch", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await expect(
      breadcrumbs.getByRole("button", { name: "Panel branch", exact: true }),
    ).toHaveCount(0);
    await breadcrumbs.getByRole("button", { name: "Panel section", exact: true }).press("Enter");
    await expect(child).toHaveText("Shared child edited");
    const canvas = await today.locator("[data-panel-root]").getAttribute("data-panel-element-root");
    await today
      .getByRole("navigation")
      .getByRole("button", { name: "Document", exact: true })
      .click();
    await open(page, ids.root);
    await expect(today.locator("[data-panel-root]")).toHaveAttribute(
      "data-panel-element-root",
      canvas!,
    );
  });
}

test("creates and reuses a separate element group for an empty Panel", async ({ page }) => {
  const ids = await seed(page);
  await open(page, ids.child);
  const today = page.locator('[data-journal-document="today"]');
  await today.getByRole("button", { name: "Add block", exact: true }).click();
  const childId = await page.evaluate(
    (id) =>
      (window as unknown as Inspection).__rivtoDemo.editor.blocks.getBlockNode(id)!.childIds[0]!,
    ids.child,
  );
  await expect(today.locator(`[data-block-id="${childId}"]`)).toHaveCount(1);
  await today.getByRole("button", { name: "Edgeless", exact: true }).click();
  await expect(today.locator("[data-edgeless-root]")).toHaveCount(1);
  const elementRoot = await today
    .locator("[data-panel-root]")
    .getAttribute("data-panel-element-root");
  expect(elementRoot).toBeTruthy();
  const container = await page.evaluate(
    (id) => (window as unknown as Inspection).__rivtoDemo.reactEditor.elements.getElementNode(id!),
    elementRoot,
  );
  expect(container?.type).toBe("group");
  expect(container?.childIds).toHaveLength(1);
  const original = await page.evaluate((elementRoot) => {
    const { reactEditor } = (window as unknown as Inspection).__rivtoDemo;
    const elements = reactEditor.elements;
    const card = elements
      .getChildIds(elementRoot!)
      .map((id) => elements.getElementNode(id)!)
      .find((element) => element.type === "block")!;
    const other = elements.getElementNodes().filter((element) => element.id !== card.id);
    elements.updateElement(card.id, { frame: { x: 444 } });
    return { other, cardId: card.id, parentId: elements.getParentId(card.id) };
  }, elementRoot);
  expect(original.parentId).toBe(elementRoot);
  expect(
    await page.evaluate(
      (cardId) =>
        (window as unknown as Inspection).__rivtoDemo.reactEditor.elements
          .getElementNodes()
          .filter((element) => element.id !== cardId),
      original.cardId,
    ),
  ).toEqual(original.other);
  await today
    .getByRole("navigation")
    .getByRole("button", { name: "Document", exact: true })
    .click();
  await expect(today.locator(".page-surface").first()).toBeVisible();
  await open(page, ids.child);
  await expect(today.locator("[data-edgeless-root]")).toHaveCount(1);
  await expect(today.locator("[data-panel-root]")).toHaveAttribute(
    "data-panel-element-root",
    elementRoot!,
  );
  expect(
    await page.evaluate(
      (id) =>
        (window as unknown as Inspection).__rivtoDemo.reactEditor.elements.getElementNode(id)!.frame
          .x,
      original.cardId,
    ),
  ).toBe(444);
});

test("clicking the universal handle navigates", async ({ page }) => {
  const ids = await seed(page);
  const row = page
    .locator(`[data-journal-document="today"] [data-block-id="${ids.root}"] > .page-block-row`)
    .first();
  await row.hover();
  await row.locator(".block-handle").click();
  await expect(page.locator('[data-journal-document="today"] [data-panel-root]')).toHaveAttribute(
    "data-panel-root",
    ids.root,
  );
});

test("does not open a Panel after dragging or cancelling a drag", async ({ page }) => {
  const ids = await seed(page);
  const handle = page
    .locator(`[data-journal-document="today"] [data-block-id="${ids.root}"]`)
    .first()
    .locator(":scope > .page-block-row .block-handle");
  await page
    .locator(`[data-journal-document="today"] [data-block-id="${ids.root}"] > .page-block-row`)
    .first()
    .hover();
  await handle.hover();
  const rect = await handle.boundingBox();
  await page.mouse.move(rect!.x + rect!.width / 2, rect!.y + rect!.height / 2);
  await page.mouse.down();
  await page.mouse.move(rect!.x + 40, rect!.y + 55, { steps: 10 });
  await expect(page.locator(".page-drag-overlay")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(page.locator('[data-journal-document="today"] [data-panel-root]')).toHaveAttribute(
    "data-panel-root",
    "",
  );
});

test("pastes a group and connector into a Panel inside its own element group without changing source elements", async ({
  page,
}) => {
  const ids = await seed(page);
  const bundle = await page.evaluate(() => {
    const { reactEditor } = (window as unknown as Inspection).__rivtoDemo;
    const input = {
      childIds: [],
      type: "rectangle",
      frame: { x: 10, y: 10, width: 100, height: 60 },
      zIndex: 2,
    };
    return reactEditor.history.batchUpdates(() => {
      const a = reactEditor.elements.insertElement(input);
      const b = reactEditor.elements.insertElement({ ...input, frame: { ...input.frame, x: 200 } });
      const connector = reactEditor.elements.insertElement({
        ...input,
        type: "connector",
        frame: { x: 110, y: 40, width: 90, height: 1 },
        props: {
          source: { elementId: a.id, anchor: { x: 1, y: 0.5 }, position: { x: 110, y: 40 } },
          target: { elementId: b.id, anchor: { x: 0, y: 0.5 }, position: { x: 200, y: 40 } },
          route: "straight",
        },
      });
      const group = reactEditor.elements.insertElement({
        ...input,
        type: "group",
        childIds: [a.id, b.id, connector.id],
        props: {},
      });
      return {
        version: 4,
        blocks: [],
        elements: [a, b, connector, group].map(({ id }) =>
          reactEditor.elements.getElementNode(id)!,
        ),
        selectedElementIds: [group.id],
      };
    });
  });
  await open(page, ids.child);
  const today = page.locator('[data-journal-document="today"]');
  await today.getByRole("button", { name: "Edgeless", exact: true }).click();
  const root = today.locator('[data-rivto-surface="edgeless"]');
  await root.focus();
  const beforeIds = await page.evaluate(() =>
    (window as unknown as Inspection).__rivtoDemo.reactEditor.elements
      .getElementNodes()
      .map(({ id }) => id),
  );
  await root.evaluate((element, bundle) => {
    const transfer = new DataTransfer();
    transfer.setData("application/x-rivto+json", JSON.stringify(bundle));
    const event = new ClipboardEvent("paste", { bubbles: true, cancelable: true });
    // Firefox does not retain clipboardData passed to a synthetic event constructor.
    Object.defineProperty(event, "clipboardData", { value: transfer });
    element.dispatchEvent(event);
  }, bundle);
  const sourceIds = bundle.elements.map((element) => element.id);
  await expect
    .poll(() =>
      page.evaluate(
        (sourceIds) =>
          (window as unknown as Inspection).__rivtoDemo.reactEditor.elements
            .getElementNodes()
            .filter((element) => element.type !== "block" && !sourceIds.includes(element.id))
            .length,
        beforeIds,
      ),
    )
    .toBe(4);
  const elements = await page.evaluate(
    (sourceIds) =>
      (window as unknown as Inspection).__rivtoDemo.reactEditor.elements
        .getElementNodes()
        .filter((element) => element.type !== "block" && !sourceIds.includes(element.id)),
    beforeIds,
  );
  const group = elements.find((element) => element.type === "group")!;
  expect(group.childIds).toHaveLength(3);
  expect(
    await page.evaluate(
      (sourceIds) =>
        sourceIds.map((id) =>
          (window as unknown as Inspection).__rivtoDemo.reactEditor.elements.getElementNode(id),
        ),
      sourceIds,
    ),
  ).toEqual(bundle.elements);
});

test("opens a Panel from the application button with the keyboard", async ({ page }) => {
  const ids = await seed(page);
  const handle = page
    .locator(
      `[data-journal-document="today"] [data-block-id="${ids.root}"] > .page-block-row .block-handle`,
    )
    .first();
  await handle.focus();
  await handle.press("Enter");
  await expect(page.locator(`[data-panel-root="${ids.root}"]`)).toBeVisible();
});

test("Enter creates siblings inside the Panel and extends its edgeless card", async ({ page }) => {
  const ids = await seed(page);
  await page.evaluate(
    (id) => (window as unknown as Inspection).__rivtoDemo.editor.blocks.removeBlock(id),
    ids.branch,
  );
  await open(page, ids.root);
  const today = page.locator('[data-journal-document="today"]');
  await today.getByRole("button", { name: "Edgeless", exact: true }).click();
  const child = today.locator(`[data-block-id="${ids.child}"] [data-block-content]`).first();
  await child.click();
  await child.press("End");
  await child.press("Enter");
  const sibling = await page.evaluate((ids) => {
    const editor = (window as unknown as Inspection).__rivtoDemo.editor;
    return editor.blocks.getBlockNode(ids.root)!.childIds[1]!;
  }, ids);
  const newContent = today.locator(`[data-block-id="${sibling}"] [data-block-content]`).first();
  await expect(newContent).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate((childId) => {
        return (window as unknown as Inspection).__rivtoDemo.reactEditor.elements
          .getElementNodes()
          .find((element) => element.props.startBlockId === childId)?.props.endBlockId;
      }, ids.child),
    )
    .toBe(sibling);
  await newContent.press("Enter");
  await expect
    .poll(() =>
      page.evaluate(
        (id) =>
          (window as unknown as Inspection).__rivtoDemo.editor.blocks.getBlockNode(id)!.childIds
            .length,
        ids.root,
      ),
    )
    .toBe(3);
});

test("drags a Panel element without selecting its excluded root group", async ({ page }) => {
  const ids = await seed(page);
  await open(page, ids.child);
  const today = page.locator('[data-journal-document="today"]');
  const rootId = await today.locator("[data-panel-root]").getAttribute("data-panel-element-root");
  await page.evaluate((rootId) => {
    const elements = (window as unknown as Inspection).__rivtoDemo.reactEditor.elements;
    elements.insertElement({
      id: "outside-panel",
      type: "rectangle",
      frame: { x: 300, y: 100, width: 120, height: 80 },
      zIndex: 1000,
    });
    elements.insertElement(
      {
        id: "inside-panel",
        type: "rectangle",
        frame: { x: 100, y: 100, width: 120, height: 80 },
        zIndex: 1000,
      },
      { parentId: rootId! },
    );
  }, rootId);
  await today.getByRole("button", { name: "Edgeless", exact: true }).click();
  await expect(today.locator('[data-edgeless-object-id="outside-panel"]')).toHaveCount(0);
  const shape = today.locator('[data-edgeless-object-id="inside-panel"]');
  const box = await shape.boundingBox();
  if (!box) {
    throw new Error("Panel shape is missing");
  }
  await page.keyboard.down("Alt");
  await page.mouse.move(box.x + 10, box.y + 10);
  await page.mouse.down();
  await page.mouse.move(box.x + 70, box.y + 40, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.up("Alt");
  const result = await page.evaluate(() => {
    const { editor } = (window as unknown as Inspection).__rivtoDemo;
    return {
      frame: editor.elements.getElementNode("inside-panel")!.frame,
      selection: editor.selection.get()?.elements,
    };
  });
  expect(result.selection).toEqual(["inside-panel"]);
  expect(result.frame).toMatchObject({ x: 160, y: 130, width: 120, height: 80 });
});

for (const repeat of [0, 200]) {
  test(`drags a card from a block row inside a nested Panel, repeat=${repeat}`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const ids = await seed(page, repeat);
    await open(page, ids.root);
    const today = page.locator('[data-journal-document="today"]');
    await today.getByRole("button", { name: "Edgeless", exact: true }).click();
    const block = today.locator(`[data-block-id="${ids.child}"]`).first();
    const card = block.locator("xpath=ancestor::*[@data-edgeless-root]");
    const cardId = await card.getAttribute("data-edgeless-root");
    const before = await page.evaluate(
      (id) =>
        (window as unknown as Inspection).__rivtoDemo.editor.elements.getElementNode(id!)!.frame,
      cardId,
    );
    const row = block.locator(":scope > .page-block-row");
    const box = await row.boundingBox();
    const chromeBox = await card.locator(":scope > .edgeless-card-content").boundingBox();
    if (!box || !chromeBox) {
      throw new Error("Panel block row is missing");
    }
    // The left hover strip belongs to the row; Markdown's editor covers its right edge.
    const x = chromeBox.x + 2;
    const y = box.y + box.height / 2;
    expect(
      await row.evaluate((element, { x, y }) => document.elementFromPoint(x, y) === element, {
        x,
        y,
      }),
    ).toBe(true);
    await page.keyboard.down("Alt");
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 60, y + 30, { steps: 6 });
    await page.mouse.up();
    await page.keyboard.up("Alt");
    const after = await page.evaluate(
      (id) =>
        (window as unknown as Inspection).__rivtoDemo.editor.elements.getElementNode(id!)!.frame,
      cardId,
    );
    expect(after.x).toBeCloseTo(before.x + 60, 1);
    expect(after.y).toBeCloseTo(before.y + 30, 1);
  });
}
