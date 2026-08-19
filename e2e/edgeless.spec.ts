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

const openCreateMenu = async (page: Page, category: "Shapes" | "Drawing" | "Text" | "Stickies" | "Connectors") => {
  const toolbar = page.getByRole("toolbar", { name: "Visual objects" });
  const menuKey = category === "Stickies" ? "stickers" : category.toLowerCase();
  const menu = page.getByRole("menu", { name: `${menuKey} tools` });
  if (!(await menu.isVisible())) await toolbar.getByRole("button", { name: category }).click();
  await expect(menu).toBeVisible();
  return menu;
};

const visualKind = (name: "Rectangle" | "Ellipse" | "Text") =>
  (name === "Rectangle" ? "rectangle" : name === "Ellipse" ? "ellipse" : "text") as const;

const visualFrame = (visual: Locator) => visual.evaluate((element) => {
  const style = (element as HTMLElement).style;
  return {
    x: Number.parseFloat(style.left),
    y: Number.parseFloat(style.top),
    width: Number.parseFloat(style.width),
    height: Number.parseFloat(style.height),
  };
});

/** Clicks the active place/draw capture layer (above canvas objects). */
const clickPlaceCapture = async (page: Page, position?: { x: number; y: number }) => {
  const capture = page.locator(".edgeless-drawing-capture[data-active]");
  await expect(capture).toBeVisible();
  const box = await capture.boundingBox();
  if (!box) throw new Error("Expected active place capture");
  await page.mouse.click(
    position?.x ?? box.x + box.width / 2,
    position?.y ?? box.y + box.height / 2,
  );
};

/** Creates a preset via place mode (click tool, then click canvas) and returns a locator by id. */
const createVisual = async (page: Page, name: "Rectangle" | "Ellipse" | "Text") => {
  const category = name === "Text" ? "Text" : "Shapes";
  const menu = await openCreateMenu(page, category);
  await menu.getByRole("button", { name }).click();
  const point = await emptyCanvasPoint(page);
  await clickPlaceCapture(page, point);
  const selected = page.locator(`[data-edgeless-visual-kind="${visualKind(name)}"][data-selected="true"]`);
  await expect(selected).toHaveCount(1);
  const id = await selected.getAttribute("data-edgeless-object-id");
  if (!id) throw new Error(`Expected object id for ${name}`);
  // Return to select so later clicks don't keep placing.
  await page.getByRole("toolbar", { name: "Visual objects" }).getByRole("button", { name: "Select" }).click();
  // Collapse properties so the top-right card does not intercept later canvas gestures.
  const properties = page.getByRole("region", { name: "Visual properties" });
  if (await properties.isVisible()) {
    const collapse = properties.getByRole("button", { name: "Collapse properties" });
    if (await collapse.count()) await collapse.click();
  }
  return page.locator(`[data-edgeless-object-id="${id}"]`);
};

