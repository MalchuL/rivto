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

const cardChrome = (card: Locator) => card.locator(":scope > .edgeless-card-content");
const cardRoots = (card: Locator) => card.locator(":scope > .edgeless-card-content > .page-block");
const cardRoot = (card: Locator) => card.locator(":scope > .edgeless-card-content > .page-block:has(.page-block-children)").first();
const cardChildren = (card: Locator) => cardRoot(card).locator(":scope > .page-block-children > .page-block");
const cardChild = (card: Locator, id: string) => cardRoot(card).locator(`:scope > .page-block-children > ${blockIdSelector(id)}`);

const cardChromePoint = (card: Locator) => card.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const viewport = element.closest(".edgeless-viewport")?.getBoundingClientRect();
    if (!viewport) throw new Error("Expected canvas viewport");
    const left = Math.max(rect.left + 2, viewport.left + 2);
    const right = Math.min(rect.right - 2, viewport.right - 2);
    const top = Math.max(rect.top + 2, viewport.top + 2);
    const bottom = Math.min(rect.bottom - 2, viewport.bottom - 2);
    for (let y = bottom; y >= top; y -= 6) {
      for (let x = right; x >= left; x -= 6) {
        const hit = document.elementFromPoint(x, y);
        if (hit && element.contains(hit) && !hit.closest("[data-block-id], button, input, textarea, select, a, [data-edgeless-ui]")) {
          return { x, y };
        }
      }
    }
    throw new Error("Expected visible empty card chrome");
  });

const clickCardChrome = async (page: Page, card: Locator, modifiers: Array<"Control" | "Meta"> = []) => {
  const position = await cardChromePoint(card);
  for (const modifier of modifiers) await page.keyboard.down(modifier);
  await page.mouse.click(position.x, position.y);
  for (const modifier of [...modifiers].reverse()) await page.keyboard.up(modifier);
};

const emptyCanvasPoint = (page: Page) => page.locator(".edgeless-viewport").evaluate((viewport) => {
  const rect = viewport.getBoundingClientRect();
  for (let y = rect.bottom - 70; y > rect.top + 70; y -= 40) {
    for (let x = rect.right - 70; x > rect.left + 70; x -= 40) {
      const hit = document.elementFromPoint(x, y);
      if (hit && viewport.contains(hit) && !hit.closest("[data-edgeless-root], [data-edgeless-object-kind], [data-edgeless-ui]")) {
        return { x, y };
      }
    }
  }
  throw new Error("Expected an empty canvas point");
});

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

test("uses one continuous card surface with symmetric padding and no Move control", async ({ page }) => {
  await switchMode(page, "edgeless");
  const card = page.locator("[data-edgeless-root]").filter({ has: page.locator(".page-block-children") }).first();
  await expect(card.getByRole("button", { name: /Move canvas block/ })).toHaveCount(0);
  await expect(cardRoot(card)).toHaveCount(1);
  await expect(cardChildren(card)).toHaveCount(2);
  await expect.poll(() => cardChrome(card).evaluate((element) => {
    const style = getComputedStyle(element);
    return [style.paddingLeft, style.paddingRight];
  })).toEqual(["64px", "64px"]);
});

test("uses identical block typography and spacing in page and edgeless surfaces", async ({ page }) => {
  const pageBlock = page.locator(".page-surface > .page-block:has(> .page-block-children)").first();
  const blockId = await pageBlock.getAttribute(BLOCK_ID_ATTRIBUTE);
  if (!blockId) throw new Error("Expected a shared block ID");
  const metrics = (block: Locator) => block.evaluate((element) => {
    const blockStyle = getComputedStyle(element);
    const row = element.querySelector<HTMLElement>(":scope > .page-block-row");
    const content = row?.querySelector<HTMLElement>("[data-block-content]");
    if (!row || !content) throw new Error("Expected shared block DOM");
    const rowStyle = getComputedStyle(row);
    const contentStyle = getComputedStyle(content);
    return {
      fontFamily: blockStyle.fontFamily,
      fontSize: blockStyle.fontSize,
      lineHeight: contentStyle.lineHeight,
      marginTop: blockStyle.marginTop,
      marginBottom: blockStyle.marginBottom,
      rowPaddingLeft: rowStyle.paddingLeft,
    };
  });
  const pageMetrics = await metrics(pageBlock);
  await expect.poll(() => page.locator(".page-surface").first().evaluate((element) => {
    const style = getComputedStyle(element);
    return [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft];
  })).toEqual(["12px", "64px", "56px", "64px"]);

  await switchMode(page, "edgeless");
  const card = page.locator(`[data-edgeless-root="${blockId}"]`);
  const canvasBlock = card.locator(`:scope > .edgeless-card-content > ${blockIdSelector(blockId)}`);
  await expect.poll(() => metrics(canvasBlock)).toEqual(pageMetrics);
  await expect.poll(() => cardChrome(card).evaluate((element) => {
    const style = getComputedStyle(element);
    return [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft];
  })).toEqual(["12px", "64px", "56px", "64px"]);
});

