import { expect, test, type Page } from "@playwright/test";
import type { DocumentEditorAPI } from "@chulane/rivto";

interface DemoWindow extends Window {
  __rivtoDemo: { editor: DocumentEditorAPI };
}

interface RetentionWindow extends Window {
  tracked: WeakRef<Element>[];
  control: WeakRef<Element>[];
}

const WIDGET = `<style>
  body { margin: 0; font: 16px sans-serif; }
  #drag, #drop { width: 160px; height: 48px; background: #eee; margin: 12px; }
</style>
<input aria-label="Level" type="range" min="0" max="100" value="25">
<input aria-label="Note" value="hello">
<div id="drag" draggable="true"></div><div id="drop"></div>
<div contenteditable="true" role="textbox" aria-label="Rich note">original</div>
<script>
  document.getElementById('drag').addEventListener('dragstart', function (event) {
    event.dataTransfer.setData('text/plain', 'moved');
  });
  document.getElementById('drop').addEventListener('dragover', function (event) { event.preventDefault(); });
  document.getElementById('drop').addEventListener('drop', function (event) {
    event.preventDefault(); rivto.setProp('dropped', event.dataTransfer.getData('text/plain'));
  });
</script>`;

const POINTER_WIDGET = `<style>
  body { margin: 0; }
  #pad { width: 240px; height: 60px; background: #eee; }
  #knob { width: 36px; height: 36px; background: #555; touch-action: none; }
</style>
<div id="pad"><div id="knob" aria-label="Drag knob"></div></div>
<script>
  var knob = document.getElementById('knob');
  var start = 0;
  knob.addEventListener('pointerdown', function (event) {
    start = event.clientX;
    knob.setPointerCapture(event.pointerId);
  });
  knob.addEventListener('pointermove', function (event) {
    if (knob.hasPointerCapture(event.pointerId)) knob.style.transform = 'translateX(' + (event.clientX - start) + 'px)';
  });
  knob.addEventListener('pointerup', function (event) {
    rivto.setProp('distance', event.clientX - start);
  });
</script>`;

/**
 * Inserts one widget in the Page surface.
 *
 * @param page - Demo page with an initialized document.
 * @returns The inserted block ID.
 */
async function insertWidget(page: Page): Promise<string> {
  return page.evaluate((source) => {
    const editor = (window as unknown as DemoWindow).__rivtoDemo.editor;
    return editor.blocks.insertBlock({
      type: "html",
      content: source,
      props: { label: "Interaction lab", fixture: "retained" },
    }).id;
  }, WIDGET);
}

/**
 * Installs a widget in the seeded HTML card and moves that card into view.
 *
 * @param page - Demo page with an initialized document.
 * @returns The IDs of the replaced block and its canvas card.
 */
async function prepareWidgetCard(page: Page): Promise<{ block: string; card: string }> {
  return page.evaluate((source) => {
    const editor = (window as unknown as DemoWindow).__rivtoDemo.editor;
    const block = editor.blocks.getBlocks().find((item) => item.props.sample === "pomodoro");
    const card = editor.elements.getElementNodes().find((item) => {
      const start = item.props.startBlockId;
      return (
        item.type === "block" &&
        typeof start === "string" &&
        editor.blocks.getBlockNode(start)?.content === "## HTML widgets"
      );
    });
    if (!block || !card) {
      throw new Error("Missing HTML block card");
    }
    editor.blocks.updateBlock(block.id, {
      content: source,
      props: { label: "Card interaction lab" },
    });
    editor.elements.updateElement(card.id, { frame: { ...card.frame, x: 4000, y: 80 } });
    return { block: block.id, card: card.id };
  }, WIDGET);
}

/**
 * Reads the current persisted frame of one canvas element.
 *
 * @param page - Demo page containing the document.
 * @param id - Stable canvas element ID.
 * @returns Its frame, or undefined if the element has disappeared.
 */