const chooseDrawing = async (page: Page, name: "Pencil" | "Pen" | "Marker" | "Eraser") => {
  const menu = await openCreateMenu(page, "Drawing");
  await menu.getByRole("button", { name, exact: true }).click();
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

const emptyCanvasPoint = (page: Page, side: "any" | "left" = "any") => page.locator(".edgeless-viewport").evaluate((viewport, prefer) => {
  const rect = viewport.getBoundingClientRect();
  const midX = rect.left + rect.width / 2;
  for (let y = rect.bottom - 70; y > rect.top + 70; y -= 40) {
    for (let x = rect.right - 70; x > rect.left + 70; x -= 40) {
      if (prefer === "left" && x > midX - 40) continue;
      const hit = document.elementFromPoint(x, y);
      if (hit && viewport.contains(hit) && !hit.closest("[data-edgeless-root], [data-edgeless-object-kind], [data-edgeless-ui]")) {
        return { x, y };
      }
    }
  }
  throw new Error("Expected an empty canvas point");
}, side);

/** Two spaced shapes grouped; returns locators for the children and group chrome. */
const createSpacedGroup = async (page: Page) => {
  const rectangle = await createVisual(page, "Rectangle");
  const first = await rectangle.boundingBox();
  if (!first) throw new Error("Expected rectangle");
  await page.keyboard.down("Alt");
  await page.mouse.move(first.x + 20, first.y + 20);
  await page.mouse.down();
  await page.mouse.move(first.x - 160, first.y + 20, { steps: 4 });
  await page.mouse.up();
  await page.keyboard.up("Alt");
  const ellipse = await createVisual(page, "Ellipse");
  await rectangle.click({ modifiers: ["Control"] });
  await page.getByRole("toolbar", { name: "Selected objects" }).getByRole("button", { name: "Group", exact: true }).click();
  const hit = page.locator("[data-edgeless-group-hit]");
  const handle = page.locator('[data-edgeless-object-kind="group"] [data-edgeless-drag-handle]');
  await expect(handle).toBeVisible();
  return { rectangle, ellipse, hit, handle };
};

/**
 * Point inside the selected group union that is not over a child visual/block.
 * Used to exercise bbox / gap hit-testing vs child drill-in.
 */
const groupBBoxGapPoint = (page: Page) => page.locator("[data-edgeless-group-hit]").evaluate((bound) => {
  const rect = bound.getBoundingClientRect();
  for (let y = rect.top + 4; y < rect.bottom - 4; y += 4) {
    for (let x = rect.left + 4; x < rect.right - 4; x += 4) {
      const hit = document.elementFromPoint(x, y);
      if (!hit) continue;
      if (hit.closest("[data-edgeless-visual-kind], [data-edgeless-root], [data-edgeless-drag-handle], [data-edgeless-resize-handle], [data-edgeless-rotation-handle]")) continue;
      if (!hit.closest("[data-edgeless-group-hit]")) continue;
      return { x, y, hitGroup: true };
    }
  }
  throw new Error("Expected a gap point inside the group bbox");
});

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("darkens grid dots around the pointer with a CSS-configurable radius", async ({ page }) => {
  await switchMode(page, "edgeless");
  const viewport = page.locator(".edgeless-viewport");
  await viewport.evaluate((element) => {
    (element as HTMLElement).style.setProperty("--rivto-edgeless-spotlight-radius", "240px");
  });
  const bounds = await viewport.boundingBox();
  if (!bounds) throw new Error("Expected edgeless viewport bounds");

  await page.mouse.move(bounds.x + 120, bounds.y + 140);

  await expect.poll(() => viewport.evaluate((element) => {
    const style = (element as HTMLElement).style;
    const spotlight = getComputedStyle(element, "::before");
    return {
      x: style.getPropertyValue("--rivto-edgeless-pointer-x"),
      y: style.getPropertyValue("--rivto-edgeless-pointer-y"),
      mask: spotlight.maskImage,
      opacity: spotlight.opacity,
    };
  })).toEqual({
    x: "120px",
    y: "140px",
    mask: expect.stringContaining("240px"),
    opacity: "1",
  });
});

test("fades background grid dots when canvas zoom decreases", async ({ page }) => {
  await switchMode(page, "edgeless");
  const viewport = page.locator(".edgeless-viewport");
  const gridDotFade = () => viewport.evaluate((element) => (
    (element as HTMLElement).style.getPropertyValue("--rivto-edgeless-grid-dot-fade")
  ));

  await expect(viewport).toHaveAttribute("data-edgeless-zoom", "1");
  expect(await gridDotFade()).toBe("0%");

  for (let step = 0; step < 5; step += 1) {
    await page.getByRole("button", { name: "Zoom out" }).click();
  }

  await expect.poll(async () => Number(await viewport.getAttribute("data-edgeless-zoom"))).toBeCloseTo(0.5, 5);
  await expect.poll(gridDotFade).toBe("70%");
});

test("loads the visual-object plugin in the demo", async ({ page }) => {
  await switchMode(page, "edgeless");
  const toolbar = page.getByRole("toolbar", { name: "Visual objects" });
  await expect(toolbar).toBeVisible();
  const before = await page.locator('[data-edgeless-visual-kind="rectangle"]').count();
  const rectangle = await createVisual(page, "Rectangle");
  await expect(rectangle).toBeVisible();
  const dragHandle = rectangle.getByRole("button", { name: "Drag rectangle" });
  await expect(dragHandle).toBeVisible();
  await expect(dragHandle.locator("xpath=parent::*")).toHaveAttribute("data-slot-owner", "element");
  await expect(dragHandle.locator("xpath=parent::*")).toHaveAttribute("data-slot-position", "left-top");
  await expect(page.locator('[data-edgeless-visual-kind="rectangle"]')).toHaveCount(before + 1);
});

test("uses one continuous card surface with symmetric padding and a left-edge-top drag handle when selected", async ({ page }) => {
  await switchMode(page, "edgeless");
  const card = page.locator("[data-edgeless-root]").filter({ has: page.locator(".page-block-children") }).first();
  const beforeSelection = await card.boundingBox();
  await expect(card.getByRole("button", { name: "Drag canvas block" })).toHaveCount(0);
  await clickCardChrome(page, card);
  const dragHandle = card.getByRole("button", { name: "Drag canvas block" });
  await expect(dragHandle).toBeVisible();
  await expect(dragHandle.locator("xpath=parent::*")).toHaveAttribute("data-slot-owner", "element");
  await expect(dragHandle.locator("xpath=parent::*")).toHaveAttribute("data-slot-position", "left-top");
  const afterSelection = await card.boundingBox();
  const handleBox = await dragHandle.boundingBox();
  if (!afterSelection || !handleBox) throw new Error("Expected selected card drag geometry");
  expect(afterSelection).toEqual(beforeSelection);
  expect(Math.abs(handleBox.y - afterSelection.y)).toBeLessThanOrEqual(1);
  expect(handleBox.height).toBeCloseTo(Math.min(56, afterSelection.height * 0.75), 0);
  await expect(cardRoot(card)).toHaveCount(1);
  await expect(cardChildren(card)).toHaveCount(2);
  await expect(card).toHaveAttribute("data-auto-height", "true");
  await expect.poll(() => cardChrome(card).evaluate((element) => element.scrollHeight - element.clientHeight)).toBeLessThanOrEqual(1);
  const blockProperties = page.getByRole("region", { name: "Block properties" });
  const automaticHeight = blockProperties.getByRole("checkbox", { name: "Automatic card height" });
  await expect(blockProperties).toBeVisible();
  await expect(automaticHeight).toBeChecked();
  await automaticHeight.uncheck();
  await expect(card).toHaveAttribute("data-auto-height", "false");
  await automaticHeight.check();
  await expect(card).toHaveAttribute("data-auto-height", "true");
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
  await expect.poll(() => created.evaluate((element) => Number.parseFloat((element as HTMLElement).style.width))).toBe(720);
  await expect.poll(() => created.evaluate((element) => ({
    left: Number.parseFloat((element as HTMLElement).style.left),
    top: Number.parseFloat((element as HTMLElement).style.top),
  }))).toEqual({
    left: (point.x - transform.rect.x - transform.panX) / transform.zoom,
    top: (point.y - transform.rect.y - transform.panY) / transform.zoom,
  });
  await expect(created.locator("[data-block-content]")).toBeFocused();

  await created.locator("[data-block-content]").dblclick();
  await page.getByRole("toolbar", { name: "Visual objects" }).getByRole("button", { name: "Shapes" }).click();
  await page.getByRole("menu", { name: "shapes tools" }).getByRole("button", { name: "Rectangle" }).click();
  await clickPlaceCapture(page);
  const shape = page.locator('[data-edgeless-visual-kind="rectangle"][data-selected="true"]');
  await page.getByRole("toolbar", { name: "Visual objects" }).getByRole("button", { name: "Select" }).click();
  await shape.dblclick();
  await expect(cards).toHaveCount(before + 1);
});

test("shows compact creation and contextual toolbars and places at the click point", async ({ page }) => {
  await switchMode(page, "edgeless");
  const viewport = page.locator(".edgeless-viewport");
  const box = await viewport.boundingBox();
  if (!box) throw new Error("Expected viewport geometry");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down({ button: "middle" });
  await page.mouse.move(box.x + box.width / 2 + 100, box.y + box.height / 2 + 60);
  await page.mouse.up({ button: "middle" });

  const createToolbar = page.getByRole("toolbar", { name: "Visual objects" });
  await expect(createToolbar).toBeVisible();
  const menu = await openCreateMenu(page, "Shapes");
  await menu.getByRole("button", { name: "Rectangle" }).click();
  const capture = page.locator(".edgeless-drawing-capture[data-active]");
  const captureBox = await capture.boundingBox();
  if (!captureBox) throw new Error("Expected place capture");
  const click = { x: captureBox.x + captureBox.width / 2, y: captureBox.y + captureBox.height / 2 };
  await page.mouse.click(click.x, click.y);
  const visual = page.locator('[data-edgeless-visual-kind="rectangle"][data-selected="true"]');
  await expect(visual).toHaveCount(1);
  await createToolbar.getByRole("button", { name: "Select" }).click();
  const snappedBox = await visual.boundingBox();
  if (!snappedBox) throw new Error("Expected placed visual geometry");
  expect(Math.abs(snappedBox.x + snappedBox.width / 2 - click.x)).toBeLessThanOrEqual(10);
  expect(Math.abs(snappedBox.y + snappedBox.height / 2 - click.y)).toBeLessThanOrEqual(10);

  const cards = page.locator("[data-edgeless-root]");
  await clickCardChrome(page, cards.nth(0), ["Control"]);
  await clickCardChrome(page, cards.nth(1), ["Control"]);
  const actions = page.getByRole("toolbar", { name: "Selected objects" });
  await expect(actions).toBeVisible();
  await expect(actions.getByRole("button", { name: "Align left" })).toBeVisible();
  await expect(actions.getByRole("button", { name: "Distribute horizontally" })).toBeVisible();
  await expect(page.getByRole("toolbar", { name: "Canvas zoom" })).toHaveCSS("bottom", "14px");
});

test("creates visuals in canvas regions exposed by panning", async ({ page }) => {
  await switchMode(page, "edgeless");
  const viewport = page.locator(".edgeless-viewport");
  const box = await viewport.boundingBox();
  if (!box) throw new Error("Expected viewport geometry");

  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(center.x, center.y);
  await page.mouse.down({ button: "middle" });
  await page.mouse.move(center.x + 300, center.y, { steps: 6 });
  await page.mouse.up({ button: "middle" });

  // Panning right exposes the viewport's left side beyond the capture SVG's
  // original bounds; both placement and drawing must remain available there.
  const shapes = await openCreateMenu(page, "Shapes");
  await shapes.getByRole("button", { name: "Rectangle" }).click();
  const exposedPoint = { x: box.x + 80, y: box.y + 180 };
  await page.mouse.click(exposedPoint.x, exposedPoint.y);
  await expect(page.locator('[data-edgeless-visual-kind="rectangle"][data-selected="true"]')).toHaveCount(1);

  const drawings = page.locator('[data-edgeless-visual-kind="drawing"]');
  const drawingsBefore = await drawings.count();
  await chooseDrawing(page, "Pen");
  await page.mouse.move(box.x + 80, box.y + 320);
  await page.mouse.down();
  await page.mouse.move(box.x + 180, box.y + 350, { steps: 6 });
  await page.mouse.up();
  await expect(drawings).toHaveCount(drawingsBefore + 1);
});

test("snaps creation, reuses the active preset size, and constrains Shift drags", async ({ page }) => {
  await switchMode(page, "edgeless");
  const zoom = page.getByRole("toolbar", { name: "Canvas zoom" });
  await zoom.getByRole("button", { name: "Disable object alignment" }).click();
  const shapes = await openCreateMenu(page, "Shapes");
  await shapes.getByRole("button", { name: "Rectangle" }).click();

  const start = await emptyCanvasPoint(page);
  await page.mouse.move(start.x + 3, start.y + 7);
  await page.mouse.down();
  await page.mouse.move(start.x - 94, start.y - 67, { steps: 6 });
  await page.mouse.up();
  const first = page.locator('[data-edgeless-visual-kind="rectangle"][data-selected="true"]');
  const firstFrame = await visualFrame(first);
  expect(firstFrame.x % 20).toBe(0);
  expect(firstFrame.y % 20).toBe(0);
  expect(firstFrame.width % 20).toBe(0);
  expect(firstFrame.height % 20).toBe(0);

  const click = await emptyCanvasPoint(page);
  await clickPlaceCapture(page, { x: click.x + 7, y: click.y + 9 });
  const repeated = page.locator('[data-edgeless-visual-kind="rectangle"][data-selected="true"]');
  await expect.poll(() => visualFrame(repeated)).toMatchObject({
    width: firstFrame.width,
    height: firstFrame.height,
  });

  const shapeMenu = await openCreateMenu(page, "Shapes");
  await shapeMenu.getByRole("button", { name: "Ellipse" }).click();
  await shapeMenu.getByRole("button", { name: "Rectangle" }).click();
  const resetPoint = await emptyCanvasPoint(page);
  await clickPlaceCapture(page, resetPoint);
  await expect.poll(() => visualFrame(
    page.locator('[data-edgeless-visual-kind="rectangle"][data-selected="true"]'),
  )).toMatchObject({ width: 160, height: 120 });

  const textMenu = await openCreateMenu(page, "Text");
  await textMenu.getByRole("button", { name: "Text" }).click();
  const squareStart = await emptyCanvasPoint(page, "left");
  await page.keyboard.down("Shift");
  await page.mouse.move(squareStart.x, squareStart.y);
  await page.mouse.down();
  await page.mouse.move(squareStart.x + 93, squareStart.y - 47, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.up("Shift");
  const textFrame = await visualFrame(
    page.locator('[data-edgeless-visual-kind="text"][data-selected="true"]'),
  );
  expect(textFrame.width).toBe(textFrame.height);
});

test("shows object-alignment guides while creating a visual", async ({ page }) => {
  await switchMode(page, "edgeless");
  const target = await createVisual(page, "Rectangle");
  const targetBox = await target.boundingBox();
  const viewportBox = await page.locator(".edgeless-viewport").boundingBox();
  if (!targetBox || !viewportBox) throw new Error("Expected creation alignment geometry");
  const menu = await openCreateMenu(page, "Shapes");
  await menu.getByRole("button", { name: "Rectangle" }).click();
  const y = targetBox.y - viewportBox.y > 180
    ? targetBox.y - 120
    : targetBox.y + targetBox.height + 40;
  const start = { x: targetBox.x - 210, y };
  const end = { x: targetBox.x - 3, y: y + 60 };

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 8 });
  await expect(page.locator('[data-edgeless-snap-guide="align"]').first()).toBeVisible();
  await page.mouse.up();
  await expect(page.locator("[data-edgeless-snap-guide]")).toHaveCount(0);
  const created = page.locator('[data-edgeless-visual-kind="rectangle"][data-selected="true"]');
  const createdBox = await created.boundingBox();
  if (!createdBox) throw new Error("Expected aligned created visual");
  expect(Math.abs(createdBox.x + createdBox.width - targetBox.x)).toBeLessThanOrEqual(1);
});