test("double-clicks empty canvas to append and focus a block at that canvas point", async ({ page }) => {
  await switchMode(page, "edgeless");
  const viewport = page.locator(".edgeless-viewport");
  const cards = page.locator("[data-edgeless-root]");
  const before = await cards.count();
  const point = await emptyCanvasPoint(page);
  const transform = await viewport.evaluate((element) => ({
    rect: {
      x: element.getBoundingClientRect().x,
      y: element.getBoundingClientRect().y,
    },
    panX: Number((element as HTMLElement).dataset.edgelessPanX),
    panY: Number((element as HTMLElement).dataset.edgelessPanY),
    zoom: Number((element as HTMLElement).dataset.edgelessZoom),
  }));
  await page.mouse.dblclick(point.x, point.y);
  await expect(cards).toHaveCount(before + 1);
  const created = cards.last();
  await expect.poll(() => created.evaluate((element) => ({
    left: Number.parseFloat((element as HTMLElement).style.left),
    top: Number.parseFloat((element as HTMLElement).style.top),
  }))).toEqual({
    left: (point.x - transform.rect.x - transform.panX) / transform.zoom,
    top: (point.y - transform.rect.y - transform.panY) / transform.zoom,
  });
  await expect(created.locator("[data-block-content]")).toBeFocused();

  await created.locator("[data-block-content]").dblclick();
  await page.getByRole("toolbar", { name: "Visual objects" }).getByRole("button", { name: "Rectangle" }).click();
  await page.locator('[data-edgeless-visual-kind="rectangle"]').first().dblclick();
  await expect(cards).toHaveCount(before + 1);
});

test("shows compact creation and contextual toolbars and creates in the visible center", async ({ page }) => {
  await switchMode(page, "edgeless");
  const viewport = page.locator(".edgeless-viewport");
  const box = await viewport.boundingBox();
  if (!box) throw new Error("Expected viewport geometry");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down({ button: "middle" });
  await page.mouse.move(box.x + box.width / 2 + 100, box.y + box.height / 2 + 60);
  await page.mouse.up({ button: "middle" });

  const createToolbar = page.getByRole("toolbar", { name: "Visual objects" });
  await expect(createToolbar).toHaveCSS("flex-direction", "column");
  await createToolbar.getByRole("button", { name: "Rectangle" }).click();
  const visual = page.locator('[data-edgeless-visual-kind="rectangle"]');
  await expect.poll(async () => {
    const visualBox = await visual.boundingBox();
    return visualBox && {
      x: Math.round(visualBox.x + visualBox.width / 2),
      y: Math.round(visualBox.y + visualBox.height / 2),
    };
  }).toEqual({ x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) });

  const cards = page.locator("[data-edgeless-root]");
  await clickCardChrome(page, cards.nth(0), ["Control"]);
  await clickCardChrome(page, cards.nth(1), ["Control"]);
  const actions = page.getByRole("toolbar", { name: "Selected objects" });
  await expect(actions).toBeVisible();
  await expect(actions.getByRole("button", { name: "Align left" })).toBeVisible();
  await expect(actions.getByRole("button", { name: "Distribute horizontally" })).toBeVisible();
  await expect(page.getByRole("toolbar", { name: "Canvas zoom" })).toHaveCSS("bottom", "14px");
});