async function readElementFrame(page: Page, id: string) {
  return page.evaluate(
    (elementId) =>
      (window as unknown as DemoWindow).__rivtoDemo.editor.elements.getElementNode(elementId)
        ?.frame,
    id,
  );
}

/**
 * Reads a persisted property of a canvas element.
 *
 * @param page - Demo page containing the document.
 * @param id - Stable canvas element ID.
 * @param key - Property to read from the current snapshot.
 * @returns The property value, or undefined when the element or key is absent.
 */
async function readElementProp(page: Page, id: string, key: string): Promise<unknown> {
  return page.evaluate(
    ({ elementId, property }) =>
      (window as unknown as DemoWindow).__rivtoDemo.editor.elements.getElementNode(elementId)
        ?.props[property],
    { elementId: id, property: key },
  );
}

/**
 * Pans the canvas to an element without changing its document geometry.
 *
 * @param page - Demo page containing the canvas.
 * @param id - Element whose frame should appear near the viewport origin.
 * @returns The viewport has reached the requested element.
 */
async function panToElement(page: Page, id: string): Promise<void> {
  const viewport = page.locator(".edgeless-viewport");
  const expected = await viewport.evaluate((root, elementId) => {
    const element = (window as unknown as DemoWindow).__rivtoDemo.editor.elements.getElementNode(
      elementId,
    );
    if (!element) {
      throw new Error("Missing canvas element");
    }
    const zoom = Number(root.getAttribute("data-edgeless-zoom")) || 1;
    const x = Number(root.getAttribute("data-edgeless-pan-x")) || 0;
    const y = Number(root.getAttribute("data-edgeless-pan-y")) || 0;
    const destination = { x: 120 - element.frame.x * zoom, y: 180 - element.frame.y * zoom };
    root.dispatchEvent(
      new WheelEvent("wheel", {
        deltaX: x - destination.x,
        deltaY: y - destination.y,
        bubbles: true,
        cancelable: true,
      }),
    );
    return destination;
  }, id);
  await expect
    .poll(async () => Number(await viewport.getAttribute("data-edgeless-pan-x")))
    .toBeCloseTo(expected.x);
  await expect
    .poll(async () => Number(await viewport.getAttribute("data-edgeless-pan-y")))
    .toBeCloseTo(expected.y);
}

/**
 * Performs a browser-native drag between two iframe rectangles.
 *
 * @param page - Page receiving trusted pointer events.
 * @param from - Source rectangle in page coordinates.
 * @param to - Destination rectangle in page coordinates.
 * @returns The pointer has been released over the destination.
 */
async function dragBetween(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(
        ({ from, to }) =>
          [from, to].map((point) => document.elementFromPoint(point.x + 12, point.y + 12)?.tagName),
        { from, to },
      ),
    )
    .toEqual(["IFRAME", "IFRAME"]);
  await page.mouse.move(from.x + 12, from.y + 12);
  await page.mouse.down();
  await page.mouse.move(to.x + 12, to.y + 12, { steps: 12 });
  await page.mouse.up();
}

test("HTML widgets retain native drag and drop inside Page", async ({ page }) => {
  await page.goto("/");
  const id = await insertWidget(page);
  const block = page.locator(`[data-block-id="${id}"]`);
  await block.evaluate((element) => element.scrollIntoView({ block: "center" }));
  const frame = page.frameLocator('iframe[name="Interaction lab"]');
  await expect(frame.locator("#drag")).toBeVisible();
  await expect(frame.locator("#drop")).toBeVisible();
  const source = (await frame.locator("#drag").boundingBox())!;
  const destination = (await frame.locator("#drop").boundingBox())!;
  await dragBetween(page, source, destination);
  await expect
    .poll(() =>
      page.evaluate(
        (blockId) =>
          (window as unknown as DemoWindow).__rivtoDemo.editor.blocks.getBlockNode(blockId)?.props
            .dropped,
        id,
      ),
    )
    .toBe("moved");
  await expect(block).not.toHaveAttribute("data-block-selected", "true");
});

