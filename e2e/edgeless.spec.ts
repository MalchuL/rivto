import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  blockIdSelector,
  blockTypeSelector,
  BLOCK_ID_ATTRIBUTE,
  BLOCK_ID_SELECTOR,
} from "./dom-markers";

const switchMode = async (page: Page, mode: "block" | "edgeless") => {
  await page.locator(`[data-editor-mode="${mode}"]`).click();
};

const cardChrome = (card: Locator) => card.locator(":scope > .edgeless-card-header");

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("loads the visual-object plugin in the demo", async ({ page }) => {
  await switchMode(page, "edgeless");
  const toolbar = page.getByRole("toolbar", { name: "Visual objects" });
  await expect(toolbar).toBeVisible();
  await toolbar.getByRole("button", { name: "Rectangle" }).click();
  await expect(page.locator('[data-edgeless-visual-kind="rectangle"]')).toHaveCount(1);
});

test("uses one Ctrl selection across block and visual canvas objects", async ({ page }) => {
  await switchMode(page, "edgeless");
  await page.getByRole("toolbar", { name: "Visual objects" }).getByRole("button", { name: "Rectangle" }).click();
  const visual = page.locator('[data-edgeless-object-kind="visual"]');
  const card = page.locator("[data-edgeless-root]").first();
  await expect(visual).toHaveAttribute("data-selected", "true");

  await cardChrome(card).click({ modifiers: ["Control"], position: { x: 280, y: 14 } });
  await expect(visual).toHaveAttribute("data-selected", "true");
  await expect(card).toHaveAttribute("data-block-selected", "true");
  await visual.click({ modifiers: ["Control"] });
  await expect(visual).not.toHaveAttribute("data-selected", "true");
  await expect(card).toHaveAttribute("data-block-selected", "true");
});

test("renders every root as one card with its complete nested outline", async ({ page }) => {
  const pageRoots = page.locator(`.page-surface > ${BLOCK_ID_SELECTOR}`);
  const rootCount = await pageRoots.count();
  const parent = page.locator(".page-block:has(> .page-block-children)").first();
  const parentId = await parent.getAttribute(BLOCK_ID_ATTRIBUTE);
  const childId = await parent.locator(`:scope > .page-block-children ${BLOCK_ID_SELECTOR}`).first().getAttribute(BLOCK_ID_ATTRIBUTE);
  if (!parentId || !childId) throw new Error("Expected nested page IDs");
  await parent.locator(":scope > .page-block-row [data-collapse-toggle]").click();

  await switchMode(page, "edgeless");
  await expect(page.locator("[data-edgeless-root]")).toHaveCount(rootCount);
  const card = page.locator(`[data-edgeless-root="${parentId}"]`);
  await expect(card.locator(blockIdSelector(childId))).toHaveCount(1);
  await expect(card.locator("[data-collapse-toggle]")).toHaveCount(0);
  await expect.poll(() => card.locator(".edgeless-card-body").evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);

  await switchMode(page, "block");
  await expect(page.locator(`${blockIdSelector(parentId)} > .page-block-children`)).toHaveCount(0);
});

test("selects nested blocks and preserves block selection across surfaces", async ({ page }) => {
  const parent = page.locator(".page-block:has(> .page-block-children)").first();
  const child = parent.locator(`:scope > .page-block-children ${BLOCK_ID_SELECTOR}`).first();
  const parentId = await parent.getAttribute(BLOCK_ID_ATTRIBUTE);
  const childId = await child.getAttribute(BLOCK_ID_ATTRIBUTE);
  if (!parentId || !childId) throw new Error("Expected nested page IDs");

  await child.locator(":scope > .page-block-row [data-block-content]").click({ modifiers: ["Control"] });
  await expect(child).toHaveAttribute("data-block-selected", "true");

  await switchMode(page, "edgeless");
  const card = page.locator(`[data-edgeless-root="${parentId}"]`);
  const canvasChild = card.locator(blockIdSelector(childId));
  await expect(canvasChild).toHaveAttribute("data-block-selected", "true");
  await expect(card).not.toHaveAttribute("data-block-selected", "true");

  await cardChrome(card).click({ position: { x: 280, y: 14 } });
  await expect(card).toHaveAttribute("data-block-selected", "true");
  // Selecting the card shell does not overwrite the independent core block
  // selection retained inside its content.
  await expect(canvasChild).toHaveAttribute("data-block-selected", "true");

  await switchMode(page, "block");
  await expect(page.locator(blockIdSelector(childId))).toHaveAttribute("data-block-selected", "true");
});