test("edits visual properties immediately and enters text editing on double-click", async ({ page }) => {
  await switchMode(page, "edgeless");
  const toolbar = page.getByRole("toolbar", { name: "Visual objects" });
  await toolbar.getByRole("button", { name: "Rectangle" }).click();
  const rectangle = page.locator('[data-edgeless-visual-kind="rectangle"]');
  const properties = page.getByRole("toolbar", { name: "Visual properties" });
  await expect(properties).toBeVisible();
  await expect(properties.getByRole("button", { name: "Done" })).toHaveCount(0);
  const fill = properties.getByLabel("Fill color");
  const initialFill = await rectangle.locator("rect").getAttribute("fill");
  await fill.evaluate((element) => {
    for (const value of ["#111111", "#222222", "#123456"]) {
      (element as HTMLInputElement).value = value;
      element.dispatchEvent(new InputEvent("input", { bubbles: true }));
    }
  });
  await expect(rectangle.locator("rect")).toHaveAttribute("fill", initialFill!);
  await fill.evaluate((element) => element.dispatchEvent(new Event("change", { bubbles: true })));
  await properties.getByLabel("Stroke width").fill("5");
  await expect(rectangle.locator("rect")).toHaveAttribute("fill", "#123456");
  await expect(rectangle.locator("rect")).toHaveAttribute("stroke-width", "5");

  await toolbar.getByRole("button", { name: "Text" }).click();
  const text = page.locator('[data-edgeless-visual-kind="text"]');
  const before = await text.evaluate((element) => Number.parseFloat((element as HTMLElement).style.left));
  const textBox = await text.boundingBox();
  if (!textBox) throw new Error("Expected text geometry");
  await page.mouse.move(textBox.x + textBox.width / 2, textBox.y + textBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(textBox.x + textBox.width / 2 + 30, textBox.y + textBox.height / 2 + 10, { steps: 4 });
  await page.mouse.up();
  await expect.poll(() => text.evaluate((element) => Number.parseFloat((element as HTMLElement).style.left))).toBe(before + 30);

  const content = text.locator(".edgeless-visual-text");
  await content.dblclick();
  await expect(content).toHaveAttribute("contenteditable", "true");
  await expect(content).toBeFocused();
  await page.keyboard.press("Control+a");
  await expect.poll(() => page.evaluate(() => document.getSelection()?.toString())).toBe("Text");
  await page.keyboard.type("Edited");
  const point = await emptyCanvasPoint(page);
  await page.mouse.click(point.x, point.y);
  await expect(content).toHaveText("Edited");
  await expect(page.getByRole("toolbar", { name: "Visual properties" })).toHaveCount(0);
});

test("previews a group with its drag handle before committing the move", async ({ page }) => {
  await switchMode(page, "edgeless");
  const create = page.getByRole("toolbar", { name: "Visual objects" });
  await create.getByRole("button", { name: "Rectangle" }).click();
  const rectangle = page.locator('[data-edgeless-visual-kind="rectangle"]');
  const firstBox = await rectangle.boundingBox();
  if (!firstBox) throw new Error("Expected rectangle geometry");
  await page.mouse.move(firstBox.x + firstBox.width / 2, firstBox.y + firstBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(firstBox.x + firstBox.width / 2 - 100, firstBox.y + firstBox.height / 2, { steps: 4 });
  await page.mouse.up();
  await create.getByRole("button", { name: "Ellipse" }).click();
  const ellipse = page.locator('[data-edgeless-visual-kind="ellipse"]');
  await rectangle.click({ modifiers: ["Control"] });
  await page.getByRole("toolbar", { name: "Selected objects" }).getByRole("button", { name: "Group", exact: true }).click();

  const handle = page.locator("[data-edgeless-group-drag-handle]");
  await expect(handle).toBeVisible();
  const before = await rectangle.boundingBox();
  const ellipseBefore = await ellipse.boundingBox();
  const leftBefore = await rectangle.evaluate((element) => Number.parseFloat((element as HTMLElement).style.left));
  const handleBox = await handle.boundingBox();
  if (!before || !ellipseBefore || !handleBox) throw new Error("Expected group drag geometry");
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleBox.x + handleBox.width / 2 + 30, handleBox.y + handleBox.height / 2 + 20, { steps: 4 });
  await expect.poll(async () => (await rectangle.boundingBox())?.x).toBe(before.x + 30);
  await expect.poll(async () => (await ellipse.boundingBox())?.y).toBe(ellipseBefore.y + 20);
  await page.mouse.up();
  await expect.poll(() => rectangle.evaluate((element) => Number.parseFloat((element as HTMLElement).style.left))).toBe(leftBefore + 30);
});

test("uses one Ctrl selection across block and visual canvas objects", async ({ page }) => {
  await switchMode(page, "edgeless");
  await page.getByRole("toolbar", { name: "Visual objects" }).getByRole("button", { name: "Rectangle" }).click();
  const visual = page.locator('[data-edgeless-object-kind="visual"]');
  const card = page.locator("[data-edgeless-root]").first();
  await expect(visual).toHaveAttribute("data-selected", "true");

  await clickCardChrome(page, card, ["Control"]);
  await expect(visual).toHaveAttribute("data-selected", "true");
  await expect(card).toHaveAttribute("data-block-selected", "true");
  await visual.click({ modifiers: ["Control"] });
  await expect(visual).not.toHaveAttribute("data-selected", "true");
  await expect(card).toHaveAttribute("data-block-selected", "true");
});

test("drags a mixed block and visual selection synchronously from either element", async ({ page }) => {
  await switchMode(page, "edgeless");
  await page.getByRole("toolbar", { name: "Visual objects" }).getByRole("button", { name: "Rectangle" }).click();
  const visual = page.locator('[data-edgeless-visual-kind="rectangle"]');
  const card = page.locator("[data-edgeless-root]").first();
  await clickCardChrome(page, card, ["Control"]);

  const positions = () => Promise.all([card, visual].map((element) => element.evaluate((node) => ({
    left: Number.parseFloat((node as HTMLElement).style.left),
    top: Number.parseFloat((node as HTMLElement).style.top),
  }))));
  const before = await positions();
  const beforeBoxes = await Promise.all([card, visual].map((element) => element.boundingBox()));
  if (beforeBoxes.some((box) => !box)) throw new Error("Expected mixed selection geometry");
  const cardPoint = await cardChromePoint(card);
  await page.mouse.move(cardPoint.x, cardPoint.y);
  await page.mouse.down();
  await page.mouse.move(cardPoint.x + 40, cardPoint.y + 25, { steps: 5 });
  await expect.poll(async () => Promise.all([card, visual].map(async (element) => {
    const box = await element.boundingBox();
    return box && { x: Math.round(box.x), y: Math.round(box.y) };
  }))).toEqual(beforeBoxes.map((box) => ({ x: Math.round(box!.x + 40), y: Math.round(box!.y + 25) })));
  await page.mouse.up();
  await expect.poll(positions).toEqual(before.map(({ left, top }) => ({ left: left + 40, top: top + 25 })));

  await page.keyboard.press("Control+z");
  await expect.poll(positions).toEqual(before);
  const restoredBoxes = await Promise.all([card, visual].map((element) => element.boundingBox()));
  const visualBox = await visual.locator(":scope > svg").boundingBox();
  if (!visualBox || restoredBoxes.some((box) => !box)) throw new Error("Expected visual drag geometry");
  await page.mouse.move(visualBox.x + visualBox.width / 2, visualBox.y + visualBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(visualBox.x + visualBox.width / 2 + 30, visualBox.y + visualBox.height / 2 + 15, { steps: 5 });
  await expect.poll(async () => Promise.all([card, visual].map(async (element) => {
    const box = await element.boundingBox();
    return box && { x: Math.round(box.x), y: Math.round(box.y) };
  }))).toEqual(restoredBoxes.map((box) => ({ x: Math.round(box!.x + 30), y: Math.round(box!.y + 15) })));
  await page.mouse.up();
  await expect.poll(positions).toEqual(before.map(({ left, top }) => ({ left: left + 30, top: top + 15 })));
});

test("renders two root ranges as cards with their complete nested outlines", async ({ page }) => {
  const parent = page.locator(".page-block:has(> .page-block-children)").first();
  const parentId = await parent.getAttribute(BLOCK_ID_ATTRIBUTE);
  const childId = await parent.locator(`:scope > .page-block-children ${BLOCK_ID_SELECTOR}`).first().getAttribute(BLOCK_ID_ATTRIBUTE);
  if (!parentId || !childId) throw new Error("Expected nested page IDs");
  await parent.locator(":scope > .page-block-row [data-collapse-toggle]").click();

  await switchMode(page, "edgeless");
  await expect(page.locator("[data-edgeless-root]")).toHaveCount(2);
  const card = page.locator(`[data-edgeless-root="${parentId}"]`);
  const toggle = card.locator(`${blockIdSelector(parentId)} > .page-block-row [data-collapse-toggle]`);
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(card.locator(blockIdSelector(childId))).toHaveCount(0);
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(card.locator(blockIdSelector(childId))).toHaveCount(1);
  await expect.poll(() => cardChrome(card).evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);

  await switchMode(page, "block");
  await expect(page.locator(`${blockIdSelector(parentId)} > .page-block-children`)).toHaveCount(1);
});

test("collapses edgeless blocks by keyboard and slash without claiming canvas focus", async ({ page }) => {
  await switchMode(page, "edgeless");
  const candidate = page.locator("[data-edgeless-root]").filter({ has: page.locator(".page-block-children") }).first();
  const cardId = await candidate.getAttribute("data-edgeless-root");
  const rootId = await cardRoot(candidate).getAttribute(BLOCK_ID_ATTRIBUTE);
  if (!cardId || !rootId) throw new Error("Expected a collapsible canvas block");
  const card = page.locator(`[data-edgeless-root="${cardId}"]`);
  const root = card.locator(blockIdSelector(rootId));
  const toggle = root.locator(":scope > .page-block-row [data-collapse-toggle]");
  const content = root.locator(":scope > .page-block-row [data-block-content]");

  await content.click();
  await page.keyboard.press("Control+ArrowUp");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await page.keyboard.press("Control+ArrowDown");
  await expect(toggle).toHaveAttribute("aria-expanded", "true");

  await content.click();
  await page.keyboard.press("End");
  await page.keyboard.type("/coll");
  await page.locator('[data-slash-command="block.collapse"]').click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await content.click();
  await page.keyboard.press("End");
  await page.keyboard.type("/exp");
  await page.locator('[data-slash-command="block.expand"]').click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");

  await clickCardChrome(page, card);
  await page.keyboard.press("Control+ArrowUp");
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
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

  await clickCardChrome(page, card);
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
  const children = cardChildren(card);
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
  const rootBlock = cardRoot(card);
  const directChildren = cardChildren(card);
  const firstId = await directChildren.first().getAttribute(BLOCK_ID_ATTRIBUTE);
  const second = directChildren.nth(1);
  const secondId = await second.getAttribute(BLOCK_ID_ATTRIBUTE);
  if (!firstId || !secondId) throw new Error("Expected sibling blocks");

  await second.locator(":scope > .page-block-row [data-block-content]").click();
  await page.keyboard.press("Home");
  await page.keyboard.press("Tab");
  const first = card.locator(`.page-block${blockIdSelector(firstId!)}`);
  await expect(first.locator(`:scope > .page-block-children > ${blockIdSelector(secondId!)}`)).toHaveCount(1);

  await first.locator(`${blockIdSelector(secondId!)} > .page-block-row [data-block-content]`).click();
  await page.keyboard.press("Shift+Tab");
  await expect(cardChild(card, secondId!)).toHaveCount(1);
});

test("reuses page Enter and structural drag inside a canvas card", async ({ page }) => {
  await switchMode(page, "edgeless");
  const card = page.locator("[data-edgeless-root]").filter({ has: page.locator(".page-block-children") }).first();
  const rootBlock = cardRoot(card);
  const directChildren = cardChildren(card);
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
  await page.mouse.move(targetBox.x + targetBox.width / 2 + 1, targetBox.y + targetBox.height / 2);
  await page.mouse.up();
  const movedTarget = card.locator(`.page-block${blockIdSelector(targetId!)}`);
  await expect(movedTarget.locator(`:scope > .page-block-children > ${blockIdSelector(sourceId!)}`)).toHaveCount(1);
});

test("keeps an indented block drag handle visible while moving onto it", async ({ page }) => {
  await switchMode(page, "edgeless");
  const card = page.locator("[data-edgeless-root]").filter({ has: page.locator(".page-block-children") }).first();
  const nested = cardChildren(card).first();
  const row = nested.locator(":scope > .page-block-row");
  const handle = row.locator(":scope > .page-drag-handle");

  const box = await handle.boundingBox();
  const bodyBox = await cardChrome(card).boundingBox();
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
  const cards = page.locator("[data-edgeless-root]");
  const viewportBox = await page.locator(".edgeless-viewport").boundingBox();
  if (!viewportBox) throw new Error("Expected viewport geometry");
  const nestedCards = cards.filter({ has: page.locator(".page-block-children") });
  let sourceCard: Locator | undefined;
  for (let index = 0; index < await nestedCards.count(); index += 1) {
    const candidate = nestedCards.nth(index);
    const box = await candidate.boundingBox();
    if (box && box.x + 40 >= viewportBox.x && box.x + box.width <= viewportBox.x + viewportBox.width) {
      sourceCard = candidate;
      break;
    }
  }
  if (!sourceCard) throw new Error("Expected a visible nested source card");
  const sourceCardId = await sourceCard.getAttribute("data-edgeless-root");
  const source = cardChildren(sourceCard).first();
  const sourceId = await source.getAttribute(BLOCK_ID_ATTRIBUTE);
  let targetCard: Locator | undefined;
  for (let index = 0; index < await cards.count(); index += 1) {
    const candidate = cards.nth(index);
    const box = await candidate.boundingBox();
    if (await candidate.getAttribute("data-edgeless-root") !== sourceCardId &&
      box && box.x + 40 >= viewportBox.x && box.x + box.width <= viewportBox.x + viewportBox.width) {
      targetCard = candidate;
      break;
    }
  }
  if (!sourceId || !targetCard) throw new Error("Expected source and target cards");

  const target = cardRoot(targetCard);
  await source.locator(":scope > .page-block-row").hover();
  const handleBox = await source.locator(":scope > .page-block-row .page-drag-handle").boundingBox();
  const targetBox = await target.locator(":scope > .page-block-row").boundingBox();
  if (!handleBox || !targetBox) throw new Error("Expected cross-card drag geometry");
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 8 });
  await page.mouse.move(targetBox.x + targetBox.width / 2 + 1, targetBox.y + targetBox.height / 2);
  await expect(target.locator(":scope > .page-block-row")).toHaveAttribute("data-drop-inside", "true");
  await page.mouse.up();

  await expect(cardChild(targetCard, sourceId)).toHaveCount(1);
});