test("HTML widgets keep captured pointer drags when the pointer moves quickly", async ({
  page,
}) => {
  await page.goto("/");
  const id = await page.evaluate(
    (source) =>
      (window as unknown as DemoWindow).__rivtoDemo.editor.blocks.insertBlock({
        type: "html",
        content: source,
        props: { label: "Pointer lab" },
      }).id,
    POINTER_WIDGET,
  );
  const block = page.locator(`[data-block-id="${id}"]`);
  await block.evaluate((element) => element.scrollIntoView({ block: "center" }));
  const knob = page.frameLocator('iframe[name="Pointer lab"]').locator("#knob");
  await expect(knob).toBeVisible();
  const box = (await knob.boundingBox())!;
  await expect
    .poll(() =>
      page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName, {
        x: box.x + 12,
        y: box.y + 12,
      }),
    )
    .toBe("IFRAME");
  await page.mouse.move(box.x + 12, box.y + 12);
  await page.mouse.down();
  await page.mouse.move(box.x + 160, box.y + 12);
  await page.mouse.up();
  await expect
    .poll(() =>
      page.evaluate(
        (blockId) =>
          Number(
            (window as unknown as DemoWindow).__rivtoDemo.editor.blocks.getBlockNode(blockId)?.props
              .distance,
          ),
        id,
      ),
    )
    .toBeGreaterThan(120);
  await expect(block).not.toHaveAttribute("data-block-selected", "true");
});

test("HTML drag targets follow a dynamically enabled draggable attribute", async ({ page }) => {
  await page.goto("/");
  const id = await page.evaluate(
    () =>
      (window as unknown as DemoWindow).__rivtoDemo.editor.blocks.insertBlock({
        type: "html",
        content: `<div id="drag" style="width:160px;height:48px;background:#eee"></div>
        <div id="drop" style="width:160px;height:48px;background:#ddd"></div>
        <script>
          document.addEventListener('dragstart', function (event) { event.dataTransfer.setData('text/plain', 'dynamic'); });
          var drop = document.getElementById('drop');
          drop.addEventListener('dragover', function (event) { event.preventDefault(); });
          drop.addEventListener('drop', function (event) { event.preventDefault(); rivto.setProp('dropped', event.dataTransfer.getData('text/plain')); });
        </script>`,
        props: { label: "Dynamic drag lab" },
      }).id,
  );
  const block = page.locator(`[data-block-id="${id}"]`);
  await block.evaluate((element) => element.scrollIntoView({ block: "center" }));
  const frame = page.frameLocator('iframe[name="Dynamic drag lab"]');
  const source = frame.locator("#drag");
  const destination = frame.locator("#drop");
  await expect(source).toBeVisible();
  await expect(destination).toBeVisible();
  await source.evaluate((node) => node.setAttribute("draggable", "true"));
  await dragBetween(page, (await source.boundingBox())!, (await destination.boundingBox())!);
  await expect
    .poll(() =>
      page.evaluate(
        (blockId) =>
          (window as unknown as DemoWindow).__rivtoDemo.editor.blocks.getBlockNode(blockId)?.props
            .dropped,
        id,
      ),
    )
    .toBe("dynamic");
});

test("replaced HTML controls retain their own click handlers", async ({ page }) => {
  await page.goto("/");
  const id = await insertWidget(page);
  const block = page.locator(`[data-block-id="${id}"]`);
  await block.evaluate((element) => element.scrollIntoView({ block: "center" }));
  const frame = page.frameLocator('iframe[name="Interaction lab"]');
  const body = frame.locator("body");
  for (let index = 0; index < 2; index += 1) {
    await body.evaluate((node) => {
      node.querySelector("#dynamic-control")?.remove();
      const control = document.createElement("div");
      control.id = "dynamic-control";
      control.style.cssText = "width:160px;height:40px;background:#ddd";
      control.addEventListener("click", () => {
        control.dataset.clicked = "true";
      });
      node.append(control);
    });
    const control = frame.locator("#dynamic-control");
    await control.click();
    await expect(control).toHaveAttribute("data-clicked", "true");
  }
  await expect(block).not.toHaveAttribute("data-block-selected", "true");
});