test("undoes a grouped nested-block drag after switching from edgeless", async ({ page }) => {
  await switchMode(page, "edgeless");
  const card = page.locator("[data-edgeless-root]").filter({ has: page.locator(".page-block-children") }).first();
  const parentId = await card.getAttribute("data-edgeless-root");
  const children = card.locator(":scope > .edgeless-card-body > .page-block > .page-block-children > .page-block");
  const firstId = await children.nth(0).getAttribute(BLOCK_ID_ATTRIBUTE);
  const secondId = await children.nth(1).getAttribute(BLOCK_ID_ATTRIBUTE);
  if (!parentId || !firstId || !secondId) throw new Error("Expected nested sibling blocks");

  await children.nth(0).locator(":scope > .page-block-row [data-block-content]").click({ modifiers: ["Control"] });
  await children.nth(1).locator(":scope > .page-block-row [data-block-content]").click({ modifiers: ["Control"] });
  await switchMode(page, "block");

  const roots = page.locator(`.page-surface > ${BLOCK_ID_SELECTOR}`);
  let targetId: string | null = null;
  for (let index = 0; index < await roots.count(); index += 1) {
    const id = await roots.nth(index).getAttribute(BLOCK_ID_ATTRIBUTE);
    if (id && id !== parentId) {
      targetId = id;
      break;
    }
  }
  if (!targetId) throw new Error("Expected a target root");

  const source = page.locator(blockIdSelector(firstId));
  const target = page.locator(blockIdSelector(targetId));
  await source.locator(":scope > .page-block-row").hover();
  const handleBox = await source.locator(":scope > .page-block-row .page-drag-handle").boundingBox();
  if (!handleBox) throw new Error("Expected drag geometry");
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleBox.x + handleBox.width / 2 + 8, handleBox.y + handleBox.height / 2);
  await expect(page.locator(".page-drag-overlay")).toBeVisible();
  const targetBox = await target.locator(":scope > .page-block-row").boundingBox();
  if (!targetBox) throw new Error("Expected target drag geometry");
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 8 });
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  await page.mouse.move(targetBox.x + targetBox.width / 2 + 1, targetBox.y + targetBox.height / 2);
  await expect(target.locator(":scope > .page-block-row")).toHaveAttribute("data-drop-inside", "true");
  await page.mouse.up();

  await expect(target.locator(`:scope > .page-block-children > ${blockIdSelector(firstId)}`)).toHaveCount(1);
  await expect(target.locator(`:scope > .page-block-children > ${blockIdSelector(secondId)}`)).toHaveCount(1);

  await page.keyboard.press("Control+z");
  const originalParent = page.locator(blockIdSelector(parentId));
  await expect(originalParent.locator(`:scope > .page-block-children > ${blockIdSelector(firstId)}`)).toHaveCount(1);
  await expect(originalParent.locator(`:scope > .page-block-children > ${blockIdSelector(secondId)}`)).toHaveCount(1);
});

test("reuses Tab and Shift+Tab inside a canvas card", async ({ page }) => {
  await switchMode(page, "edgeless");
  const card = page.locator("[data-edgeless-root]").filter({ has: page.locator(".page-block-children") }).first();
  const rootBlock = card.locator(":scope > .edgeless-card-body > .page-block");
  const directChildren = rootBlock.locator(":scope > .page-block-children > .page-block");
  const firstId = await directChildren.first().getAttribute(BLOCK_ID_ATTRIBUTE);
  const second = directChildren.nth(1);
  const secondId = await second.getAttribute(BLOCK_ID_ATTRIBUTE);
  if (!firstId || !secondId) throw new Error("Expected sibling blocks");

  await second.locator(":scope > .page-block-row [data-block-content]").click();
  await page.keyboard.press("Home");
  await page.keyboard.press("Tab");
  const first = rootBlock.locator(`.page-block${blockIdSelector(firstId!)}`);
  await expect(first.locator(`:scope > .page-block-children > ${blockIdSelector(secondId!)}`)).toHaveCount(1);

  await first.locator(`${blockIdSelector(secondId!)} > .page-block-row [data-block-content]`).click();
  await page.keyboard.press("Shift+Tab");
  await expect(rootBlock.locator(`:scope > .page-block-children > ${blockIdSelector(secondId!)}`)).toHaveCount(1);
});