test("toggles snap-to-grid, object alignment, and pans from the toolbar", async ({ page }) => {
  await switchMode(page, "edgeless");
  const zoom = page.getByRole("toolbar", { name: "Canvas zoom" });
  const snap = zoom.getByRole("button", { name: "Disable snap to grid" });
  const align = zoom.getByRole("button", { name: "Disable object alignment" });
  await expect(snap).toHaveAttribute("aria-pressed", "true");
  await expect(align).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".edgeless-viewport")).toHaveAttribute("data-edgeless-snap", "true");
  await expect(page.locator(".edgeless-viewport")).toHaveAttribute("data-edgeless-align", "true");
  await snap.click();
  await expect(page.locator(".edgeless-viewport")).toHaveAttribute("data-edgeless-snap", "false");
  await expect(zoom.getByRole("button", { name: "Enable snap to grid" })).toHaveAttribute("aria-pressed", "false");
  await align.click();
  await expect(page.locator(".edgeless-viewport")).toHaveAttribute("data-edgeless-align", "false");
  await expect(zoom.getByRole("button", { name: "Enable object alignment" })).toHaveAttribute("aria-pressed", "false");

  const tools = page.getByRole("toolbar", { name: "Visual objects" });
  await tools.getByRole("button", { name: "Pan" }).click();
  await expect(tools.getByRole("button", { name: "Pan" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".edgeless-viewport")).toHaveAttribute("data-edgeless-tool", "pan");
  const before = await page.locator(".edgeless-viewport").getAttribute("data-edgeless-pan-x");
  await page.mouse.move(320, 240);
  await page.mouse.down();
  await page.mouse.move(380, 260, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => page.locator(".edgeless-viewport").getAttribute("data-edgeless-pan-x")).not.toBe(before);
  await page.keyboard.press("Escape");
  await expect(tools.getByRole("button", { name: "Select" })).toHaveAttribute("aria-pressed", "true");
});

test("edits shape labels and keeps thick ellipse strokes inside the frame", async ({ page }) => {
  await switchMode(page, "edgeless");
  const ellipse = await createVisual(page, "Ellipse");
  // Non-square resize must stretch the SVG (square viewBox must not keep a circle).
  const se = ellipse.locator('[data-edgeless-resize-handle="se"]');
  const handleBox = await se.boundingBox();
  if (!handleBox) throw new Error("Expected resize handle");
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleBox.x + 70, handleBox.y - 45, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => {
    const box = await ellipse.boundingBox();
    const svg = await ellipse.locator("svg.edgeless-shape").boundingBox();
    if (!box || !svg) return false;
    return box.height < box.width && Math.abs(svg.width - box.width) < 2 && Math.abs(svg.height - box.height) < 2;
  }).toBe(true);

  const properties = page.getByRole("region", { name: "Visual properties" });
  await properties.getByRole("button", { name: "Expand properties" }).click();
  await properties.getByLabel("Stroke width").fill("28");
  await expect(ellipse.locator("ellipse")).toHaveAttribute("stroke-width", "28");
  await expect.poll(async () => Number(await ellipse.locator("ellipse").getAttribute("rx"))).toBeLessThan(50);
  await ellipse.dblclick();
  const label = ellipse.locator(".edgeless-shape-label");
  const editor = label.locator(".edgeless-label-editor");
  await expect(editor).toHaveAttribute("contenteditable", "true");
  await page.keyboard.type("Label");
  await page.locator(".edgeless-viewport").click({ position: { x: 24, y: 24 } });
  await expect(editor).toHaveText("Label");
  await ellipse.click();
  await expect(properties.getByRole("button", { name: "Align text center" })).toHaveAttribute("aria-pressed", "true");
  await expect(properties.getByRole("button", { name: "Align text middle" })).toHaveAttribute("aria-pressed", "true");
  await properties.getByRole("button", { name: "Align text left" }).click();
  await properties.getByRole("button", { name: "Align text top" }).click();
  await expect(label).toHaveCSS("text-align", "left");
  await expect(label).toHaveAttribute("data-vertical-align", "top");
});