test("removed HTML controls with listeners can be collected", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "The browser garbage-collection probe uses CDP.");
  await page.goto("/");
  const id = await insertWidget(page);
  const block = page.locator(`[data-block-id="${id}"]`);
  await block.evaluate((element) => element.scrollIntoView({ block: "center" }));
  await expect(page.frameLocator('iframe[name="Interaction lab"]').locator("body")).toBeAttached();
  const frame = page.frame({ name: "Interaction lab" });
  if (!frame) {
    throw new Error("Missing interaction lab frame");
  }
  await frame.evaluate(() => {
    const current = window as unknown as RetentionWindow;
    current.tracked = [];
    current.control = [];
    for (let index = 0; index < 100; index += 1) {
      const tracked = document.createElement("div");
      tracked.addEventListener("click", () => {});
      document.body.append(tracked);
      tracked.remove();
      current.tracked.push(new WeakRef(tracked));
      current.control.push(new WeakRef(document.createElement("div")));
    }
  });
  const session = await page.context().newCDPSession(page);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await frame.evaluate(
      () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
    );
    await session.send("HeapProfiler.collectGarbage");
  }
  const retained = await frame.evaluate(() => {
    const current = window as unknown as RetentionWindow;
    return {
      tracked: current.tracked.filter((reference) => reference.deref()).length,
      control: current.control.filter((reference) => reference.deref()).length,
    };
  });
  await session.detach();
  expect(retained).toEqual({ tracked: 0, control: 0 });
});

test("HTML controls in a closed shadow root retain pointer interaction", async ({ page }) => {
  await page.goto("/");
  const id = await insertWidget(page);
  const block = page.locator(`[data-block-id="${id}"]`);
  await block.evaluate((element) => element.scrollIntoView({ block: "center" }));
  const frame = page.frameLocator('iframe[name="Interaction lab"]');
  await frame.locator("body").evaluate((body) => {
    const host = document.createElement("div");
    host.id = "shadow-control";
    host.style.cssText = "display:block;width:160px;height:40px";
    const shadow = host.attachShadow({ mode: "closed" });
    const control = document.createElement("div");
    control.style.cssText = "width:160px;height:40px;background:#ddd";
    control.addEventListener("click", () => {
      host.dataset.clicked = "true";
    });
    shadow.append(control);
    body.append(host);
  });
  const host = frame.locator("#shadow-control");
  await host.click();
  await expect(host).toHaveAttribute("data-clicked", "true");
  await expect(block).not.toHaveAttribute("data-block-selected", "true");
});

test("HTML canvas widgets keep native drag and drop inside the element", async ({ page }) => {
  await page.goto("/");
  const id = await page.evaluate((source) => {
    const editor = (window as unknown as DemoWindow).__rivtoDemo.editor;
    return editor.elements.insertElement({
      type: "html",
      frame: { x: 4000, y: 80, width: 240, height: 230 },
      zIndex: 999,
      props: { label: "Canvas interaction lab", html: source },
    }).id;
  }, WIDGET);
  await page.locator('[data-editor-mode="edgeless"]').click();
  await panToElement(page, id);
  const frame = page.frameLocator('iframe[name="Canvas interaction lab"]');
  await expect(frame.locator("#drag")).toBeVisible();
  const before = await page.evaluate(
    (elementId) =>
      (window as unknown as DemoWindow).__rivtoDemo.editor.elements.getElementNode(elementId)
        ?.frame,
    id,
  );
  await dragBetween(
    page,
    (await frame.locator("#drag").boundingBox())!,
    (await frame.locator("#drop").boundingBox())!,
  );
  await expect
    .poll(() =>
      page.evaluate(
        (elementId) =>
          (window as unknown as DemoWindow).__rivtoDemo.editor.elements.getElementNode(elementId)
            ?.props.dropped,
        id,
      ),
    )
    .toBe("moved");
  expect(
    await page.evaluate(
      (elementId) =>
        (window as unknown as DemoWindow).__rivtoDemo.editor.elements.getElementNode(elementId)
          ?.frame,
      id,
    ),
  ).toEqual(before);
});