test("does not choose a structural drop target over blank canvas", async ({ page }) => {
  await switchMode(page, "edgeless");
  const card = page.locator("[data-edgeless-root]").filter({ has: page.locator(".page-block-children") }).first();
  const source = cardChildren(card).first();
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

  await expect(cardChild(card, sourceId)).toHaveCount(1);
});

test("Enter on an edgeless leaf root creates the next root in the same card", async ({ page }) => {
  await switchMode(page, "edgeless");
  const cards = page.locator("[data-edgeless-root]");
  const beforeRoots = await cards.count();
  const root = page.locator("[data-edgeless-root] > .edgeless-card-content > .page-block:not(:has(> .page-block-children))").first();
  const card = root.locator("xpath=ancestor::*[@data-edgeless-root]");
  const rootId = await root.getAttribute(BLOCK_ID_ATTRIBUTE);
  if (!rootId) throw new Error("Expected an editable leaf root");
  const stableCard = card;
  const rootsBefore = await cardRoots(stableCard).count();

  await root.locator(":scope > .page-block-row [data-block-content]").click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");

  await expect(cards).toHaveCount(beforeRoots);
  const originalRoot = stableCard.locator(`:scope > .edgeless-card-content > ${blockIdSelector(rootId)}`);
  await expect(originalRoot.locator(":scope > .page-block-children > .page-block")).toHaveCount(0);
  const roots = cardRoots(stableCard);
  const originalIndex = await roots.evaluateAll((elements, id) => elements.findIndex((element) => element.getAttribute("data-block-id") === id), rootId);
  await expect(roots).toHaveCount(rootsBefore + 1);
  await expect(roots.nth(originalIndex + 1).locator(":scope > .page-block-row [data-block-content]")).toBeFocused();
  await page.keyboard.press("Control+z");
  await expect(roots).toHaveCount(rootsBefore);
});

