import { expect, test, type Locator, type Page } from "@playwright/test";
import { blockIdSelector } from "./dom-markers";

type Snapshot = {
  blocks: Array<{
    id: string;
    collapsed: boolean;
    props: Record<string, unknown>;
    pluginData: Record<string, unknown>;
    children: Snapshot["blocks"];
  }>;
  links: Array<{ id: string }>;
  elements: Array<{ id: string; type: string }>;
};

const multiEditor = (page: Page, side: "left" | "right"): Locator =>
  page.locator(`[data-multi-editor="${side}"]`);

async function snapshot(editor: Locator): Promise<Snapshot> {
  return JSON.parse(await editor.locator("[data-document-state]").textContent() ?? "") as Snapshot;
}

async function drag(source: Locator, target: Locator, edge: "body" | "before" | "after" = "body") {
  const handleBox = await source.locator(".page-drag-handle").boundingBox();
  const targetBox = await target.locator(":scope > .page-block-row").boundingBox();
  if (!handleBox || !targetBox) throw new Error("Expected drag geometry");
  const y = edge === "before"
    ? targetBox.y + 1
    : edge === "after" ? targetBox.y + targetBox.height - 1 : targetBox.y + targetBox.height / 2;
  await source.page().mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await source.page().mouse.down();
  const x = edge === "body" ? targetBox.x + targetBox.width / 2 : targetBox.x + 2;
  await source.page().mouse.move(x, y, { steps: 12 });
  await source.page().mouse.up();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/?editors=2");
});

test("keeps selection, controls, mode, history, and modifier UI editor-local", async ({ page }) => {
  const left = multiEditor(page, "left");
  const right = multiEditor(page, "right");
  const leftParent = left.locator(blockIdSelector("left-parent"));
  const rightTarget = right.locator(blockIdSelector("right-target"));

  await leftParent.locator("[data-block-content]").first().click({ modifiers: ["Control"] });
  await rightTarget.locator("[data-block-content]").first().click({ modifiers: ["Control"] });
  await expect(leftParent).toHaveAttribute("data-block-selected", "true");
  await expect(rightTarget).toHaveAttribute("data-block-selected", "true");

  await leftParent.locator("[data-block-content]").first().click();
  await page.keyboard.down("Control");
  await expect(left.locator(".page-surface")).toHaveAttribute("data-block-selecting", "true");
  await expect(right.locator(".page-surface")).not.toHaveAttribute("data-block-selecting", "true");
  await page.keyboard.up("Control");

  await left.locator(blockIdSelector("left-counter")).locator(".custom-counter-block").click();
  await expect(left.locator(".custom-counter-block")).toHaveText("Count: 8");
  await expect(right.locator(".custom-counter-block")).toHaveText("Count: 20");

  await leftParent.locator(".page-collapse-toggle").click();
  await expect(left.locator(blockIdSelector("left-child"))).toBeVisible();
  await expect(right.locator(blockIdSelector("right-nested"))).toBeVisible();

  const rightRoots = await right.locator(".page-surface > [data-block-id]").count();
  await left.locator(".page-trailing-block").first().click();
  await expect(left.locator(".page-surface > [data-block-id]")).toHaveCount(4);
  await expect(right.locator(".page-surface > [data-block-id]")).toHaveCount(rightRoots);

  await left.getByRole("button", { name: "Edgeless" }).click();
  await expect(left.locator("[data-edgeless-root]").first()).toBeVisible();
  await expect(right.locator(".page-surface")).toBeVisible();
  await left.getByRole("button", { name: "Page" }).click();

  await expect(rightTarget).toHaveAttribute("data-block-selected", "true");
  await right.locator('[data-editor-action="delete"]').click();
  expect((await snapshot(right)).blocks.map(({ id }) => id)).not.toContain("right-target");
  expect((await snapshot(left)).blocks.map(({ id }) => id)).toContain("left-parent");
  await right.locator('[data-editor-action="undo"]').click();
  expect((await snapshot(right)).blocks.map(({ id }) => id)).toContain("right-target");
});