test("HTML blocks inside canvas cards keep their own drag and drop", async ({ page }) => {
  await page.goto("/");
  const ids = await prepareWidgetCard(page);
  await page.locator('[data-editor-mode="edgeless"]').click();
  await panToElement(page, ids.card);
  const frame = page.frameLocator('iframe[name="Card interaction lab"]');
  await expect(frame.locator("#drag")).toBeVisible();
  await expect(frame.locator("#drop")).toBeVisible();
  const before = await readElementFrame(page, ids.card);
  await dragBetween(
    page,
    (await frame.locator("#drag").boundingBox())!,
    (await frame.locator("#drop").boundingBox())!,
  );
  await expect
    .poll(() =>
      page.evaluate(
        (blockId) =>
          (window as unknown as DemoWindow).__rivtoDemo.editor.blocks.getBlockNode(blockId)?.props
            .dropped,
        ids.block,
      ),
    )
    .toBe("moved");
  const after = await readElementFrame(page, ids.card);
  expect({ x: after?.x, y: after?.y }).toEqual({ x: before?.x, y: before?.y });
  await expect(page.locator(`[data-block-id="${ids.block}"]`)).not.toHaveAttribute(
    "data-block-selected",
    "true",
  );
});

test("HTML widget inputs keep slider and clipboard interactions inside Page", async ({ page }) => {
  await page.goto("/");
  const id = await insertWidget(page);
  const block = page.locator(`[data-block-id="${id}"]`);
  await block.scrollIntoViewIfNeeded();
  const frame = page.frameLocator('iframe[name="Interaction lab"]');
  await expect(block.locator("iframe")).toHaveAttribute("sandbox", "allow-scripts allow-forms");
  const sandbox = page.frame({ name: "Interaction lab" });
  if (!sandbox) {
    throw new Error("Missing interaction lab frame");
  }
  expect(
    await sandbox.evaluate(() => {
      try {
        return Boolean(parent.document);
      } catch {
        return false;
      }
    }),
  ).toBe(false);
  const slider = frame.getByRole("slider", { name: "Level" });
  await slider.focus();
  await page.keyboard.press("ArrowRight");
  await expect(slider).toHaveValue("26");
  const note = frame.getByRole("textbox", { name: "Note", exact: true });
  await note.click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("ControlOrMeta+x");
  await expect(note).toHaveValue("");
  await page.keyboard.press("ControlOrMeta+v");
  await expect(note).toHaveValue("hello");
  await note.fill("https://example.com/image.png");
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("ControlOrMeta+c");
  const rich = frame.getByRole("textbox", { name: "Rich note" });
  await rich.click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("ControlOrMeta+v");
  await expect(rich).toHaveText("https://example.com/image.png");
  await expect(frame.locator("img")).toHaveCount(0);
  await expect(block).not.toHaveAttribute("data-block-selected", "true");
});

test("copying an HTML block preserves its source and widget data", async ({ page }) => {
  await page.goto("/");
  const id = await insertWidget(page);
  const block = page.locator(`[data-block-id="${id}"]`);
  await block.evaluate((element) => element.scrollIntoView({ block: "center" }));
  const backgrounds = block.locator("[data-rivto-embedded-drag-handle]");
  await expect.poll(() => backgrounds.count()).toBeGreaterThan(1);
  await backgrounds.nth(1).click({ modifiers: ["Control"] });
  await expect(block).toHaveAttribute("data-block-selected", "true");
  await page.keyboard.press("ControlOrMeta+c");
  await page.keyboard.press("ControlOrMeta+v");
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as unknown as DemoWindow).__rivtoDemo.editor.blocks
          .getBlocks()
          .filter((item) => item.type === "html" && item.props.label === "Interaction lab")
          .map((item) => ({ content: item.content, fixture: item.props.fixture })),
      ),
    )
    .toEqual([
      { content: WIDGET, fixture: "retained" },
      { content: WIDGET, fixture: "retained" },
    ]);
});