test("reuses page Enter and structural drag inside a canvas card", async ({ page }) => {
  await switchMode(page, "edgeless");
  const card = page.locator("[data-edgeless-root]").filter({ has: page.locator(".page-block-children") }).first();
  const rootBlock = card.locator(":scope > .edgeless-card-body > .page-block");
  const directChildren = rootBlock.locator(":scope > .page-block-children > .page-block");
  const before = await directChildren.count();
  const allBlocks = page.locator(BLOCK_ID_SELECTOR);
  const totalBefore = await allBlocks.count();

  await rootBlock.locator(":scope > .page-block-row [data-block-content]").click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await expect(allBlocks).toHaveCount(totalBefore + 1);
  await expect(directChildren).toHaveCount(before + 1);

  const source = directChildren.first();
  const target = directChildren.nth(1);
  const sourceId = await source.getAttribute(BLOCK_ID_ATTRIBUTE);
  const targetId = await target.getAttribute(BLOCK_ID_ATTRIBUTE);
  const handleBox = await source.locator(":scope > .page-block-row .page-drag-handle").boundingBox();
  const targetBox = await target.locator(":scope > .page-block-row").boundingBox();
  if (!sourceId || !targetId || !handleBox || !targetBox) throw new Error("Expected nested drag geometry");
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 8 });
  await page.mouse.up();
  const movedTarget = rootBlock.locator(`.page-block${blockIdSelector(targetId!)}`);
  await expect(movedTarget.locator(`:scope > .page-block-children > ${blockIdSelector(sourceId!)}`)).toHaveCount(1);
});

test("keeps an indented block drag handle visible while moving onto it", async ({ page }) => {
  await switchMode(page, "edgeless");
  const card = page.locator("[data-edgeless-root]").filter({ has: page.locator(".page-block-children") }).first();
  const nested = card.locator(":scope > .edgeless-card-body > .page-block > .page-block-children > .page-block").first();
  const row = nested.locator(":scope > .page-block-row");
  const handle = row.locator(":scope > .page-drag-handle");

  const box = await handle.boundingBox();
  const bodyBox = await card.locator(":scope > .edgeless-card-body").boundingBox();
  if (!box || !bodyBox) throw new Error("Expected an indented drag handle");
  await page.mouse.move(bodyBox.x + 2, box.y + box.height / 2);

  await expect(handle).toHaveCSS("opacity", "1");
  await expect(handle).toHaveCSS("pointer-events", "auto");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 4 });
  await expect.poll(() => handle.evaluate((element) => (
    document.elementFromPoint(
      element.getBoundingClientRect().left + element.getBoundingClientRect().width / 2,
      element.getBoundingClientRect().top + element.getBoundingClientRect().height / 2,
    ) === element
  ))).toBe(true);
});

test("maps a zoomed cross-card drop to the block under the pointer", async ({ page }) => {
  await switchMode(page, "edgeless");
  await page.getByRole("button", { name: "Zoom in" }).click();
  await page.getByRole("button", { name: "Zoom in" }).click();
  const cards = page.locator("[data-edgeless-root]");
  const sourceCard = cards.filter({ has: page.locator(".page-block-children") }).first();
  const sourceCardId = await sourceCard.getAttribute("data-edgeless-root");
  const source = sourceCard.locator(":scope > .edgeless-card-body > .page-block > .page-block-children > .page-block").first();
  const sourceId = await source.getAttribute(BLOCK_ID_ATTRIBUTE);
  let targetCard: Locator | undefined;
  for (let index = 0; index < await cards.count(); index += 1) {
    const candidate = cards.nth(index);
    if (await candidate.getAttribute("data-edgeless-root") !== sourceCardId) {
      targetCard = candidate;
      break;
    }
  }
  if (!sourceId || !targetCard) throw new Error("Expected source and target cards");

  const target = targetCard.locator(":scope > .edgeless-card-body > .page-block");
  await source.locator(":scope > .page-block-row").hover();
  const handleBox = await source.locator(":scope > .page-block-row .page-drag-handle").boundingBox();
  const targetBox = await target.locator(":scope > .page-block-row").boundingBox();
  if (!handleBox || !targetBox) throw new Error("Expected cross-card drag geometry");
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 8 });
  await expect(target.locator(":scope > .page-block-row")).toHaveAttribute("data-drop-inside", "true");
  await page.mouse.up();

  await expect(target.locator(`:scope > .page-block-children > ${blockIdSelector(sourceId)}`)).toHaveCount(1);
});