test("resizes visuals on one axis and rotates them with Shift snapping", async ({ page }) => {
  await switchMode(page, "edgeless");
  const rectangle = await createVisual(page, "Rectangle");
  const before = await visualFrame(rectangle);
  const west = rectangle.locator('[data-edgeless-resize-handle="w"]');
  const westBox = await west.boundingBox();
  if (!westBox) throw new Error("Expected west resize handle");
  await page.keyboard.down("Alt");
  await page.mouse.move(westBox.x + westBox.width / 2, westBox.y + westBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(westBox.x + westBox.width / 2 - 40, westBox.y + westBox.height / 2, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.up("Alt");
  const resized = await visualFrame(rectangle);
  expect(resized.width).toBe(before.width + 40);
  expect(resized.height).toBe(before.height);

  const rotate = rectangle.locator("[data-edgeless-rotation-handle]");
  const rotateBox = await rotate.boundingBox();
  const rectangleBox = await rectangle.boundingBox();
  if (!rotateBox || !rectangleBox) throw new Error("Expected rotation geometry");
  const center = { x: rectangleBox.x + rectangleBox.width / 2, y: rectangleBox.y + rectangleBox.height / 2 };
  await page.keyboard.down("Shift");
  await page.mouse.move(rotateBox.x + rotateBox.width / 2, rotateBox.y + rotateBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(center.x + 100, center.y, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.up("Shift");
  await expect(rectangle).toHaveCSS("transform", "matrix(0, 1, -1, 0, 0, 0)");
  await page.keyboard.press("Control+z");
  await expect(rectangle).toHaveCSS("transform", "matrix(1, 0, 0, 1, 0, 0)");
});

test("keeps a connector label in the connector layer order", async ({ page }) => {
  await switchMode(page, "edgeless");
  const connector = page.locator('[data-edgeless-visual-kind="connector"]').filter({ hasText: "link" });
  const label = connector.locator(".edgeless-connector-label");
  const labelBox = await label.boundingBox();
  if (!labelBox) throw new Error("Expected labeled connector geometry");
  await expect(label).toHaveCSS("z-index", "auto");
  const coveringRectangle = await createVisual(page, "Rectangle");
  const rectangleBox = await coveringRectangle.boundingBox();
  if (!rectangleBox) throw new Error("Expected rectangle geometry");
  const point = { x: labelBox.x + labelBox.width / 2, y: labelBox.y + labelBox.height / 2 };
  await page.keyboard.down("Alt");
  await page.mouse.move(rectangleBox.x + rectangleBox.width / 2, rectangleBox.y + rectangleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(point.x, point.y, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.up("Alt");
  const rectangleId = await coveringRectangle.getAttribute("data-edgeless-object-id");
  const connectorId = await connector.getAttribute("data-edgeless-object-id");
  if (!rectangleId || !connectorId) throw new Error("Expected visual IDs");
  const paintedObjects = () => page.evaluate(({ x, y }) => [...new Set(document.elementsFromPoint(x, y)
    .map((element) => element.closest<HTMLElement>("[data-edgeless-object-id]")?.dataset.edgelessObjectId)
    .filter(Boolean))], point);

  await expect.poll(paintedObjects).toEqual(expect.arrayContaining([rectangleId, connectorId]));
  await expect.poll(async () => (await paintedObjects()).indexOf(rectangleId)).toBeLessThan((await paintedObjects()).indexOf(connectorId));
  await connector.locator(".edgeless-connector-hit").dispatchEvent("pointerdown", { button: 0 });
  await page.getByRole("toolbar", { name: "Selected objects" }).getByRole("button", { name: "Move front" }).click();
  await expect.poll(async () => (await paintedObjects()).indexOf(connectorId)).toBeLessThan((await paintedObjects()).indexOf(rectangleId));
});

test("edits visual properties immediately and enters text editing on double-click", async ({ page }) => {
  await switchMode(page, "edgeless");
  const toolbar = page.getByRole("toolbar", { name: "Visual objects" });
  const rectangle = await createVisual(page, "Rectangle");
  const properties = page.getByRole("region", { name: "Visual properties" });
  await expect(properties).toBeVisible();
  await expect(properties.getByRole("button", { name: "Done" })).toHaveCount(0);
  // createVisual collapses the panel; expand for editing assertions.
  await properties.getByRole("button", { name: "Expand properties" }).click();
  await expect(properties).not.toHaveAttribute("data-collapsed", "true");
  await expect(properties.getByRole("button", { name: "Collapse properties" })).toBeVisible();
  await expect(properties.getByRole("button", { name: "Close properties" })).toBeVisible();
  await properties.getByRole("button", { name: "Collapse properties" }).click();
  await expect(properties).toHaveAttribute("data-collapsed", "true");
  await properties.getByRole("button", { name: "Expand properties" }).click();
  await properties.getByRole("button", { name: "Close properties" }).click();
  await expect(page.getByRole("region", { name: "Visual properties" })).toHaveCount(0);
  await rectangle.click();
  await expect(properties).toBeVisible();
  // Fresh mount starts expanded.
  const fill = properties.getByLabel("Fill color");
  await fill.evaluate((element) => {
    for (const value of ["#111111", "#222222", "#123456"]) {
      (element as HTMLInputElement).value = value;
      element.dispatchEvent(new InputEvent("input", { bubbles: true }));
    }
  });
  await expect(rectangle.locator("rect")).toHaveAttribute("fill", "#123456");
  await properties.getByLabel("Stroke width").fill("5");
  await expect(rectangle.locator("rect")).toHaveAttribute("stroke-width", "5");
  // Commit the deferred property transaction by clicking away.
  await page.locator(".edgeless-viewport").click({ position: { x: 24, y: 24 } });
  await expect(rectangle.locator("rect")).toHaveAttribute("fill", "#123456");
  await expect(rectangle.locator("rect")).toHaveAttribute("stroke-width", "5");

  const text = await createVisual(page, "Text");
  const before = await text.evaluate((element) => Number.parseFloat((element as HTMLElement).style.left));
  const textBox = await text.boundingBox();
  if (!textBox) throw new Error("Expected text geometry");
  await page.mouse.move(textBox.x + textBox.width / 2, textBox.y + textBox.height / 2);
  await page.keyboard.down("Alt");
  await page.mouse.down();
  await page.mouse.move(textBox.x + textBox.width / 2 + 30, textBox.y + textBox.height / 2 + 10, { steps: 4 });
  await page.mouse.up();
  await page.keyboard.up("Alt");
  await expect.poll(() => text.evaluate((element) => Number.parseFloat((element as HTMLElement).style.left))).toBe(before + 30);

  const content = text.locator(".edgeless-visual-text .edgeless-label-editor");
  await content.dblclick();
  await expect(content).toHaveAttribute("contenteditable", "true");
  await expect(content).toBeFocused();
  await page.keyboard.press("Control+a");
  await expect.poll(() => page.evaluate(() => document.getSelection()?.toString())).toBe("Text");
  await page.keyboard.type("Edited");
  const point = await emptyCanvasPoint(page);
  await page.mouse.click(point.x, point.y);
  await expect(content).toHaveText("Edited");
  await expect(page.getByRole("region", { name: "Visual properties" })).toHaveCount(0);
});

test("previews a group with its drag handle before committing the move", async ({ page }) => {
  await switchMode(page, "edgeless");
  const create = page.getByRole("toolbar", { name: "Visual objects" });
  const rectangle = await createVisual(page, "Rectangle");
  const firstBox = await rectangle.boundingBox();
  if (!firstBox) throw new Error("Expected rectangle geometry");
  await page.mouse.move(firstBox.x + firstBox.width / 2, firstBox.y + firstBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(firstBox.x + firstBox.width / 2 - 100, firstBox.y + firstBox.height / 2, { steps: 4 });
  await page.mouse.up();
  const ellipse = await createVisual(page, "Ellipse");
  await rectangle.click({ modifiers: ["Control"] });
  await page.getByRole("toolbar", { name: "Selected objects" }).getByRole("button", { name: "Group", exact: true }).click();

  const handle = page.locator('[data-edgeless-object-kind="group"] [data-edgeless-drag-handle]');
  await expect(handle).toBeVisible();
  const before = await rectangle.boundingBox();
  const ellipseBefore = await ellipse.boundingBox();
  const leftBefore = await rectangle.evaluate((element) => Number.parseFloat((element as HTMLElement).style.left));
  const handleBox = await handle.boundingBox();
  if (!before || !ellipseBefore || !handleBox) throw new Error("Expected group drag geometry");
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.keyboard.down("Alt");
  await page.mouse.down();
  await page.mouse.move(handleBox.x + handleBox.width / 2 + 30, handleBox.y + handleBox.height / 2 + 20, { steps: 4 });
  await expect.poll(async () => (await rectangle.boundingBox())?.x).toBe(before.x + 30);
  await expect.poll(async () => (await ellipse.boundingBox())?.y).toBe(ellipseBefore.y + 20);
  await page.mouse.up();
  await page.keyboard.up("Alt");
  await expect.poll(() => rectangle.evaluate((element) => Number.parseFloat((element as HTMLElement).style.left))).toBe(leftBefore + 30);
});

test("drags categorized presets to canvas and edits a styled sticky", async ({ page }) => {
  await switchMode(page, "edgeless");
  const viewport = page.locator(".edgeless-viewport");
  await page.getByRole("toolbar", { name: "Canvas zoom" })
    .getByRole("button", { name: "Disable object alignment" }).click();
  await page.getByRole("toolbar", { name: "Visual objects" }).getByRole("button", { name: "Shapes" }).click();
  const rectanglePreset = page.getByRole("menu", { name: "shapes tools" }).getByRole("button", { name: "Rectangle" });
  const rectanglesBefore = await page.locator('[data-edgeless-visual-kind="rectangle"]').count();
  const presetBox = await rectanglePreset.boundingBox();
  const viewportBox = await viewport.boundingBox();
  if (!presetBox || !viewportBox) throw new Error("Expected preset drag geometry");
  const drop = { x: viewportBox.x + 760, y: viewportBox.y + 420 };
  await page.mouse.move(presetBox.x + presetBox.width / 2, presetBox.y + presetBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(drop.x, drop.y, { steps: 8 });
  const ghost = page.locator(".edgeless-preset-ghost");
  await expect(ghost).toBeVisible();
  const ghostBox = await ghost.boundingBox();
  await page.mouse.up();
  const rectangle = page.locator('[data-edgeless-visual-kind="rectangle"]').last();
  await expect(page.locator('[data-edgeless-visual-kind="rectangle"]')).toHaveCount(rectanglesBefore + 1);
  await expect.poll(async () => (await rectangle.boundingBox())?.x).toBeGreaterThan(650);
  const rectangleBox = await rectangle.boundingBox();
  if (!ghostBox || !rectangleBox) throw new Error("Expected snapped preset geometry");
  expect(Math.abs(rectangleBox.x - ghostBox.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(rectangleBox.y - ghostBox.y)).toBeLessThanOrEqual(1);
  const rectangleFrame = await visualFrame(rectangle);
  expect(rectangleFrame.x % 20).toBe(0);
  expect(rectangleFrame.y % 20).toBe(0);

  await page.getByRole("toolbar", { name: "Visual objects" }).getByRole("button", { name: "Stickies" }).click();
  await page.getByRole("menu", { name: "stickers tools" }).getByRole("button", { name: "Pink sticky" }).click();
  const stickyCapture = await page.locator(".edgeless-drawing-capture[data-active]").boundingBox();
  if (!stickyCapture) throw new Error("Expected sticky place capture");
  await clickPlaceCapture(page, { x: stickyCapture.x + 220, y: stickyCapture.y + 180 });
  const selectedSticky = page.locator('[data-edgeless-visual-kind="sticker"][data-selected="true"]');
  await expect(selectedSticky).toHaveCount(1);
  const stickyId = await selectedSticky.getAttribute("data-edgeless-object-id");
  if (!stickyId) throw new Error("Expected sticky id");
  const sticky = page.locator(`[data-edgeless-object-id="${stickyId}"]`);
  await page.getByRole("toolbar", { name: "Visual objects" }).getByRole("button", { name: "Select" }).click();
  await expect(sticky.locator(".edgeless-sticker-text")).toHaveCSS("background-color", "rgb(255, 217, 232)");
  await sticky.dblclick();
  await expect(sticky.locator(".edgeless-sticker-text .edgeless-label-editor")).toBeFocused();
  await page.keyboard.press("Control+a");
  await page.keyboard.type("Idea");
  const outside = await emptyCanvasPoint(page);
  await page.mouse.click(outside.x, outside.y);
  await expect(sticky).toContainText("Idea");
});

test("shares one property menu across same-type selections", async ({ page }) => {
  await switchMode(page, "edgeless");
  const first = await createVisual(page, "Rectangle");
  const firstBox = await first.boundingBox();
  if (!firstBox) throw new Error("Expected first rectangle");
  await page.keyboard.down("Alt");
  await page.mouse.move(firstBox.x + 20, firstBox.y + 20); await page.mouse.down(); await page.mouse.move(firstBox.x - 180, firstBox.y + 20); await page.mouse.up();
  await page.keyboard.up("Alt");
  await createVisual(page, "Rectangle");
  await first.click({ modifiers: ["Control"] });
  const properties = page.getByRole("region", { name: "Visual properties" });
  await expect(properties).toBeVisible();
  await properties.getByRole("button", { name: "Expand properties" }).click();
  const fill = properties.getByLabel("Fill color");
  await fill.evaluate((element) => { (element as HTMLInputElement).value = "#123456"; element.dispatchEvent(new InputEvent("input", { bubbles: true })); });
  await expect(page.locator('[data-edgeless-visual-kind="rectangle"] rect[fill="#123456"]')).toHaveCount(2);
});

test("enters a group with progressive single clicks on a child", async ({ page }) => {
  await switchMode(page, "edgeless");
  const { rectangle, ellipse, handle, hit } = await createSpacedGroup(page);
  await expect(handle).toBeVisible();
  await rectangle.click();
  await expect(rectangle).toHaveAttribute("data-selected", "true");
  await expect(handle).toHaveCount(0);
  const rectangleBefore = await rectangle.boundingBox(), ellipseBefore = await ellipse.boundingBox();
  if (!rectangleBefore || !ellipseBefore) throw new Error("Expected grouped geometry");
  await page.keyboard.down("Alt"); await page.mouse.move(rectangleBefore.x + 20, rectangleBefore.y + 20); await page.mouse.down(); await page.mouse.move(rectangleBefore.x + 60, rectangleBefore.y + 20); await page.mouse.up(); await page.keyboard.up("Alt");
  await expect.poll(async () => (await rectangle.boundingBox())?.x).toBe(rectangleBefore.x + 40);
  await expect.poll(async () => (await ellipse.boundingBox())?.x).toBe(ellipseBefore.x);
  await expect(rectangle).toHaveAttribute("data-selected", "true");
  // Shapes stay drilled-in on a plain click so double-click can edit labels.
  // Clear selection, then a fresh click on the child selects the group again.
  const outside = await emptyCanvasPoint(page);
  await page.mouse.click(outside.x, outside.y);
  await rectangle.click();
  await expect(handle).toBeVisible();
  await expect(hit).toBeVisible();
});

/**
 * Pre-fix contract (pointer-events: none on the outline only):
 * empty bbox / gaps between children hit the canvas and cleared selection.
 * Kept skipped so the regression is documented next to the new contract below.
 */
test.skip("legacy: group bbox gap fell through and cleared selection", async ({ page }) => {
  await switchMode(page, "edgeless");
  const { handle } = await createSpacedGroup(page);
  const gap = await groupBBoxGapPoint(page);
  expect(gap.hitGroup).toBe(false);
  await page.mouse.click(gap.x, gap.y);
  await expect(handle).toHaveCount(0);
});

test("groups an existing group with another shape via Primary-click (nested group)", async ({ page }) => {
  await switchMode(page, "edgeless");
  const { rectangle, handle } = await createSpacedGroup(page);
  const text = await createVisual(page, "Text");
  await expect(text).toHaveCount(1);
  // Reselect the group, then Primary-click the new shape into the selection.
  await rectangle.click();
  await expect(handle).toBeVisible();
  await text.click({ modifiers: ["Control"] });
  const toolbar = page.getByRole("toolbar", { name: "Selected objects" });
  await expect(toolbar.getByRole("button", { name: "Group", exact: true })).toBeVisible();
  await toolbar.getByRole("button", { name: "Group", exact: true }).click();
  await expect(page.locator("[data-edgeless-group-hit]")).toHaveCount(1);
  // Primary-click must not have collapsed the selection to only the text before Group.
  await expect(text).not.toHaveAttribute("data-selected", "true");
  await toolbar.getByRole("button", { name: "Ungroup", exact: true }).click();
  // Outer ungroup leaves the inner group + text co-selected so Group is available again.
  await expect(toolbar.getByRole("button", { name: "Group", exact: true })).toBeVisible();
  await expect(page.locator('[data-edgeless-object-kind="group"] [data-edgeless-drag-handle]').first()).toBeVisible();
});

test("Primary-marquees a sibling onto a selected group then groups them", async ({ page }) => {
  await switchMode(page, "edgeless");
  const { rectangle, handle } = await createSpacedGroup(page);
  const text = await createVisual(page, "Text");
  const textBox = await text.boundingBox();
  if (!textBox) throw new Error("Expected text");
  // Creating text steals selection — reselect the group, then Primary-marquee the sibling.
  await rectangle.click();
  await expect(handle).toBeVisible();
  await page.keyboard.down("Control");
  await page.mouse.move(textBox.x - 8, textBox.y - 8);
  await page.mouse.down();
  await page.mouse.move(textBox.x + textBox.width + 8, textBox.y + textBox.height + 8, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.up("Control");
  const toolbar = page.getByRole("toolbar", { name: "Selected objects" });
  await expect(toolbar.getByRole("button", { name: "Group", exact: true })).toBeVisible();
  await toolbar.getByRole("button", { name: "Group", exact: true }).click();
  await expect(page.locator("[data-edgeless-group-hit]")).toHaveCount(1);
  await toolbar.getByRole("button", { name: "Ungroup", exact: true }).click();
  await expect(page.locator('[data-edgeless-object-kind="group"] [data-edgeless-drag-handle]').first()).toBeVisible();
});

test("clicking the group bbox gap keeps the group selected without blocking child drill-in", async ({ page }) => {
  await switchMode(page, "edgeless");
  const { rectangle, hit, handle } = await createSpacedGroup(page);
  await expect(hit).toBeVisible();
  await expect(handle).toBeVisible();
  const gap = await groupBBoxGapPoint(page);
  expect(gap.hitGroup).toBe(true);
  await page.mouse.click(gap.x, gap.y);
  await expect(handle).toBeVisible();
  // Child clicks must still drill in (hit plate sits under children).
  await rectangle.click();
  await expect(rectangle).toHaveAttribute("data-selected", "true");
  await expect(handle).toHaveCount(0);
  await expect(hit).toHaveCount(0);
  // Shapes stay drilled-in on click; re-enter the group via clear + child click.
  const outside = await emptyCanvasPoint(page);
  await page.mouse.click(outside.x, outside.y);
  await rectangle.click();
  await expect(handle).toBeVisible();
  const before = await rectangle.boundingBox();
  if (!before) throw new Error("Expected rectangle");
  const dragFrom = await groupBBoxGapPoint(page);
  await page.keyboard.down("Alt");
  await page.mouse.move(dragFrom.x, dragFrom.y);
  await page.mouse.down();
  await page.mouse.move(dragFrom.x + 36, dragFrom.y + 12, { steps: 4 });
  await expect.poll(async () => (await rectangle.boundingBox())?.x).toBe(before.x + 36);
  await page.mouse.up();
  await page.keyboard.up("Alt");
  await expect(handle).toBeVisible();
});

test("draws presets, erases whole objects, and connects moving objects", async ({ page }) => {
  await switchMode(page, "edgeless");
  const viewport = page.locator(".edgeless-viewport");
  const viewportBox = await viewport.boundingBox();
  if (!viewportBox) throw new Error("Expected viewport");
  const point = { x: viewportBox.x + viewportBox.width - 300, y: viewportBox.y + 200 };
  const drawingsBefore = await page.locator('[data-edgeless-visual-kind="drawing"]').count();
  await chooseDrawing(page, "Marker");
  await page.mouse.move(point.x, point.y); await page.mouse.down(); await page.mouse.move(point.x + 90, point.y + 20, { steps: 8 }); await page.mouse.up();
  const drawing = page.locator('[data-edgeless-visual-kind="drawing"]').last();
  await expect(drawing.locator("path.edgeless-drawing-stroke")).toHaveAttribute("opacity", "0.34");
  await chooseDrawing(page, "Eraser");
  const drawingBox = await drawing.boundingBox();
  if (!drawingBox) throw new Error("Expected drawing");
  await page.mouse.move(drawingBox.x - 5, drawingBox.y + drawingBox.height / 2); await page.mouse.down(); await page.mouse.move(drawingBox.x + drawingBox.width + 5, drawingBox.y + drawingBox.height / 2, { steps: 6 }); await page.mouse.up();
  await expect(page.locator('[data-edgeless-visual-kind="drawing"]')).toHaveCount(drawingsBefore);

  await page.getByRole("toolbar", { name: "Visual objects" }).getByRole("button", { name: "Select" }).click();
  const rectangle = await createVisual(page, "Rectangle");
  const box = await rectangle.boundingBox();
  if (!box) throw new Error("Expected rectangle");
  await page.keyboard.down("Alt"); await page.mouse.move(box.x + 20, box.y + 20); await page.mouse.down(); await page.mouse.move(box.x - 180, box.y + 20); await page.mouse.up(); await page.keyboard.up("Alt");
  const ellipse = await createVisual(page, "Ellipse");
  const source = await rectangle.boundingBox(), target = await ellipse.boundingBox();
  if (!source || !target) throw new Error("Expected connector targets");
  const connectorsBefore = await page.locator('[data-edgeless-visual-kind="connector"]').count();
  await page.getByRole("toolbar", { name: "Visual objects" }).getByRole("button", { name: "Connectors" }).click();
  await page.getByRole("menu", { name: "connectors tools" }).getByRole("button", { name: "Curve connector" }).click();
  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2); await page.mouse.down(); await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 8 }); await page.mouse.up();
  await expect(page.locator('[data-edgeless-visual-kind="connector"]')).toHaveCount(connectorsBefore + 1);
  const connector = page.locator('[data-edgeless-visual-kind="connector"]').nth(connectorsBefore);
  await expect(connector).toHaveAttribute("data-edgeless-connector-route", "curve");
  const beforeFrame = await connector.evaluate((element) => ({
    left: (element as HTMLElement).style.left,
    top: (element as HTMLElement).style.top,
    width: (element as HTMLElement).style.width,
  }));
  await page.getByRole("toolbar", { name: "Visual objects" }).getByRole("button", { name: "Select" }).click();
  const targetBox = await ellipse.boundingBox();
  if (!targetBox) throw new Error("Expected ellipse");
  // Drag from the ellipse center so the fill receives the gesture (not transparent bbox corners).
  await page.keyboard.down("Alt");
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox.x + targetBox.width / 2 + 80, targetBox.y + targetBox.height / 2 + 40, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.up("Alt");
  await expect.poll(() => connector.evaluate((element) => ({
    left: (element as HTMLElement).style.left,
    top: (element as HTMLElement).style.top,
    width: (element as HTMLElement).style.width,
  }))).not.toEqual(beforeFrame);
});

test("exits connector mode with toolbar Select and Escape", async ({ page }) => {
  await switchMode(page, "edgeless");
  await createVisual(page, "Rectangle");
  await createVisual(page, "Ellipse");
  const toolbar = page.getByRole("toolbar", { name: "Visual objects" });
  await toolbar.getByRole("button", { name: "Connectors" }).click();
  await page.getByRole("menu", { name: "connectors tools" }).getByRole("button", { name: "Straight connector" }).click();
  await expect(toolbar.getByRole("button", { name: "Connectors" })).toHaveAttribute("aria-pressed", "true");
  await toolbar.getByRole("button", { name: "Select" }).click();
  await expect(toolbar.getByRole("button", { name: "Select" })).toHaveAttribute("aria-pressed", "true");
  await expect(toolbar.getByRole("button", { name: "Connectors" })).not.toHaveAttribute("aria-pressed", "true");

  await toolbar.getByRole("button", { name: "Connectors" }).click();
  await page.getByRole("menu", { name: "connectors tools" }).getByRole("button", { name: "Curve connector" }).click();
  await expect(toolbar.getByRole("button", { name: "Connectors" })).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");
  await expect(toolbar.getByRole("button", { name: "Select" })).toHaveAttribute("aria-pressed", "true");
  await expect(toolbar.getByRole("button", { name: "Connectors" })).not.toHaveAttribute("aria-pressed", "true");
});

test("previews attached connectors while dragging and highlights attach anchors", async ({ page }) => {
  await switchMode(page, "edgeless");
  const rectangle = await createVisual(page, "Rectangle");
  const ellipse = await createVisual(page, "Ellipse");
  const first = await rectangle.boundingBox();
  const second = await ellipse.boundingBox();
  if (!first || !second) throw new Error("Expected connector geometry");
  await page.keyboard.down("Alt");
  await page.mouse.move(first.x + 20, first.y + 20); await page.mouse.down();
  await page.mouse.move(first.x - 180, first.y + 20); await page.mouse.up();
  await page.keyboard.up("Alt");

  const toolbar = page.getByRole("toolbar", { name: "Visual objects" });
  await toolbar.getByRole("button", { name: "Connectors" }).click();
  await page.getByRole("menu", { name: "connectors tools" }).getByRole("button", { name: "Straight connector" }).click();
  const source = await rectangle.boundingBox();
  const target = await ellipse.boundingBox();
  if (!source || !target) throw new Error("Expected attach targets");
  // Hover the shape interior (attach uses geometry under the active capture layer).
  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
  await expect.poll(async () => page.locator("[data-edgeless-connector-anchors]").count()).toBe(1);
  await expect(page.locator(".edgeless-connector-anchor[data-active]")).toHaveCount(1);

  const connectorsBefore = await page.locator('[data-edgeless-visual-kind="connector"]').count();
  await page.mouse.down();
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 6 });
  await page.mouse.up();
  await expect(page.locator('[data-edgeless-visual-kind="connector"]')).toHaveCount(connectorsBefore + 1);
  const created = page.locator('[data-edgeless-visual-kind="connector"][data-selected="true"]');
  await expect(created).toHaveCount(1);
  const connectorId = await created.getAttribute("data-edgeless-object-id");
  if (!connectorId) throw new Error("Expected created connector id");
  const connector = page.locator(`[data-edgeless-object-id="${connectorId}"]`);
  await toolbar.getByRole("button", { name: "Select" }).click();
  const beforeFrame = await connector.evaluate((element) => ({
    left: (element as HTMLElement).style.left,
    top: (element as HTMLElement).style.top,
    width: (element as HTMLElement).style.width,
    height: (element as HTMLElement).style.height,
  }));
  const moved = await rectangle.boundingBox();
  if (!moved) throw new Error("Expected drag preview setup");
  await page.keyboard.down("Alt");
  await page.mouse.move(moved.x + moved.width / 2, moved.y + moved.height / 2);
  await page.mouse.down();
  await page.mouse.move(moved.x + moved.width / 2 + 60, moved.y + moved.height / 2 + 40, { steps: 6 });
  await expect(page.locator("[data-edgeless-connector-preview-stroke]")).toHaveCount(1);
  await page.mouse.up();
  await page.keyboard.up("Alt");
  await expect.poll(() => connector.evaluate((element) => ({
    left: (element as HTMLElement).style.left,
    top: (element as HTMLElement).style.top,
    width: (element as HTMLElement).style.width,
    height: (element as HTMLElement).style.height,
  }))).not.toEqual(beforeFrame);
});

test("keeps an internal labeled connector in its layer while dragging a group", async ({ page }) => {
  await switchMode(page, "edgeless");
  const rectangle = await createVisual(page, "Rectangle");
  const ellipse = await createVisual(page, "Ellipse");
  const initialRectangle = await rectangle.boundingBox();
  if (!initialRectangle) throw new Error("Expected rectangle geometry");
  await page.keyboard.down("Alt");
  await page.mouse.move(initialRectangle.x + initialRectangle.width / 2, initialRectangle.y + initialRectangle.height / 2);
  await page.mouse.down();
  await page.mouse.move(initialRectangle.x + initialRectangle.width / 2 - 180, initialRectangle.y + initialRectangle.height / 2, { steps: 4 });
  await page.mouse.up();
  await page.keyboard.up("Alt");
  const source = await rectangle.boundingBox();
  const target = await ellipse.boundingBox();
  if (!source || !target) throw new Error("Expected connector targets");
  const connectorsBefore = await page.locator('[data-edgeless-visual-kind="connector"]').count();
  const toolbar = page.getByRole("toolbar", { name: "Visual objects" });
  await toolbar.getByRole("button", { name: "Connectors" }).click();
  await page.getByRole("menu", { name: "connectors tools" }).getByRole("button", { name: "Straight connector" }).click();
  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 6 });
  await page.mouse.up();
  const connector = page.locator('[data-edgeless-visual-kind="connector"]').nth(connectorsBefore);
  await toolbar.getByRole("button", { name: "Select" }).click();
  await connector.locator(".edgeless-connector-hit").dispatchEvent("dblclick", { clientX: target.x, clientY: target.y });
  const labelEditor = connector.locator(".edgeless-connector-label .edgeless-label-editor");
  await expect(labelEditor).toBeFocused();
  await page.keyboard.type("group link");
  await rectangle.click();
  await ellipse.click({ modifiers: ["Control"] });
  await page.getByRole("toolbar", { name: "Selected objects" }).getByRole("button", { name: "Group", exact: true }).click();
  const handle = page.locator('[data-edgeless-object-kind="group"] [data-edgeless-drag-handle]');
  const handleBox = await handle.boundingBox();
  if (!handleBox) throw new Error("Expected group drag handle");
  await page.keyboard.down("Alt");
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleBox.x + handleBox.width / 2 + 24, handleBox.y + handleBox.height / 2 + 12, { steps: 4 });
  await expect(connector).toHaveCSS("visibility", "visible");
  await expect.poll(() => connector.evaluate((element) => (element as HTMLElement).style.transform)).toContain("translate");
  await page.mouse.up();
  await page.keyboard.up("Alt");
});

test("keeps create popovers above the selection toolbar", async ({ page }) => {
  await switchMode(page, "edgeless");
  const rectangle = await createVisual(page, "Rectangle");
  const first = await rectangle.boundingBox();
  if (!first) throw new Error("Expected rectangle");
  await page.keyboard.down("Alt");
  await page.mouse.move(first.x + 20, first.y + 20); await page.mouse.down(); await page.mouse.move(first.x - 180, first.y + 20); await page.mouse.up();
  await page.keyboard.up("Alt");
  await createVisual(page, "Ellipse");
  await page.getByRole("toolbar", { name: "Visual objects" }).getByRole("button", { name: "Select" }).click();
  await rectangle.click({ modifiers: ["Control"] });
  const selection = page.getByRole("toolbar", { name: "Selected objects" });
  await expect(selection).toBeVisible();
  const toolbar = page.getByRole("toolbar", { name: "Visual objects" });
  await toolbar.getByRole("button", { name: "Shapes" }).click();
  const menu = page.getByRole("menu", { name: "shapes tools" });
  await expect(menu).toBeVisible();
  await expect(toolbar).toHaveAttribute("data-menu-open", "shapes");
  const menuBox = await menu.boundingBox();
  const selectionBox = await selection.boundingBox();
  if (!menuBox || !selectionBox) throw new Error("Expected stacking geometry");
  const hit = await page.evaluate(({ x, y }) => {
    const element = document.elementFromPoint(x, y);
    return Boolean(element?.closest(".edgeless-tool-popover"));
  }, { x: menuBox.x + menuBox.width / 2, y: menuBox.y + menuBox.height / 2 });
  expect(hit).toBe(true);
});

test("updates drawing defaults from circle size slider and pads stroke frames", async ({ page }) => {
  await switchMode(page, "edgeless");
  const toolbar = page.getByRole("toolbar", { name: "Visual objects" });
  const drawingsBefore = await page.locator('[data-edgeless-visual-kind="drawing"]').count();
  await toolbar.getByRole("button", { name: "Drawing" }).click();
  const width = page.getByRole("menu", { name: "drawing tools" }).getByLabel("Default drawing width");
  await width.fill("16");
  await expect(width).toHaveValue("16");
  await page.getByRole("menu", { name: "drawing tools" }).getByRole("button", { name: "Pen", exact: true }).click();
  await expect(width).toHaveValue("16");
  const viewport = page.locator(".edgeless-viewport");
  const box = await viewport.boundingBox();
  if (!box) throw new Error("Expected viewport");
  const start = { x: box.x + box.width - 280, y: box.y + 220 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 120, start.y, { steps: 8 });
  await page.mouse.up();
  const drawing = page.locator('[data-edgeless-visual-kind="drawing"]');
  await expect(drawing).toHaveCount(drawingsBefore + 1);
  await expect.poll(async () => {
    const drawn = await drawing.last().boundingBox();
    return drawn ? Math.round(drawn.height) : 0;
  }).toBeGreaterThan(8);
});

test("snaps moving objects and renders temporary alignment guides", async ({ page }) => {
  await switchMode(page, "edgeless");
  const rectangle = await createVisual(page, "Rectangle");
  const initial = await rectangle.boundingBox();
  if (!initial) throw new Error("Expected rectangle");
  await page.keyboard.down("Alt"); await page.mouse.move(initial.x + 20, initial.y + 20); await page.mouse.down(); await page.mouse.move(initial.x - 200, initial.y + 20); await page.mouse.up(); await page.keyboard.up("Alt");
  const ellipse = await createVisual(page, "Ellipse");
  const first = await rectangle.boundingBox(), second = await ellipse.boundingBox();
  if (!first || !second) throw new Error("Expected snap geometry");
  const gap = second.x - (first.x + first.width);
  await page.mouse.move(first.x + 20, first.y + 20); await page.mouse.down(); await page.mouse.move(first.x + 20 + gap - 3, first.y + 20, { steps: 5 });
  await expect(page.locator("[data-edgeless-snap-guide]").first()).toBeVisible();
  await page.mouse.up();
  await expect.poll(async () => {
    const moved = await rectangle.boundingBox(), target = await ellipse.boundingBox();
    return moved && target ? Math.round(target.x - (moved.x + moved.width)) : -1;
  }).toBe(0);
});

test("uses one Ctrl selection across block and visual canvas objects", async ({ page }) => {
  await switchMode(page, "edgeless");
  const visual = await createVisual(page, "Rectangle");
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
  const visual = await createVisual(page, "Rectangle");
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
  await page.keyboard.down("Alt");
  await page.mouse.move(cardPoint.x, cardPoint.y);
  await page.mouse.down();
  await page.mouse.move(cardPoint.x + 40, cardPoint.y + 25, { steps: 5 });
  await expect.poll(async () => {
    const boxes = await Promise.all([card, visual].map((element) => element.boundingBox()));
    return boxes.every((box, index) => {
      const beforeBox = beforeBoxes[index]!;
      return box && Math.abs(box.x - beforeBox!.x - 40) <= 1 &&
        Math.abs(box.y - beforeBox!.y - 25) <= 1;
    });
  }).toBe(true);
  await page.mouse.up();
  await page.keyboard.up("Alt");
  await expect.poll(positions).toEqual(before.map(({ left, top }) => ({ left: left + 40, top: top + 25 })));

  await page.keyboard.press("Control+z");
  await expect.poll(positions).toEqual(before);
  const restoredBoxes = await Promise.all([card, visual].map((element) => element.boundingBox()));
  const visualBox = await visual.locator(":scope > svg").boundingBox();
  if (!visualBox || restoredBoxes.some((box) => !box)) throw new Error("Expected visual drag geometry");
  await page.keyboard.down("Alt");
  await page.mouse.move(visualBox.x + visualBox.width / 2, visualBox.y + visualBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(visualBox.x + visualBox.width / 2 + 30, visualBox.y + visualBox.height / 2 + 15, { steps: 5 });
  await expect.poll(async () => Promise.all([card, visual].map(async (element) => {
    const box = await element.boundingBox();
    return box && { x: Math.round(box.x), y: Math.round(box.y) };
  }))).toEqual(restoredBoxes.map((box) => ({ x: Math.round(box!.x + 30), y: Math.round(box!.y + 15) })));
  await page.mouse.up();
  await page.keyboard.up("Alt");
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
  await children.nth(1).locator(":scope > .page-block-row [data-block-content]").dispatchEvent("pointerdown", { button: 0, ctrlKey: true });
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

  await second.locator(":scope > .page-block-row [data-block-content]").focus();
  await page.keyboard.press("Home");
  await page.keyboard.press("Tab");
  const first = card.locator(`.page-block${blockIdSelector(firstId!)}`);
  await expect(first.locator(`:scope > .page-block-children > ${blockIdSelector(secondId!)}`)).toHaveCount(1);

  await first.locator(`${blockIdSelector(secondId!)} > .page-block-row [data-block-content]`).focus();
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
  const handle = row.locator(":scope .page-drag-handle");

  const box = await handle.boundingBox();
  const bodyBox = await cardChrome(card).boundingBox();
  if (!box || !bodyBox) throw new Error("Expected an indented drag handle");
  // Whole-line hover: left card padding at the nested row's y still reveals the handle.
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

test("moves a card by dragging from the left of an indented nested block", async ({ page }) => {
  await switchMode(page, "edgeless");
  const card = page.locator("[data-edgeless-root]").filter({ has: page.locator(".page-block-children") }).first();
  await clickCardChrome(page, card);
  await expect(card).toHaveAttribute("data-block-selected", "true");

  const nested = cardChildren(card).first();
  const nestedId = await nested.getAttribute(BLOCK_ID_ATTRIBUTE);
  if (!nestedId) throw new Error("Expected nested block id");
  // Use the whole-line hover strip left of the indented row. That lands on the
  // nested block (via .page-block-row::before), which previously failed card move
  // because only root IDs were accepted — while still keeping ⋮⋮ handle reveal.
  const dragFrom = await card.evaluate((cardElement, id) => {
    const block = cardElement.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(id)}"]`);
    const row = block?.querySelector<HTMLElement>(":scope > .page-block-row");
    const chrome = cardElement.querySelector<HTMLElement>(":scope > .edgeless-card-content");
    if (!block || !row || !chrome) throw new Error("Expected nested row chrome");
    const chromeRect = chrome.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    const x = chromeRect.left + 2;
    const y = rowRect.top + rowRect.height / 2;
    const hit = document.elementFromPoint(x, y);
    if (!hit) throw new Error("Expected a hit target");
    const hitBlock = hit.closest<HTMLElement>("[data-block-id]");
    if (hitBlock?.getAttribute("data-block-id") !== id) {
      throw new Error(`Expected nested block hit, got ${hitBlock?.getAttribute("data-block-id") ?? "none"}`);
    }
    if (hit.closest("[data-block-content], .page-drag-handle, button, [contenteditable=true]")) {
      throw new Error("Expected non-control nested chrome");
    }
    return { x, y };
  }, nestedId);

  const before = await card.evaluate((element) => ({
    left: Number.parseFloat((element as HTMLElement).style.left),
    top: Number.parseFloat((element as HTMLElement).style.top),
  }));
  await page.mouse.move(dragFrom.x, dragFrom.y);
  await page.mouse.down();
  await page.mouse.move(dragFrom.x + 40, dragFrom.y + 20, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => {
    const after = await card.evaluate((element) => ({
      left: Number.parseFloat((element as HTMLElement).style.left),
      top: Number.parseFloat((element as HTMLElement).style.top),
    }));
    return Math.abs(after.left - before.left - 40) <= .5 && Math.abs(after.top - before.top - 20) <= 2;
  }).toBe(true);

  // Structural handles must still light up across the whole indented line.
  const handle = nested.locator(":scope > .page-block-row .page-drag-handle");
  const bodyBox = await cardChrome(card).boundingBox();
  const handleBox = await handle.boundingBox();
  if (!bodyBox || !handleBox) throw new Error("Expected handle geometry after move");
  await page.mouse.move(bodyBox.x + 2, handleBox.y + handleBox.height / 2);
  await expect(handle).toHaveCSS("opacity", "1");
  await expect(handle).toHaveCSS("pointer-events", "auto");
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

  const commandCount = await menu.locator("[data-slash-command]").count();
  for (let index = 1; index < commandCount; index += 1) await page.keyboard.press("ArrowDown");
  await expect.poll(() => menu.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await expect.poll(() => active.evaluate((item) => {
    const itemRect = item.getBoundingClientRect();
    const menuRect = item.closest("[data-slash-menu]")!.getBoundingClientRect();
    return itemRect.top >= menuRect.top && itemRect.bottom <= menuRect.bottom;
  })).toBe(true);
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
    width: Number.parseFloat(getComputedStyle(element).width),
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
  await page.keyboard.down("Alt");
  await page.mouse.move(handleBox.x + 4, handleBox.y + 4);
  await page.mouse.down();
  await page.mouse.move(handleBox.x + 54, handleBox.y + 34, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.up("Alt");
  await expect.poll(() => first.evaluate((element) => Number.parseFloat((element as HTMLElement).style.left))).toBe(before[0]!.left + 50);
  await expect.poll(() => second.evaluate((element) => Number.parseFloat((element as HTMLElement).style.top))).toBe(before[1]!.top + 30);

  await page.keyboard.press("Control+z");
  await expect.poll(() => first.evaluate((element) => Number.parseFloat((element as HTMLElement).style.left))).toBe(before[0]!.left);

  const resize = second.locator('[data-edgeless-resize-handle="e"]');
  const resizeBox = await resize.boundingBox();
  if (!resizeBox) throw new Error("Expected resize handle geometry");
  await page.mouse.move(resizeBox.x + 5, resizeBox.y + 5);
  await page.keyboard.down("Alt");
  await page.mouse.down();
  await page.mouse.move(resizeBox.x + 35, resizeBox.y + 25, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.up("Alt");
  await expect.poll(() => second.evaluate((element) => Number.parseFloat(getComputedStyle(element).width))).toBe(before[1]!.width + 30);
  await expect(second).toHaveAttribute("data-auto-height", "false");
});

test("rectangle-selects roots, moves them, then deletes them atomically", async ({ page }) => {
  await switchMode(page, "edgeless");
  const cards = page.locator("[data-edgeless-root]");
  const beforeCount = await cards.count();
  const firstBox = await cards.nth(0).boundingBox();
  const secondBox = await cards.nth(1).boundingBox();
  if (!firstBox || !secondBox) throw new Error("Expected root card geometry");
  // Start marquee from a true empty canvas point (seeded connectors can sit past card edges).
  const start = await emptyCanvasPoint(page);
  await page.mouse.move(start.x, start.y);
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
  const drawingsBefore = await page.locator('[data-edgeless-visual-kind="drawing"]').count();
  await page.getByRole("button", { name: "Zoom in" }).click();
  await page.mouse.move(box.x + 200, box.y + 180);
  await page.mouse.down({ button: "middle" });
  await page.mouse.move(box.x + 300, box.y + 230, { steps: 4 });
  await page.mouse.up({ button: "middle" });
  const drawing = page.locator('[data-edgeless-visual-kind="drawing"]');
  for (const [index, tool] of ["Pencil", "Marker"].entries()) {
    await chooseDrawing(page, tool);
    const start = { x: box.x + box.width - 220, y: box.y + 140 + index * 100 };
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 80, start.y + 40, { steps: 6 });
    await page.mouse.up();

    await expect(drawing).toHaveCount(drawingsBefore + index + 1);
    await expect.poll(async () => {
      const drawn = await drawing.last().boundingBox();
      // Stroke padding expands the host beyond the raw path span after pan/zoom.
      return drawn && Math.round(drawn.width) >= 80 && Math.abs(Math.round(drawn.x) - Math.round(start.x)) <= 8;
    }).toBe(true);
  }
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

/**
 * Resize previews write left/top/width/height on the card while
 * data-edgeless-geometry-lock is set. A React re-render mid-drag (e.g. zoom)
 * must not clear those inline styles — otherwise the card jumps.
 */
test("keeps block card geometry stable when React re-renders mid-resize", async ({ page }) => {
  await switchMode(page, "edgeless");
  const card = page.locator("[data-edgeless-root]").first();
  await clickCardChrome(page, card);
  await expect(card).toHaveAttribute("data-block-selected", "true");

  const before = await card.evaluate((element) => {
    const host = element as HTMLElement;
    return {
      left: Number.parseFloat(host.style.left),
      top: Number.parseFloat(host.style.top),
      width: Number.parseFloat(host.style.width),
      height: Number.parseFloat(host.style.height),
    };
  });
  const seBefore = { x: before.left + before.width, y: before.top + before.height };

  const nw = card.locator('[data-edgeless-resize-handle="nw"]');
  const handle = await nw.boundingBox();
  if (!handle) throw new Error("Expected NW resize handle");

  await page.keyboard.down("Alt");
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x - 40, handle.y - 30, { steps: 6 });

  const preview = await card.evaluate((element) => {
    const host = element as HTMLElement;
    return {
      left: host.style.left,
      top: host.style.top,
      width: host.style.width,
      height: host.style.height,
      lock: host.dataset.edgelessGeometryLock === "true",
      x: host.getBoundingClientRect().x,
      y: host.getBoundingClientRect().y,
    };
  });
  expect(preview.lock).toBe(true);
  expect(preview.left && preview.top && preview.width && preview.height).toBeTruthy();

  // Zoom updates EdgelessSurface state and re-renders every card while the
  // pointer is still down — this used to wipe geometry via the lock style prop.
  await page.evaluate(() => {
    document.querySelector<HTMLButtonElement>('[aria-label="Zoom in"]')?.click();
  });
  await expect(page.locator(".edgeless-viewport")).toHaveAttribute("data-edgeless-zoom", "1.1");

  const afterRender = await card.evaluate((element) => {
    const host = element as HTMLElement;
    return {
      left: host.style.left,
      top: host.style.top,
      width: host.style.width,
      height: host.style.height,
      lock: host.dataset.edgelessGeometryLock === "true",
      style: host.getAttribute("style") ?? "",
      x: host.getBoundingClientRect().x,
      y: host.getBoundingClientRect().y,
    };
  });
  expect(afterRender.lock).toBe(true);
  expect(afterRender.left).not.toBe("");
  expect(afterRender.top).not.toBe("");
  expect(afterRender.width).not.toBe("");
  expect(afterRender.height).not.toBe("");
  expect(afterRender.style).toMatch(/left:/);
  // Screen position should stay near the pre-re-render preview (zoom changes
  // layout slightly; a cleared style jumps near the viewport origin).
  expect(Math.abs(afterRender.x - preview.x)).toBeLessThan(80);
  expect(Math.abs(afterRender.y - preview.y)).toBeLessThan(80);

  await page.mouse.up();
  await page.keyboard.up("Alt");

  await expect.poll(async () => card.evaluate((element) => {
    const host = element as HTMLElement;
    const left = Number.parseFloat(host.style.left);
    const top = Number.parseFloat(host.style.top);
    const width = Number.parseFloat(host.style.width);
    const height = Number.parseFloat(host.style.height);
    return {
      right: Math.round(left + width),
      bottom: Math.round(top + height),
    };
  })).toEqual({
    right: Math.round(seBefore.x),
    bottom: Math.round(seBefore.y),
  });
});