test("priority board reorders tasks, pastes a task, and undoes changes", async ({ page }) => {
  await page.goto("/");
  const id = await page.evaluate(() => {
    const editor = (window as unknown as DemoWindow).__rivtoDemo.editor;
    const block = editor.blocks.getBlocks().find((item) => item.props.sample === "priorities");
    if (!block) {
      throw new Error("Missing priority board");
    }
    editor.history.clear();
    return block.id;
  });
  const block = page.locator(`[data-block-id="${id}"]`);
  await block.evaluate((element) => element.scrollIntoView({ block: "center" }));
  const frame = page.frameLocator('iframe[name="Priority board"]');
  const rows = frame.locator(".item");
  await expect(rows).toHaveCount(3);
  await expect(rows.first()).toBeVisible();
  await expect(rows.last()).toBeVisible();
  await dragBetween(page, (await rows.nth(0).boundingBox())!, (await rows.nth(2).boundingBox())!);
  await expect
    .poll(() =>
      page.evaluate(
        (blockId) =>
          (window as unknown as DemoWindow).__rivtoDemo.editor.blocks.getBlockNode(blockId)?.props
            .items,
        id,
      ),
    )
    .toEqual(["Build", "Review", "Plan"]);
  await expect(block).not.toHaveAttribute("data-block-selected", "true");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(rows.locator(".name")).toHaveText(["Plan", "Build", "Review"]);
  const input = frame.getByRole("textbox", { name: "New task" });
  await input.fill("Paste task");
  await input.click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("ControlOrMeta+x");
  await expect(input).toHaveValue("");
  await page.keyboard.press("ControlOrMeta+v");
  await expect(input).toHaveValue("Paste task");
  await frame.getByRole("button", { name: "Add", exact: true }).click();
  await expect(rows.locator(".name")).toHaveText(["Plan", "Build", "Review", "Paste task"]);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(rows.locator(".name")).toHaveText(["Plan", "Build", "Review"]);
});

test("priority board adds a typed task", async ({ page }) => {
  await page.goto("/");
  const frame = page.frameLocator('iframe[name="Priority board"]');
  await page.locator('[data-html-label="Priority board"]').scrollIntoViewIfNeeded();
  await frame.getByRole("textbox", { name: "New task" }).fill("Typed task");
  await frame.getByRole("button", { name: "Add", exact: true }).click();
  await expect(frame.locator(".item .name")).toContainText(["Typed task"]);
  await frame.getByRole("textbox", { name: "New task" }).fill("Keyboard task");
  await frame.getByRole("textbox", { name: "New task" }).press("Enter");
  await expect(frame.locator(".item .name")).toContainText(["Keyboard task"]);
});

test("priority board keeps keyboard focus when a task is reordered", async ({ page }) => {
  await page.goto("/");
  await page.locator('[data-html-label="Priority board"]').scrollIntoViewIfNeeded();
  const frame = page.frameLocator('iframe[name="Priority board"]');
  const move = frame.getByRole("button", { name: "Move down Plan" });
  await move.focus();
  await page.keyboard.press("Enter");
  await expect(frame.locator(".item .name")).toHaveText(["Build", "Plan", "Review"]);
  await expect(move).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(frame.locator(".item .name")).toHaveText(["Build", "Review", "Plan"]);
  await expect(frame.getByRole("button", { name: "Move up Plan" })).toBeFocused();
});