test("does not choose a structural drop target over blank canvas", async ({ page }) => {
  await switchMode(page, "edgeless");
  const card = page.locator("[data-edgeless-root]").filter({ has: page.locator(".page-block-children") }).first();
  const source = card.locator(":scope > .edgeless-card-body > .page-block > .page-block-children > .page-block").first();
  const sourceId = await source.getAttribute(BLOCK_ID_ATTRIBUTE);
  const parentId = await card.getAttribute("data-edgeless-root");
  const handleBox = await source.locator(":scope > .page-block-row .page-drag-handle").boundingBox();
  const viewportBox = await page.locator(".edgeless-viewport").boundingBox();
  if (!sourceId || !parentId || !handleBox || !viewportBox) throw new Error("Expected blank-canvas drag geometry");

  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(viewportBox.x + viewportBox.width - 30, viewportBox.y + viewportBox.height - 30, { steps: 8 });
  await expect(page.locator("[data-drop-inside], .page-drop-line")).toHaveCount(0);
  await page.mouse.up();

  await expect(card.locator(`:scope > .edgeless-card-body > .page-block > .page-block-children > ${blockIdSelector(sourceId)}`)).toHaveCount(1);
});

test("Enter on an edgeless leaf root creates its first child", async ({ page }) => {
  await switchMode(page, "edgeless");
  const cards = page.locator("[data-edgeless-root]");
  const beforeRoots = await cards.count();
  const card = cards.filter({
    has: page.locator("[data-block-content]"),
    hasNot: page.locator(".page-block-children"),
  }).first();
  const root = card.locator(":scope > .edgeless-card-body > .page-block");
  const rootId = await root.getAttribute(BLOCK_ID_ATTRIBUTE);
  if (!rootId) throw new Error("Expected an editable leaf root");
  const stableRoot = page.locator(blockIdSelector(rootId));

  await root.locator(":scope > .page-block-row [data-block-content]").click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");

  await expect(cards).toHaveCount(beforeRoots);
  const children = stableRoot.locator(":scope > .page-block-children > .page-block");
  await expect(children).toHaveCount(1);
  await expect(children.locator("[data-block-content]")).toBeFocused();
  await page.keyboard.press("Control+z");
  await expect(stableRoot.locator(":scope > .page-block-children")).toHaveCount(0);
});

test("deletes a selected edgeless root structurally", async ({ page }) => {
  await switchMode(page, "edgeless");
  const cards = page.locator("[data-edgeless-root]");
  const beforeRoots = await cards.count();
  const card = cards.filter({ has: page.locator(".page-block-children") }).first();
  const root = card.locator(":scope > .edgeless-card-body > .page-block");
  const rootId = await root.getAttribute(BLOCK_ID_ATTRIBUTE);
  const content = root.locator(":scope > .page-block-row [data-block-content]");
  const originalContent = await content.textContent();
  const originalChildren = await root.locator(":scope > .page-block-children > .page-block").count();
  if (!rootId || !originalContent || !originalChildren) throw new Error("Expected a populated root");

  await cardChrome(card).click({ position: { x: 280, y: 14 } });
  await page.keyboard.press("Delete");
  await expect(cards).toHaveCount(beforeRoots - 1);
  await expect(page.locator(`[data-edgeless-root="${rootId}"]`)).toHaveCount(0);
  await page.keyboard.press("Control+z");
  const restored = page.locator(`[data-edgeless-root="${rootId}"]`);
  await expect(restored.locator("[data-block-content]").first()).toHaveText(originalContent);
  await expect(restored.locator(":scope > .edgeless-card-body > .page-block > .page-block-children > .page-block")).toHaveCount(originalChildren);
});