test("deletes a selected edgeless root structurally", async ({ page }) => {
  await switchMode(page, "edgeless");
  const cards = page.locator("[data-edgeless-root]");
  const beforeRoots = await cards.count();
  const card = cards.filter({ has: page.locator(".page-block-children") }).first();
  const root = cardRoot(card);
  const rootId = await root.getAttribute(BLOCK_ID_ATTRIBUTE);
  const content = root.locator(":scope > .page-block-row [data-block-content]");
  const originalContent = await content.textContent();
  const originalChildren = await cardChildren(card).count();
  if (!rootId || !originalContent || !originalChildren) throw new Error("Expected a populated root");

  await clickCardChrome(page, card);
  await page.keyboard.press("Delete");
  await expect(cards).toHaveCount(beforeRoots - 1);
  await expect(page.locator(`[data-edgeless-root="${rootId}"]`)).toHaveCount(0);
  await page.keyboard.press("Control+z");
  const restored = page.locator(`[data-edgeless-root="${rootId}"]`);
  await expect(restored.locator(blockIdSelector(rootId)).locator(":scope > .page-block-row [data-block-content]")).toHaveText(originalContent);
  await expect(cardChildren(restored)).toHaveCount(originalChildren);
});

test("deletes a selected nested block structurally", async ({ page }) => {
  await switchMode(page, "edgeless");
  const card = page.locator("[data-edgeless-root]").filter({ has: page.locator(".page-block-children") }).first();
  const nested = cardChildren(card).first();
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
  await expect(first.locator(".markdown-preview strong").first()).toHaveText("Rivto editor");
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

test("moves through the shared slash menu with arrow keys", async ({ page }) => {
  await switchMode(page, "edgeless");
  const content = page.locator("[data-edgeless-root] [data-block-content]").first();
  await content.click();
  await page.keyboard.press("End");
  await page.keyboard.type("/");

  const menu = page.locator("[data-slash-menu]");
  const active = menu.locator("[data-active]");
  await expect(menu).toBeVisible();
  const firstCommand = await active.getAttribute("data-slash-command");
  if (!firstCommand) throw new Error("Expected an active slash command");

  await page.keyboard.press("ArrowDown");
  await expect(active).not.toHaveAttribute("data-slash-command", firstCommand);
  await page.keyboard.press("ArrowUp");
  await expect(active).toHaveAttribute("data-slash-command", firstCommand);
});

test("renders explicit separators and creates a new card with the separator shortcut", async ({ page }) => {
  const separators = page.locator('[data-separator-block="true"]');
  await expect(separators).toHaveCount(1);
  await expect(separators.first()).toHaveAttribute("role", "separator");
  await expect(separators.first().locator(".rivto-separator-arrow")).toHaveText(["↑", "↓"]);

  const firstContent = page.locator(".page-surface > .page-block [data-block-content]").first();
  await firstContent.click();
  await page.keyboard.press("Control+Shift+Enter");
  await expect(separators).toHaveCount(2);
  await expect.poll(() => page.evaluate(() => document.activeElement?.hasAttribute("data-block-content"))).toBe(true);

  await switchMode(page, "edgeless");
  await expect(page.locator("[data-edgeless-root]")).toHaveCount(3);
  await expect(page.locator("[data-edgeless-root] [data-separator-block]")).toHaveCount(0);

  await page.locator(".edgeless-viewport").focus();
  await page.keyboard.press("Control+Shift+Enter");
  await expect(page.locator("[data-edgeless-root]")).toHaveCount(3);
});

test("creates and focuses a separator continuation from slash", async ({ page }) => {
  const content = page.locator("[data-block-content]").first();
  await content.click();
  await page.keyboard.press("End");
  await page.keyboard.type("/separator");
  const command = page.locator('[data-slash-command="block.separator.insert"]');
  await expect(command).toBeVisible();
  await command.click();

  await expect(page.locator('[data-separator-block="true"]')).toHaveCount(2);
  await expect.poll(() => page.evaluate(() => document.activeElement?.hasAttribute("data-block-content"))).toBe(true);
});

test("renders nested separators without splitting document cards", async ({ page }) => {
  const nested = page.locator(".page-surface > .page-block .page-block-children [data-block-content]").first();
  await nested.click();
  await page.keyboard.press("Control+Shift+Enter");
  await expect(page.locator('[data-separator-block="true"]')).toHaveCount(2);

  await switchMode(page, "edgeless");
  await expect(page.locator("[data-edgeless-root]")).toHaveCount(2);
  await expect(page.locator("[data-edgeless-root] [data-separator-block]")).toHaveCount(1);
});

test("toggles root selection and moves or resizes layouts atomically", async ({ page }) => {
  await switchMode(page, "edgeless");
  const cards = page.locator("[data-edgeless-root]");
  const first = cards.nth(0);
  const second = cards.nth(1);
  await clickCardChrome(page, first);
  await clickCardChrome(page, second, ["Control"]);
  await expect(page.locator("[data-edgeless-root][data-block-selected]")).toHaveCount(2);

  const before = await Promise.all([first, second].map((card) => card.evaluate((element) => ({
    left: Number.parseFloat((element as HTMLElement).style.left),
    top: Number.parseFloat((element as HTMLElement).style.top),
    width: Number.parseFloat((element as HTMLElement).style.width),
  }))));
  const contentBox = await first.locator("[data-block-content]").first().boundingBox();
  if (!contentBox) throw new Error("Expected block content geometry");
  await page.mouse.move(contentBox.x + contentBox.width / 2, contentBox.y + contentBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(contentBox.x + contentBox.width / 2 + 20, contentBox.y + contentBox.height / 2 + 10);
  await page.mouse.up();
  await expect.poll(() => first.evaluate((element) => Number.parseFloat((element as HTMLElement).style.left))).toBe(before[0]!.left);

  const handle = cardChrome(first);
  const handleBox = await handle.boundingBox();
  if (!handleBox) throw new Error("Expected move handle geometry");
  await page.mouse.move(handleBox.x + 4, handleBox.y + 4);
  await page.mouse.down();
  await page.mouse.move(handleBox.x + 54, handleBox.y + 34, { steps: 6 });
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
  await page.mouse.move(secondBox.x + secondBox.width + 5, secondBox.y + secondBox.height + 5);
  await page.mouse.down();
  await page.mouse.move(firstBox.x - 1, firstBox.y - 5, { steps: 8 });
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
  const cardId = await card.getAttribute("data-edgeless-root");
  const children = cardChildren(card);
  const firstId = await children.nth(0).getAttribute(BLOCK_ID_ATTRIBUTE);
  const secondId = await children.nth(1).getAttribute(BLOCK_ID_ATTRIBUTE);
  if (!cardId || !firstId || !secondId) throw new Error("Expected two populated nested blocks");
  const stableCard = page.locator(`[data-edgeless-root="${cardId}"]`);

  await children.nth(0).locator(":scope > .page-block-row [data-block-content]").click({ modifiers: ["Control"] });
  await page.keyboard.press("Delete");
  const first = stableCard.locator(blockIdSelector(firstId));
  await expect(first).toHaveCount(0);

  await stableCard.locator(blockIdSelector(secondId))
    .locator(":scope > .page-block-row [data-block-content]")
    .click({ modifiers: ["Control"] });
  await expect(stableCard.locator("[data-block-id][data-block-selected]")).toHaveCount(1);

  await page.keyboard.press("Delete");
  await expect(stableCard.locator(`${blockIdSelector(firstId)}, ${blockIdSelector(secondId)}`)).toHaveCount(0);
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
  await clickCardChrome(page, cards.nth(0));
  await clickCardChrome(page, cards.nth(1), ["Control"]);
  await page.keyboard.press("Control+c");
  await page.keyboard.press("Control+v");
  await expect(cards).toHaveCount(before + 2);
  await expect(page.locator("[data-edgeless-root][data-block-selected]")).toHaveCount(2);
  const pasted = page.locator("[data-edgeless-root][data-block-selected]");
  const pastedPositions = await Promise.all([pasted.nth(0), pasted.nth(1)].map((card) => card.evaluate((element) => ({
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
  const before = await cards.count();

  const originalRoot = cardRoot(original);
  const subtreeSize = 1 + await originalRoot.locator(BLOCK_ID_SELECTOR).count();
  const content = originalRoot.locator(":scope > .page-block-row [data-block-content]");
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
  await expect(duplicate.locator(BLOCK_ID_SELECTOR)).toHaveCount(subtreeSize);
  await expect.poll(() => duplicate.evaluate((element) => ({
    left: Number.parseFloat((element as HTMLElement).style.left),
    top: Number.parseFloat((element as HTMLElement).style.top),
  }))).toEqual({ left: originalPosition.left + 24, top: originalPosition.top + 24 });
});