test("moves selected subtrees into the exact cross-document row and keeps histories independent", async ({ page }) => {
  const left = multiEditor(page, "left");
  const right = multiEditor(page, "right");
  await left.locator(blockIdSelector("left-parent")).locator("[data-block-content]").click({ modifiers: ["Control"] });
  await left.locator(blockIdSelector("left-counter")).locator(".custom-counter-block").click({ modifiers: ["Control"] });

  await drag(
    left.locator(blockIdSelector("left-parent")),
    right.locator(blockIdSelector("right-target")),
  );

  await expect(left.locator(blockIdSelector("left-parent"))).toHaveCount(0);
  await expect(right.locator(blockIdSelector("left-parent"))).toHaveAttribute("data-block-selected", "true");
  await expect(right.locator(blockIdSelector("left-counter"))).toHaveAttribute("data-block-selected", "true");
  await expect(right.locator(".page-surface")).toBeFocused();
  const source = await snapshot(left);
  const destination = await snapshot(right);
  expect(source.blocks.map(({ id }) => id)).toEqual(["left-stay"]);
  expect(source.links).toEqual([]);
  expect(destination.blocks[0]?.children.map(({ id }) => id)).toEqual([
    "right-nested",
    "left-parent",
    "left-counter",
  ]);
  expect(destination.blocks[0]?.children[1]).toMatchObject({
    id: "left-parent",
    collapsed: true,
    children: [{ id: "left-child" }],
  });
  expect(destination.links).toEqual([expect.objectContaining({ id: "left-internal-link" })]);

  await right.locator(".page-surface").focus();
  await page.keyboard.press("Control+z");
  await expect(right.locator(blockIdSelector("left-parent"))).toHaveCount(0);
  await expect(left.locator(blockIdSelector("left-parent"))).toHaveCount(0);
  await left.locator(".page-surface").focus();
  await page.keyboard.press("Control+z");
  await expect(left.locator(blockIdSelector("left-parent"))).toHaveCount(1);
});

test("supports a cross-document gap and an empty destination", async ({ page }) => {
  const left = multiEditor(page, "left");
  const right = multiEditor(page, "right");
  await drag(
    left.locator(blockIdSelector("left-counter")),
    right.locator(blockIdSelector("right-counter")),
    "after",
  );
  expect((await snapshot(right)).blocks.map(({ id }) => id)).toEqual([
    "right-target",
    "right-counter",
    "left-counter",
  ]);

  await page.goto("/?editors=2&emptyDestination=1");
  const emptyLeft = multiEditor(page, "left");
  const emptyRight = multiEditor(page, "right");
  const source = emptyLeft.locator(blockIdSelector("left-counter"));
  const sourceBox = await source.locator(".page-drag-handle").boundingBox();
  const targetBox = await emptyRight.locator(".page-surface").boundingBox();
  if (!sourceBox || !targetBox) throw new Error("Expected empty-page drag geometry");
  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + 120, { steps: 12 });
  await expect(emptyRight.locator(".page-surface")).toHaveAttribute("data-drop-empty", "true");
  await page.mouse.up();
  await expect(emptyRight.locator(".page-surface")).not.toHaveAttribute("data-drop-empty", "true");
  expect((await snapshot(emptyRight)).blocks.map(({ id }) => id)).toEqual(["left-counter"]);
});

test("targets nested cross-document rows and keeps ordinary local dragging local", async ({ page }) => {
  const left = multiEditor(page, "left");
  const right = multiEditor(page, "right");
  const rightBefore = await snapshot(right);
  await drag(
    left.locator(blockIdSelector("left-counter")),
    left.locator(blockIdSelector("left-stay")),
  );
  expect(await snapshot(right)).toEqual(rightBefore);
  expect((await snapshot(left)).blocks.find(({ id }) => id === "left-stay")?.children)
    .toEqual([expect.objectContaining({ id: "left-counter" })]);

  await page.goto("/?editors=2");
  const nestedLeft = multiEditor(page, "left");
  const nestedRight = multiEditor(page, "right");
  await drag(
    nestedLeft.locator(blockIdSelector("left-counter")),
    nestedRight.locator(blockIdSelector("right-nested")),
  );
  const target = (await snapshot(nestedRight)).blocks[0]?.children[0];
  expect(target).toMatchObject({
    id: "right-nested",
    children: [expect.objectContaining({ id: "left-counter" })],
  });
});

test("rejects destination block and link ID conflicts without mutating either editor", async ({ page }) => {
  for (const conflict of ["block", "link"] as const) {
    await page.goto(`/?editors=2&conflict=${conflict}`);
    const left = multiEditor(page, "left");
    const right = multiEditor(page, "right");
    const sourceBefore = await snapshot(left);
    const destinationBefore = await snapshot(right);
    await drag(
      left.locator(blockIdSelector("left-parent")),
      right.locator(blockIdSelector("right-target")),
    );
    expect(await snapshot(left)).toEqual(sourceBefore);
    expect(await snapshot(right)).toEqual(destinationBefore);
    await expect(right.locator("[data-drop-inside]")).toHaveCount(0);
  }
});