test("deletes a selected nested block structurally", async ({ page }) => {
  await switchMode(page, "edgeless");
  const card = page.locator("[data-edgeless-root]").filter({ has: page.locator(".page-block-children") }).first();
  const nested = card.locator(":scope > .edgeless-card-body > .page-block > .page-block-children > .page-block").first();
  const nestedId = await nested.getAttribute(BLOCK_ID_ATTRIBUTE);
  const content = nested.locator(":scope > .page-block-row [data-block-content]");
  if (!nestedId || !(await content.textContent())) throw new Error("Expected a populated nested block");

  await content.click({ modifiers: ["Control"] });
  await page.keyboard.press("Delete");
  await expect(card.locator(blockIdSelector(nestedId))).toHaveCount(0);
});

test("edits Markdown and custom controls without selecting their root cards", async ({ page }) => {
  await switchMode(page, "edgeless");
  const first = page.locator("[data-edgeless-root]").first();
  const content = first.locator("[data-block-content]").first();
  await expect(first.locator(".markdown-preview strong")).toHaveText("Rivto editor");
  await content.click();
  await page.keyboard.press("End");
  await page.keyboard.type("!/sloder");
  await expect(page.locator('[data-slash-command="type.demo.slider"]')).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(first).not.toHaveAttribute("data-block-selected", "true");

  const slider = page.locator(
    `[data-edgeless-root] ${blockTypeSelector("demo.slider")} input`,
  );
  await slider.focus();
  await page.keyboard.press("ArrowRight");
  await expect(slider).toHaveValue("36");
  const counter = page.locator(
    `[data-edgeless-root] ${blockTypeSelector("demo.counter")} .custom-counter-block`,
  );
  await counter.click();
  await expect(counter).toHaveText("Count: 3");

  await switchMode(page, "block");
  await expect(page.locator("[data-block-content]").first()).toHaveText("**Rivto editor**!/sloder");
});

test("toggles root selection and moves or resizes layouts atomically", async ({ page }) => {
  await switchMode(page, "edgeless");
  const cards = page.locator("[data-edgeless-root]");
  const first = cards.nth(0);
  const second = cards.nth(1);
  await cardChrome(first).click({ position: { x: 280, y: 14 } });
  await cardChrome(second).click({ modifiers: ["Control"], position: { x: 280, y: 14 } });
  await expect(page.locator("[data-edgeless-root][data-block-selected]")).toHaveCount(2);

  const before = await Promise.all([first, second].map((card) => card.evaluate((element) => ({
    left: Number.parseFloat((element as HTMLElement).style.left),
    top: Number.parseFloat((element as HTMLElement).style.top),
    width: Number.parseFloat((element as HTMLElement).style.width),
  }))));
  const handle = first.locator("[data-edgeless-drag-handle]");
  const handleBox = await handle.boundingBox();
  if (!handleBox) throw new Error("Expected move handle geometry");
  await page.mouse.move(handleBox.x + 5, handleBox.y + 5);
  await page.mouse.down();
  await page.mouse.move(handleBox.x + 55, handleBox.y + 35, { steps: 6 });
  await page.mouse.up();
  await expect.poll(() => first.evaluate((element) => Number.parseFloat((element as HTMLElement).style.left))).toBe(before[0]!.left + 50);
  await expect.poll(() => second.evaluate((element) => Number.parseFloat((element as HTMLElement).style.top))).toBe(before[1]!.top + 30);

  await page.keyboard.press("Control+z");
  await expect.poll(() => first.evaluate((element) => Number.parseFloat((element as HTMLElement).style.left))).toBe(before[0]!.left);

  const resize = second.locator("[data-edgeless-resize-handle]");
  const resizeBox = await resize.boundingBox();
  if (!resizeBox) throw new Error("Expected resize handle geometry");
  await page.mouse.move(resizeBox.x + 5, resizeBox.y + 5);
  await page.mouse.down();
  await page.mouse.move(resizeBox.x + 35, resizeBox.y + 25, { steps: 5 });
  await page.mouse.up();
  await expect.poll(() => second.evaluate((element) => Number.parseFloat((element as HTMLElement).style.width))).toBe(before[1]!.width + 30);
});