test("canvas mixer responds to slider and playback without moving the element", async ({
  page,
}) => {
  await page.goto("/");
  const id = await page.evaluate(() => {
    const editor = (window as unknown as DemoWindow).__rivtoDemo.editor;
    const element = editor.elements.getElementNodes().find((item) => item.props.sample === "mixer");
    if (!element) {
      throw new Error("Missing sound mixer");
    }
    editor.history.clear();
    return element.id;
  });
  await page.locator('[data-editor-mode="edgeless"]').click();
  await panToElement(page, id);
  const frame = page.frameLocator('iframe[name="Sound mixer"]');
  const slider = frame.getByRole("slider", { name: "Volume" });
  await expect(slider).toHaveValue("40");
  const before = await readElementFrame(page, id);
  const box = (await slider.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height / 2, { steps: 6 });
  await expect.poll(async () => Number(await slider.inputValue())).toBeGreaterThan(60);
  expect(await readElementProp(page, id, "volume")).toBe(40);
  await page.mouse.up();
  await expect
    .poll(async () => Number(await readElementProp(page, id, "volume")))
    .toBeGreaterThan(60);
  await frame.getByRole("button", { name: "Play" }).click();
  await expect(frame.getByRole("button", { name: "Pause" })).toBeVisible();
  expect(await readElementFrame(page, id)).toEqual(before);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(frame.getByRole("button", { name: "Play" })).toBeVisible();
});

test("the same mixer works as a Page block", async ({ page }) => {
  await page.goto("/");
  const id = await page.evaluate(() => {
    const block = (window as unknown as DemoWindow).__rivtoDemo.editor.blocks
      .getBlocks()
      .find((item) => item.props.sample === "mixer-block");
    if (!block) {
      throw new Error("Missing Page mixer");
    }
    return block.id;
  });
  const block = page.locator(`[data-block-id="${id}"]`);
  await block.evaluate((element) => element.scrollIntoView({ block: "center" }));
  const frame = page.frameLocator('iframe[name="Page mixer"]');
  const slider = frame.getByRole("slider", { name: "Volume" });
  await expect(slider).toHaveValue("40");
  await slider.focus();
  await page.keyboard.press("ArrowRight");
  await expect
    .poll(() =>
      page.evaluate(
        (blockId) =>
          (window as unknown as DemoWindow).__rivtoDemo.editor.blocks.getBlockNode(blockId)?.props
            .volume,
        id,
      ),
    )
    .toBe(41);
  await frame.getByRole("button", { name: "Play" }).click();
  await expect(frame.getByRole("button", { name: "Pause" })).toBeVisible();
  await expect(block).not.toHaveAttribute("data-block-selected", "true");
});

test("the same priority board works as an HTML canvas element", async ({ page }) => {
  await page.goto("/");
  const id = await page.evaluate(() => {
    const element = (window as unknown as DemoWindow).__rivtoDemo.editor.elements
      .getElementNodes()
      .find((item) => item.props.sample === "priorities-element");
    if (!element) {
      throw new Error("Missing canvas priorities");
    }
    return element.id;
  });
  await page.locator('[data-editor-mode="edgeless"]').click();
  await panToElement(page, id);
  const frame = page.frameLocator('iframe[name="Canvas priorities"]');
  const rows = frame.locator(".item");
  await expect(rows.first()).toBeVisible();
  await expect(rows.last()).toBeVisible();
  const before = await page.evaluate(
    (elementId) =>
      (window as unknown as DemoWindow).__rivtoDemo.editor.elements.getElementNode(elementId)
        ?.frame,
    id,
  );
  await dragBetween(page, (await rows.first().boundingBox())!, (await rows.last().boundingBox())!);
  await expect(rows.locator(".name")).toHaveText(["Create", "Share", "Sketch"]);
  await frame.getByRole("textbox", { name: "New task" }).fill("Finish");
  await frame.getByRole("button", { name: "Add", exact: true }).click();
  await expect(rows.locator(".name")).toHaveText(["Create", "Share", "Sketch", "Finish"]);
  expect(
    await page.evaluate(
      (elementId) =>
        (window as unknown as DemoWindow).__rivtoDemo.editor.elements.getElementNode(elementId)
          ?.frame,
      id,
    ),
  ).toEqual(before);
});