test("rectangle-selects roots, moves them, then deletes them atomically", async ({ page }) => {
  await switchMode(page, "edgeless");
  const cards = page.locator("[data-edgeless-root]");
  const beforeCount = await cards.count();
  const firstBox = await cards.nth(0).boundingBox();
  const secondBox = await cards.nth(1).boundingBox();
  if (!firstBox || !secondBox) throw new Error("Expected root card geometry");
  await page.mouse.move(firstBox.x - 5, firstBox.y - 5);
  await page.mouse.down();
  await page.mouse.move(secondBox.x + secondBox.width + 5, secondBox.y + secondBox.height + 5, { steps: 8 });
  await expect(page.locator("[data-edgeless-selection-rectangle]")).toBeVisible();
  await page.mouse.up();
  await expect(page.locator("[data-edgeless-root][data-block-selected]")).toHaveCount(2);

  const left = await cards.nth(0).evaluate((element) => Number.parseFloat((element as HTMLElement).style.left));
  await page.keyboard.press("Shift+ArrowRight");
  await expect.poll(() => cards.nth(0).evaluate((element) => Number.parseFloat((element as HTMLElement).style.left))).toBe(left + 10);
  await page.keyboard.press("Delete");
  await expect(cards).toHaveCount(beforeCount - 2);
  await page.keyboard.press("Control+z");
  await expect(cards).toHaveCount(beforeCount);
});

test("deletes successive structural block selections immediately", async ({ page }) => {
  await switchMode(page, "edgeless");
  const card = page.locator("[data-edgeless-root]").filter({ has: page.locator(".page-block-children") }).first();
  const children = card.locator(":scope > .edgeless-card-body > .page-block > .page-block-children > .page-block");
  const firstId = await children.nth(0).getAttribute(BLOCK_ID_ATTRIBUTE);
  const secondId = await children.nth(1).getAttribute(BLOCK_ID_ATTRIBUTE);
  if (!firstId || !secondId) throw new Error("Expected two populated nested blocks");

  await children.nth(0).locator(":scope > .page-block-row [data-block-content]").click({ modifiers: ["Control"] });
  await page.keyboard.press("Delete");
  const first = card.locator(blockIdSelector(firstId));
  await expect(first).toHaveCount(0);

  await card.locator(blockIdSelector(secondId))
    .locator(":scope > .page-block-row [data-block-content]")
    .click({ modifiers: ["Control"] });
  await expect(card.locator("[data-block-id][data-block-selected]")).toHaveCount(1);

  await page.keyboard.press("Delete");
  await expect(card.locator(`${blockIdSelector(firstId)}, ${blockIdSelector(secondId)}`)).toHaveCount(0);
});

test("zooms, pans, and pastes selected root subtrees with offset layouts", async ({ page }) => {
  await switchMode(page, "edgeless");
  const viewport = page.locator(".edgeless-viewport");
  await page.getByRole("button", { name: "Zoom in" }).click();
  await expect(page.getByRole("button", { name: "Reset zoom" })).toHaveText("110%");
  await page.getByRole("button", { name: "Reset zoom" }).click();
  await expect(page.getByRole("button", { name: "Reset zoom" })).toHaveText("100%");

  const box = await viewport.boundingBox();
  if (!box) throw new Error("Expected viewport geometry");
  await viewport.focus();
  await page.keyboard.down("Space");
  await page.mouse.move(box.x + box.width - 30, box.y + box.height - 30);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 150, box.y + box.height - 100, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.up("Space");
  await expect.poll(async () => Number(await viewport.getAttribute("data-edgeless-pan-x"))).toBeLessThan(0);
  await expect(viewport).toHaveCSS("overflow", "hidden");
  await expect.poll(() => viewport.evaluate((element) => ({
    position: element.style.backgroundPosition,
    size: element.style.backgroundSize,
  }))).toEqual({ position: "-120px -70px", size: "20px 20px" });

  const cards = page.locator("[data-edgeless-root]");
  const before = await cards.count();
  const originalPositions = await Promise.all([cards.nth(0), cards.nth(1)].map((card) => card.evaluate((element) => ({
    left: Number.parseFloat((element as HTMLElement).style.left),
    top: Number.parseFloat((element as HTMLElement).style.top),
  }))));
  await cardChrome(cards.nth(0)).click({ position: { x: 280, y: 14 } });
  await cardChrome(cards.nth(1)).click({ modifiers: ["Control"], position: { x: 280, y: 14 } });
  await page.keyboard.press("Control+c");
  await page.keyboard.press("Control+v");
  await expect(cards).toHaveCount(before + 2);
  await expect(page.locator("[data-edgeless-root][data-block-selected]")).toHaveCount(2);
  const pastedPositions = await Promise.all([cards.nth(2), cards.nth(3)].map((card) => card.evaluate((element) => ({
    left: Number.parseFloat((element as HTMLElement).style.left),
    top: Number.parseFloat((element as HTMLElement).style.top),
  }))));
  expect(pastedPositions).toEqual(originalPositions.map(({ left, top }) => ({ left: left + 24, top: top + 24 })));
});

test("uses middle mouse only for unbounded canvas panning", async ({ page }) => {
  await switchMode(page, "edgeless");
  const viewport = page.locator(".edgeless-viewport");
  const box = await viewport.boundingBox();
  if (!box) throw new Error("Expected viewport geometry");
  await page.evaluate(() => {
    const state = { copy: 0, paste: 0 };
    (window as typeof window & { middleClipboard?: typeof state }).middleClipboard = state;
    document.addEventListener("copy", () => { state.copy += 1; });
    document.addEventListener("paste", () => { state.paste += 1; });
  });
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down({ button: "middle" });
  await page.mouse.move(box.x + box.width / 2 + 180, box.y + box.height / 2 + 120, { steps: 5 });
  await page.mouse.up({ button: "middle" });

  await expect.poll(async () => Number(await viewport.getAttribute("data-edgeless-pan-x"))).toBe(180);
  await expect.poll(async () => Number(await viewport.getAttribute("data-edgeless-pan-y"))).toBe(120);
  await expect.poll(() => page.evaluate(() => (
    window as typeof window & { middleClipboard?: { copy: number; paste: number } }
  ).middleClipboard)).toEqual({ copy: 0, paste: 0 });
});

test("keeps drawing coordinates aligned after pan and zoom", async ({ page }) => {
  await switchMode(page, "edgeless");
  const viewport = page.locator(".edgeless-viewport");
  const box = await viewport.boundingBox();
  if (!box) throw new Error("Expected viewport geometry");
  await page.getByRole("button", { name: "Zoom in" }).click();
  await page.mouse.move(box.x + 200, box.y + 180);
  await page.mouse.down({ button: "middle" });
  await page.mouse.move(box.x + 300, box.y + 230, { steps: 4 });
  await page.mouse.up({ button: "middle" });
  await page.getByRole("toolbar", { name: "Visual objects" }).getByRole("button", { name: "Draw" }).click();

  const start = { x: box.x + box.width - 220, y: box.y + 180 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 80, start.y + 40, { steps: 6 });
  await page.mouse.up();

  const drawing = page.locator('[data-edgeless-visual-kind="drawing"]');
  await expect(drawing).toHaveCount(1);
  await expect.poll(async () => {
    const drawn = await drawing.boundingBox();
    return drawn && { x: Math.round(drawn.x), y: Math.round(drawn.y), width: Math.round(drawn.width) };
  }).toEqual({ x: Math.round(start.x), y: Math.round(start.y), width: 80 });
});

test("duplicates a complete root subtree from slash with offset geometry", async ({ page }) => {
  await switchMode(page, "edgeless");
  const cards = page.locator("[data-edgeless-root]");
  const original = cards.filter({ has: page.locator(".page-block-children") }).first();
  const originalId = await original.getAttribute("data-edgeless-root");
  const originalPosition = await original.evaluate((element) => ({
    left: Number.parseFloat((element as HTMLElement).style.left),
    top: Number.parseFloat((element as HTMLElement).style.top),
  }));
  const originalDescendants = await original.locator(BLOCK_ID_SELECTOR).count();
  const before = await cards.count();

  const content = original.locator("[data-block-content]").first();
  await content.click();
  await page.keyboard.press("End");
  await page.keyboard.type("/dupl");
  await page.locator('[data-slash-command="block.duplicate"]').click();

  await expect(cards).toHaveCount(before + 1);
  // A slash command originates inside block content, so its resulting core
  // block selection remains distinct from the canvas-card selection.
  const duplicate = cards.filter({ has: page.locator(".page-block[data-block-selected]") });
  await expect(duplicate).toHaveCount(1);
  await expect(duplicate).not.toHaveAttribute("data-edgeless-root", originalId ?? "");
  await expect(duplicate.locator(BLOCK_ID_SELECTOR)).toHaveCount(originalDescendants);
  await expect.poll(() => duplicate.evaluate((element) => ({
    left: Number.parseFloat((element as HTMLElement).style.left),
    top: Number.parseFloat((element as HTMLElement).style.top),
  }))).toEqual({ left: originalPosition.left + 24, top: originalPosition.top + 24 });
});
