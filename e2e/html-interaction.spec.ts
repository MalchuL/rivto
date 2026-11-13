import { expect, test, type FrameLocator, type Locator, type Page } from "@playwright/test";
import type { DocumentEditorAPI } from "@chulane/rivto";
import type { ReactEditorApi } from "@chulane/rivto-react";
import type { EmbeddedContentContext, HtmlNodeView } from "@chulane/rivto-react";

interface DemoWindow extends Window {
  __rivtoDemo: { editor: DocumentEditorAPI; reactEditor: ReactEditorApi };
}

interface WidgetWindow extends Window {
  selectionChanges: boolean[];
  nodeChanges: number;
  rivto: {
    context: { mode: string; selected: boolean; preview: boolean };
    props: { label: string; count?: number };
    /**
     * Observes snapshots published to this sandbox.
     *
     * @param listener - Called with each subsequent node snapshot.
     * @returns A disposer removing the listener.
     */
    subscribe(listener: (node: HtmlNodeView) => void): () => void;
    /**
     * Observes presentation state changes in this sandbox.
     *
     * @param listener - Called with each changed context.
     * @returns A disposer removing the listener.
     */
    subscribeContext(listener: (context: EmbeddedContentContext) => void): () => void;
  };
}

for (const type of ["html", "unsafe-html"] as const) {
  test(`clicking ${type} preview does not select its Page block`, async ({ page }) => {
    await page.goto("/");
    const id = await page.evaluate(
      (blockType) =>
        (window as unknown as DemoWindow).__rivtoDemo.editor.blocks.insertBlock({
          type: blockType,
          content: "<p>Plain preview</p>",
          props: { label: "Click preview" },
        }).id,
      type,
    );
    const block = page.locator(`[data-block-id="${id}"]`);
    await block.scrollIntoViewIfNeeded();
    await page
      .frameLocator('iframe[name="Click preview"]')
      .getByText("Plain preview")
      .click({
        position: { x: 5, y: 8 },
      });
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await expect(block).not.toHaveAttribute("data-block-selected", "true");
    const background = block.locator("[data-rivto-embedded-drag-handle]").first();
    await background.click();
    await expect(block).not.toHaveAttribute("data-block-selected", "true");
    await background.click({ modifiers: ["Control"] });
    await expect(block).toHaveAttribute("data-block-selected", "true");
    await background.click({ modifiers: ["Control"] });
    await expect(block).not.toHaveAttribute("data-block-selected", "true");
    const sandbox = page.frame({ name: "Click preview" });
    if (!sandbox) {
      throw new Error("Missing HTML frame");
    }
    await expect
      .poll(() => sandbox.evaluate(() => (window as unknown as WidgetWindow).rivto.context))
      .toEqual({ mode: "block", selected: false, preview: false });
    await expect
      .poll(() => sandbox.evaluate(() => (window as unknown as WidgetWindow).rivto.props.label))
      .toBe("Click preview");
  });
}

test("Page dragging continues over an HTML frame", async ({ page }) => {
  await page.goto("/?test_features=1");
  await page.evaluate(() => {
    const editor = (window as unknown as DemoWindow).__rivtoDemo.editor;
    editor.load({ ...editor.dump(), blocks: [], elements: [], rootElementIds: [] });
    editor.blocks.insertBlock({
      id: "gesture-source",
      type: "paragraph",
      content: "Gesture source",
    });
    editor.blocks.insertBlock({
      id: "gesture-html",
      type: "html",
      content: '<div style="height:120px">Embedded</div>',
      props: { label: "Gesture HTML" },
    });
  });
  const source = page.locator('[data-block-id="gesture-source"]');
  const target = page.locator('[data-block-id="gesture-html"]');
  await source.locator(":scope > .rivto-block-row").hover();
  const handle = (await source.locator(".block-handle").boundingBox())!;
  const frame = (await target.locator("iframe").boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(frame.x + frame.width / 2, frame.y + frame.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator(".rivto-block-drag-preview")).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as unknown as DemoWindow).__rivtoDemo.editor.blocks.getParentId("gesture-source"),
      ),
    )
    .toBe("gesture-html");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as DemoWindow).__rivtoDemo.editor.blocks.getParentId(
            "gesture-source",
          ) ?? null,
      ),
    )
    .toBeNull();
});

test("Page selection continues over an HTML frame", async ({ page }) => {
  await page.goto("/?test_features=1");
  await page.evaluate(() => {
    const editor = (window as unknown as DemoWindow).__rivtoDemo.editor;
    editor.load({ ...editor.dump(), blocks: [], elements: [], rootElementIds: [] });
    editor.blocks.insertBlock({
      id: "selection-source",
      type: "paragraph",
      content: "Selection source",
    });
    editor.blocks.insertBlock({
      id: "selection-html",
      type: "html",
      content: '<div style="height:120px">Embedded</div>',
      props: { label: "Selection HTML" },
    });
  });
  const source = page.locator('[data-block-id="selection-source"]');
  const target = page.locator('[data-block-id="selection-html"]');
  const text = (await source.locator("[data-block-content]").boundingBox())!;
  const frame = (await target.locator("iframe").boundingBox())!;
  await page.mouse.move(text.x + 10, text.y + text.height / 2);
  await page.mouse.down();
  await page.mouse.move(frame.x + frame.width / 2, frame.y + frame.height / 2, { steps: 8 });
  await page.mouse.move(frame.x + frame.width / 2 + 1, frame.y + frame.height / 2);
  await expect(target).toHaveAttribute("data-block-selected", "true");
  await page.mouse.up();
  await expect(target).toHaveAttribute("data-block-selected", "true");
  const background = (await target
    .locator("[data-rivto-embedded-drag-handle]")
    .first()
    .boundingBox())!;
  await page.mouse.move(background.x + background.width / 2, background.y + background.height / 2);
  await page.mouse.down();
  await page.mouse.move(text.x + 10, text.y + text.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(source).toHaveAttribute("data-block-selected", "true");
  await expect(target).toHaveAttribute("data-block-selected", "true");
});

test("Page drag regions keep ordinary click and modifier selection behavior", async ({ page }) => {
  await page.goto("/");
  const id = await page.evaluate(
    () =>
      (window as unknown as DemoWindow).__rivtoDemo.editor.blocks.insertBlock({
        type: "html",
        content: '<div data-rivto-drag-handle style="height:40px">Handle</div>',
        props: { label: "Page drag region" },
      }).id,
  );
  const block = page.locator(`[data-block-id="${id}"]`);
  await block.scrollIntoViewIfNeeded();
  const handle = block.locator("[data-rivto-embedded-drag-handle]");
  await handle.click();
  await expect(block).not.toHaveAttribute("data-block-selected", "true");
  const sandbox = page.frame({ name: "Page drag region" });
  if (!sandbox) {
    throw new Error("Missing Page drag region frame");
  }
  await sandbox.evaluate(() => {
    const widget = window as unknown as WidgetWindow;
    widget.selectionChanges = [];
    widget.nodeChanges = 0;
    widget.rivto.subscribe(() => {
      widget.nodeChanges += 1;
    });
    widget.rivto.subscribeContext((context) => widget.selectionChanges.push(context.selected));
  });
  await handle.click({ modifiers: ["Control"] });
  await expect(block).toHaveAttribute("data-block-selected", "true");
  await expect
    .poll(() => sandbox.evaluate(() => (window as unknown as WidgetWindow).rivto.context.selected))
    .toBe(true);
  await expect
    .poll(() => sandbox.evaluate(() => (window as unknown as WidgetWindow).selectionChanges))
    .toContain(true);
  await handle.click({ modifiers: ["Control"] });
  await expect(block).not.toHaveAttribute("data-block-selected", "true");
  await expect
    .poll(() => sandbox.evaluate(() => (window as unknown as WidgetWindow).selectionChanges))
    .toContain(false);
  expect(await sandbox.evaluate(() => (window as unknown as WidgetWindow).nodeChanges)).toBe(0);
  await page.evaluate(() => {
    const demo = (window as unknown as DemoWindow).__rivtoDemo;
    demo.reactEditor.keyboard.setKeymapOverride("selection.block-modifier-down", ["Alt"]);
  });
  await handle.click({ modifiers: ["Alt"] });
  await expect(block).toHaveAttribute("data-block-selected", "true");
});

test("HTML drag regions retain block interaction inside a container", async ({ page }) => {
  await page.goto("/");
  const id = await page.evaluate(() => {
    const board = (window as unknown as DemoWindow).__rivtoDemo.editor.blocks.insertBlock({
      type: "bento",
      children: [
        {
          type: "html",
          content: '<div data-rivto-drag-handle style="height:40px">Handle</div>',
          props: { label: "Nested HTML" },
        },
      ],
    });
    return board.children[0]!.id;
  });
  const block = page.locator(`[data-block-id="${id}"]`);
  await block.scrollIntoViewIfNeeded();
  const handle = block.locator("[data-rivto-embedded-drag-handle]");
  await handle.click();
  await expect(block).not.toHaveAttribute("data-block-selected", "true");
  await handle.click({ modifiers: ["Control"] });
  await expect(block).toHaveAttribute("data-block-selected", "true");
});

test("dragging the clock inside its iframe moves the canvas element", async ({ page }) => {
  await page.goto("/");
  await page.locator('[data-editor-mode="edgeless"]').click();
  await panToHtmlElement(page, "clock");
  const host = page.locator('[data-edgeless-visual-kind="html"]').filter({
    has: page.locator('[data-html-label="Clock"]'),
  });
  const frame = host.locator("iframe");
  await expect(host.locator("[data-rivto-embedded-drag-handle]")).toBeVisible();
  const before = await host.boundingBox();
  const box = await frame.boundingBox();
  const id = await host.getAttribute("data-edgeless-object-id");
  if (!before || !box || !id) {
    throw new Error("Missing clock geometry");
  }
  const originalX = await readElementX(page, id);
  const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 80, start.y + 50);
  await expect.poll(async () => (await host.boundingBox())?.x).toBeGreaterThan(before.x + 40);
  expect(await readElementX(page, id)).toBe(originalX);
  await page.mouse.up();
  await expect.poll(() => readElementX(page, id)).not.toBe(originalX);
  const sandbox = page.frame({ name: "Clock" });
  if (!sandbox) {
    throw new Error("Missing clock frame");
  }
  await expect
    .poll(() => sandbox.evaluate(() => (window as unknown as WidgetWindow).rivto.context))
    .toEqual({ mode: "edgeless", selected: true, preview: false });
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(async () => (await host.boundingBox())?.x).toBeCloseTo(before.x);
  await expect.poll(() => readElementX(page, id)).toBe(originalX);
});

test("dragging an unmarked HTML canvas background moves the element", async ({ page }) => {
  await page.goto("/");
  await page.locator('[data-editor-mode="edgeless"]').click();
  await panToHtmlElement(page, "circle");
  const host = page.locator('[data-edgeless-visual-kind="html"]').filter({
    has: page.locator('[data-html-label="Focus"]'),
  });
  const frame = (await host.locator("iframe").boundingBox())!;
  const id = (await host.getAttribute("data-edgeless-object-id"))!;
  const originalX = await readElementX(page, id);
  await page.mouse.move(frame.x + 15, frame.y + 15);
  await page.mouse.down();
  await page.mouse.move(frame.x + 95, frame.y + 65);
  await page.mouse.up();
  await expect.poll(() => readElementX(page, id)).not.toBe(originalX);
});

test("scripted HTML controls keep clicks while the background can be dragged", async ({ page }) => {
  await page.goto("/");
  const id = await page.evaluate(
    () =>
      (window as unknown as DemoWindow).__rivtoDemo.editor.elements.insertElement({
        type: "html",
        frame: { x: 4000, y: 80, width: 220, height: 120 },
        zIndex: 999,
        props: {
          sample: "scripted-control",
          label: "Scripted control",
          html: '<div id="action" style="width:80px;height:40px;background:red"></div><script>document.getElementById("action").addEventListener("click", function () { rivto.setProp("clicked", true); });</script>',
        },
      }).id,
  );
  await page.locator('[data-editor-mode="edgeless"]').click();
  await panToHtmlElement(page, "scripted-control");
  const frame = page.frameLocator('iframe[name="Scripted control"]');
  await frame.locator("#action").click();
  await expect
    .poll(() =>
      page.evaluate(
        (elementId) =>
          (window as unknown as DemoWindow).__rivtoDemo.editor.elements.getElementNode(elementId)
            ?.props.clicked,
        id,
      ),
    )
    .toBe(true);
  const box = (await page.locator('iframe[name="Scripted control"]').boundingBox())!;
  const originalX = await readElementX(page, id);
  await page.mouse.move(box.x + 150, box.y + 80);
  await page.mouse.down();
  await page.mouse.move(box.x + 200, box.y + 100);
  await page.mouse.up();
  await expect.poll(() => readElementX(page, id)).not.toBe(originalX);
});

test("clock border drag continues across its iframe", async ({ page }) => {
  await page.goto("/");
  const id = await page.evaluate(() => {
    const editor = (window as unknown as DemoWindow).__rivtoDemo.editor;
    const clock = editor.elements.getElementNodes().find((item) => item.props.sample === "clock");
    if (!clock) {
      throw new Error("Missing clock");
    }
    editor.elements.updateElement(clock.id, { frame: { x: 4000, y: 80 } });
    return clock.id;
  });
  await page.locator('[data-editor-mode="edgeless"]').click();
  await panToHtmlElement(page, "clock");
  const host = page.locator(`[data-edgeless-object-id="${id}"]`);
  await host.locator("[data-rivto-embedded-drag-handle]").click();
  const edge = page.locator(
    `[data-edgeless-controls-for="${id}"] .moveable-edgeDraggable[data-direction="w"]`,
  );
  await expect(edge).toBeVisible();
  const box = await edge.boundingBox();
  const original = await readElementX(page, id);
  if (!box || original === undefined) {
    throw new Error("Missing clock border geometry");
  }
  await page.keyboard.down("Alt");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 4);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 50, box.y + box.height / 4 + 20);
  await page.mouse.up();
  await page.keyboard.up("Alt");
  await expect.poll(() => readElementX(page, id)).toBeGreaterThan(original + 20);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(() => readElementX(page, id)).toBe(original);
});

test("clock drag region moves its selected group and undoes together", async ({ page }) => {
  await page.goto("/");
  await page.locator('[data-editor-mode="edgeless"]').click();
  const ids = await page.evaluate(() => {
    const editor = (window as unknown as DemoWindow).__rivtoDemo.editor;
    const circle = editor.elements.getElementNodes().find((item) => item.props.sample === "circle");
    const clock = editor.elements.getElementNodes().find((item) => item.props.sample === "clock");
    if (!circle || !clock) {
      throw new Error("Missing group samples");
    }
    editor.commands.execute("edgeless.selection.set", [circle.id, clock.id]);
    editor.commands.execute("edgeless.selection.group");
    editor.commands.execute("edgeless.selection.clear");
    return { circle: circle.id, clock: clock.id };
  });
  await panToHtmlElement(page, "clock");
  const clock = page.locator(`[data-edgeless-object-id="${ids.clock}"]`);
  const handle = clock.locator("[data-rivto-embedded-drag-handle]");
  await expect(handle).toBeVisible();
  const box = await handle.boundingBox();
  const before = {
    circle: await readElementX(page, ids.circle),
    clock: await readElementX(page, ids.clock),
  };
  if (!box || before.circle === undefined || before.clock === undefined) {
    throw new Error("Missing grouped clock geometry");
  }
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 70, box.y + box.height / 2 + 20);
  expect(await readElementX(page, ids.circle)).toBe(before.circle);
  await page.mouse.up();
  await expect.poll(() => readElementX(page, ids.circle)).toBeGreaterThan(before.circle);
  await expect.poll(() => readElementX(page, ids.clock)).toBeGreaterThan(before.clock);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(() => readElementX(page, ids.circle)).toBe(before.circle);
  await expect.poll(() => readElementX(page, ids.clock)).toBe(before.clock);
});

test("new HTML elements provide a drag region without covering their text", async ({ page }) => {
  await page.goto("/");
  const id = await page.evaluate(
    () =>
      (window as unknown as DemoWindow).__rivtoDemo.editor.elements.insertElement({
        type: "html",
        frame: { x: 50000, y: 80, width: 220, height: 120 },
        zIndex: 999,
        props: { sample: "starter", label: "Starter" },
      }).id,
  );
  await page.locator('[data-editor-mode="edgeless"]').click();
  await panToHtmlElement(page, "starter");
  const host = page.locator(`[data-edgeless-object-id="${id}"]`);
  const handle = host.locator("[data-rivto-embedded-drag-handle]");
  await expect(handle).toBeVisible();
  const frame = page.frameLocator('iframe[name="Starter"]');
  await expect(frame.getByText("Starter")).toBeVisible();
  const text = await frame.locator("#label").evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element.firstChild!);
    const rect = range.getBoundingClientRect();
    const box = element.getBoundingClientRect();
    return { x: rect.left - box.left + rect.width / 2, y: rect.top - box.top + rect.height / 2 };
  });
  await frame.locator("#label").dblclick({ position: text });
  await expect
    .poll(() => frame.locator("#label").evaluate(() => window.getSelection()?.toString()))
    .toBe("Starter");
  const before = await host.boundingBox();
  const box = await handle.boundingBox();
  if (!before || !box) {
    throw new Error("Missing starter drag region");
  }
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 20);
  await page.mouse.up();
  await expect.poll(async () => (await host.boundingBox())?.x).toBeGreaterThan(before.x + 30);
});

test("HTML placement preview exposes preview context without active drag regions", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator('[data-editor-mode="edgeless"]').click();
  const count = await page.evaluate(
    () => (window as unknown as DemoWindow).__rivtoDemo.editor.elements.getElementNodes().length,
  );
  const toolbar = page.getByRole("toolbar", { name: "Visual objects" });
  await toolbar.getByRole("button", { name: "HTML", exact: true }).click();
  const viewport = await page.locator(".edgeless-viewport").boundingBox();
  if (!viewport) {
    throw new Error("Missing canvas viewport");
  }
  await page.mouse.move(viewport.x + 600, viewport.y + 200);
  const preview = page.locator('[data-edgeless-creation-preview="html"]');
  await expect(preview).toBeVisible();
  await expect(preview).toHaveAttribute("inert", "");
  await expect(preview.locator("[data-rivto-embedded-drag-handle]")).toHaveCount(0);
  const frame = page.frameLocator('[data-edgeless-creation-preview="html"] iframe');
  await expect
    .poll(() =>
      frame.locator("body").evaluate(() => (window as unknown as WidgetWindow).rivto.context),
    )
    .toEqual({ mode: "edgeless", selected: false, preview: true });
  await page.keyboard.press("Escape");
  await expect(preview).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as DemoWindow).__rivtoDemo.editor.elements.getElementNodes().length,
      ),
    )
    .toBe(count);
});

/**
 * Inserts a canvas widget with a drag region and a separate native button.
 *
 * @param page - Demo page containing the editor.
 * @returns The inserted element's stable ID.
 */
async function createDragControl(page: Page): Promise<string> {
  return page.evaluate(
    () =>
      (window as unknown as DemoWindow).__rivtoDemo.editor.elements.insertElement({
        type: "html",
        frame: { x: 4000, y: 80, width: 220, height: 120 },
        zIndex: 999,
        props: {
          sample: "drag-control",
          label: "Drag control",
          count: 0,
          html: '<div style="height:20px;overflow:hidden"><div id="grip" data-rivto-drag-handle style="height:45px;background:#ddd"></div></div><button onclick="rivto.setProp(\'count\', 1)">Activate</button>',
        },
      }).id,
  );
}

/**
 * Replaces a widget's HTML source through the document manager.
 *
 * @param page - Demo page containing the editor.
 * @param id - Persisted widget to update.
 * @returns The replacement has been committed to the document.
 */
async function replaceDragControlSource(page: Page, id: string): Promise<void> {
  await page.evaluate((elementId) => {
    (window as unknown as DemoWindow).__rivtoDemo.editor.elements.updateElement(elementId, {
      props: { html: "<p>Replacement</p>" },
    });
  }, id);
}

/**
 * Checks that hidden and removed authored regions stop receiving host input.
 *
 * @param frame - Sandbox containing the authored region.
 * @param handle - Host pointer target projected from that region.
 * @returns The restored region is visible again.
 */
async function checkDragRegionChanges(frame: FrameLocator, handle: Locator): Promise<void> {
  const grip = frame.locator("#grip");
  const before = await handle.boundingBox();
  if (!before) {
    throw new Error("Missing initial drag region");
  }
  await grip.evaluate((element) => {
    if (element.parentElement) {
      element.parentElement.style.height = "10px";
    }
  });
  await expect
    .poll(async () => (await handle.boundingBox())?.height)
    .toBeLessThan(before.height - 5);
  await grip.evaluate((element) => {
    if (element.parentElement) {
      element.parentElement.style.height = "20px";
    }
  });
  await expect.poll(async () => (await handle.boundingBox())?.height).toBeCloseTo(before.height);
  await grip.evaluate((element) => {
    element.style.visibility = "hidden";
  });
  await expect(handle).toHaveCount(0);
  await grip.evaluate((element) => {
    element.style.visibility = "visible";
  });
  await expect(handle).toBeVisible();
  await grip.evaluate((element) => element.removeAttribute("data-rivto-drag-handle"));
  await expect.poll(() => handle.count()).toBeGreaterThan(0);
  await grip.evaluate((element) => element.setAttribute("data-rivto-drag-handle", ""));
  await expect(handle).toHaveCount(1);
  await expect(handle).toBeVisible();
}

test("HTML drag regions coexist with native controls and follow markup changes", async ({
  page,
}) => {
  await page.goto("/");
  const id = await createDragControl(page);
  await page.locator('[data-editor-mode="edgeless"]').click();
  await panToHtmlElement(page, "drag-control");
  const host = page.locator(`[data-edgeless-object-id="${id}"]`);
  const handle = host.locator("[data-rivto-embedded-drag-handle]");
  await expect(handle).toBeVisible();
  const frame = page.frameLocator('iframe[name="Drag control"]');
  await frame.getByRole("button", { name: "Activate" }).click();
  await expect
    .poll(() =>
      page.evaluate(
        (elementId) =>
          (window as unknown as DemoWindow).__rivtoDemo.editor.elements.getElementNode(elementId)
            ?.props.count,
        id,
      ),
    )
    .toBe(1);
  await expect
    .poll(() =>
      frame.locator("button").evaluate(() => (window as unknown as WidgetWindow).rivto.props.count),
    )
    .toBe(1);
  await checkDragRegionChanges(frame, handle);
  const before = await host.boundingBox();
  const box = await handle.boundingBox();
  if (!before || !box) {
    throw new Error("Missing HTML drag region geometry");
  }
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 20);
  await page.mouse.up();
  await expect.poll(async () => (await host.boundingBox())?.x).toBeGreaterThan(before.x + 30);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(async () => (await host.boundingBox())?.x).toBeCloseTo(before.x);
  await replaceDragControlSource(page, id);
  await expect.poll(() => handle.count()).toBeGreaterThan(0);
  await expect(frame.getByText("Replacement")).toBeVisible();
});

test("canvas marquee ends when released over an HTML iframe", async ({ page }) => {
  await page.goto("/");
  await page.locator('[data-editor-mode="edgeless"]').click();
  await panToHtmlElement(page, "tally");
  const frame = page.locator('iframe[name="Tea"]');
  const box = await frame.boundingBox();
  if (!box) {
    throw new Error("Missing iframe geometry");
  }
  await page.mouse.move(box.x + 30, box.y - 25);
  await page.mouse.down();
  await page.mouse.move(box.x + 35, box.y - 10, { steps: 4 });
  const marquee = page.locator("[data-edgeless-selection-rectangle]");
  await expect(marquee).toBeVisible();
  await page.mouse.move(box.x + 30, box.y + 35, { steps: 4 });
  await page.mouse.up();
  await expect(marquee).toBeHidden();
  await page.mouse.move(box.x - 15, box.y + 50);
  await expect(marquee).toBeHidden();
});

test("fast canvas drag commits after the pointer crosses an HTML iframe", async ({ page }) => {
  await page.goto("/");
  const id = await page.evaluate(() => {
    const editor = (window as unknown as DemoWindow).__rivtoDemo.editor;
    const tally = editor.elements.getElementNodes().find((item) => item.props.sample === "tally");
    if (!tally) {
      throw new Error("Missing HTML element");
    }
    return editor.elements.insertElement({
      type: "rectangle",
      frame: { x: tally.frame.x, y: tally.frame.y - 120, width: 80, height: 60 },
      zIndex: 999,
    }).id;
  });
  await page.locator('[data-editor-mode="edgeless"]').click();
  await panToHtmlElement(page, "tally");
  const shape = page.locator(`[data-edgeless-object-id="${id}"]`);
  const frame = page.locator('iframe[name="Tea"]');
  const before = await shape.boundingBox();
  const target = await frame.boundingBox();
  if (!before || !target) {
    throw new Error("Missing drag geometry");
  }
  const start = { x: before.x + before.width / 2, y: before.y + before.height / 2 };
  const storedY = () =>
    page.evaluate(
      (elementId) =>
        (window as unknown as DemoWindow).__rivtoDemo.editor.elements.getElementNode(elementId)
          ?.frame.y,
      id,
    );
  const originalY = await storedY();
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(target.x + 40, target.y + 40);
  await expect.poll(async () => (await shape.boundingBox())?.y).toBeGreaterThan(before.y + 30);
  expect(await storedY()).toBe(originalY);
  await page.mouse.up();
  await expect.poll(async () => (await shape.boundingBox())?.y).toBeGreaterThan(before.y + 30);
  await expect.poll(storedY).toBeGreaterThan(originalY!);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(async () => (await shape.boundingBox())?.y).toBeCloseTo(before.y);
  await expect.poll(storedY).toBe(originalY);
});

/**
 * Scrolls the field into view and waits until its text is hit-testable in CodeMirror.
 *
 * @param editor - Contenteditable field containing the word.
 * @returns The browser has settled its scroller on visible text.
 */
async function waitForHello(editor: Locator): Promise<void> {
  await editor.scrollIntoViewIfNeeded();
  await expect
    .poll(() =>
      editor.evaluate((element) => {
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        let node: Node | null;
        while ((node = walker.nextNode())) {
          const index = node.textContent?.indexOf("Hello") ?? -1;
          if (index < 0) {
            continue;
          }
          const range = document.createRange();
          range.setStart(node, index);
          range.setEnd(node, index + 1);
          const rect = range.getBoundingClientRect();
          const hit = document.elementFromPoint(rect.left + 1, (rect.top + rect.bottom) / 2);
          return Boolean(hit && element.contains(hit));
        }
        return false;
      }),
    )
    .toBe(true);
}

/**
 * Selects the word Hello by dragging over the actual CodeMirror text.
 *
 * @param page - Page receiving pointer input.
 * @param editor - CodeMirror contenteditable field.
 * @returns The pointer gesture has completed.
 */
async function selectHello(page: Page, editor: Locator): Promise<void> {
  await waitForHello(editor);
  const points = await editor.evaluate((element) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const index = node.textContent?.indexOf("Hello") ?? -1;
      if (index < 0) {
        continue;
      }
      const first = document.createRange();
      first.setStart(node, index);
      first.setEnd(node, index + 1);
      const last = document.createRange();
      last.setStart(node, index + 4);
      last.setEnd(node, index + 5);
      const a = first.getBoundingClientRect();
      const b = last.getBoundingClientRect();
      return { x1: a.left + 1, x2: b.right - 1, y: (a.top + a.bottom) / 2 };
    }
    throw new Error("Missing selection text");
  });
  await page.mouse.move(points.x1, points.y);
  await page.mouse.down();
  await page.mouse.move(points.x2, points.y, { steps: 8 });
  await page.mouse.up();
}

/**
 * Verifies native clipboard actions and restores the selected source text.
 *
 * @param page - Page receiving keyboard input.
 * @param editor - CodeMirror field with Hello selected.
 * @returns The cut text has been pasted back and selected again.
 */
async function verifyNativeClipboard(page: Page, editor: Locator): Promise<void> {
  await page.keyboard.press("ControlOrMeta+c");
  await page.keyboard.press("ControlOrMeta+x");
  await expect(editor).not.toContainText("Hello");
  await page.keyboard.press("ControlOrMeta+v");
  await expect(editor).toContainText("Hello selection world");
  await selectHello(page, editor);
}

/**
 * Reads persisted block content from the demo editor.
 *
 * @param page - Demo page containing the editor.
 * @param id - Persisted block identifier.
 * @returns Block content, or undefined if the block is absent.
 */
async function readBlockContent(page: Page, id: string): Promise<string | undefined> {
  return page.evaluate(
    (blockId) =>
      (window as unknown as DemoWindow).__rivtoDemo.editor.blocks.getBlockNode(blockId)?.content,
    id,
  );
}

/**
 * Reads the stored HTML of a seeded canvas element.
 *
 * @param page - Demo page containing the editor.
 * @param sample - Stable seeded sample identifier.
 * @returns Stored HTML, or undefined if the element is absent.
 */
async function readElementSource(page: Page, sample: string): Promise<unknown> {
  return page.evaluate(
    (sampleId) =>
      (window as unknown as DemoWindow).__rivtoDemo.editor.elements
        .getElementNodes()
        .find((item) => item.props.sample === sampleId)?.props.html,
    sample,
  );
}

/**
 * Reads a canvas element's persisted horizontal position.
 *
 * @param page - Demo page containing the editor.
 * @param id - Persisted canvas element identifier.
 * @returns The position in canvas units, or undefined if the element is absent.
 */
async function readElementX(page: Page, id: string): Promise<number | undefined> {
  return page.evaluate(
    (elementId) =>
      (window as unknown as DemoWindow).__rivtoDemo.editor.elements.getElementNode(elementId)?.frame
        .x,
    id,
  );
}

/**
 * Pans the canvas to the seeded HTML element.
 *
 * @param page - Demo page receiving canvas input.
 * @param sample - Stable seeded sample identifier.
 * @returns The viewport has reached the element.
 */
async function panToHtmlElement(page: Page, sample: string): Promise<void> {
  const viewport = page.locator(".edgeless-viewport");
  const expected = await viewport.evaluate((root, sampleId) => {
    const editor = (window as unknown as DemoWindow).__rivtoDemo.editor;
    const element = editor.elements
      .getElementNodes()
      .find((item) => item.type === "html" && item.props.sample === sampleId);
    if (!element) {
      throw new Error("Missing HTML element");
    }
    const zoom = Number(root.getAttribute("data-edgeless-zoom")) || 1;
    const cameraX = Number(root.getAttribute("data-edgeless-pan-x")) || 0;
    const cameraY = Number(root.getAttribute("data-edgeless-pan-y")) || 0;
    const destination = { x: 120 - element.frame.x * zoom, y: 180 - element.frame.y * zoom };
    root.dispatchEvent(
      new WheelEvent("wheel", {
        deltaX: cameraX - destination.x,
        deltaY: cameraY - destination.y,
        bubbles: true,
        cancelable: true,
      }),
    );
    return destination;
  }, sample);
  await expect
    .poll(async () => Number(await viewport.getAttribute("data-edgeless-pan-x")))
    .toBeCloseTo(expected.x);
  await expect
    .poll(async () => Number(await viewport.getAttribute("data-edgeless-pan-y")))
    .toBeCloseTo(expected.y);
}

for (const type of ["html", "unsafe-html"] as const) {
  test(`selecting source text in a Page ${type} block keeps native editing`, async ({ page }) => {
    await page.goto("/");
    const id = await page.evaluate((blockType) => {
      const editor = (window as unknown as DemoWindow).__rivtoDemo.editor;
      return editor.blocks.insertBlock({
        type: blockType,
        content: "<p>Hello selection world</p>",
        props: { label: "Selection block" },
      }).id;
    }, type);
    const block = page.locator(`[data-block-id="${id}"]`);
    await block.scrollIntoViewIfNeeded();
    await block.hover();
    await block
      .getByRole("button", { name: type === "html" ? "Edit HTML" : "Edit Unsafe HTML" })
      .click();
    const source = block.getByRole("textbox", { name: "HTML source" });
    await selectHello(page, source);
    await expect.poll(() => page.evaluate(() => window.getSelection()?.toString())).toBe("Hello");
    await expect(block).not.toHaveAttribute("data-block-selected", "true");
    await page.keyboard.insertText("Changed");
    await expect(source).toContainText("Changed selection world");
    await page.keyboard.press("ControlOrMeta+z");
    await expect(source).toContainText("Hello selection world");
    await page.keyboard.press("ControlOrMeta+Shift+Z");
    await expect(source).toContainText("Changed selection world");
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.insertText("<p>Hello selection world</p>");
    await selectHello(page, source);
    await verifyNativeClipboard(page, source);
    await page.keyboard.insertText("Changed");
    await block.getByRole("button", { name: "Done" }).click();
    await expect.poll(() => readBlockContent(page, id)).toContain("Changed selection world");
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect.poll(() => readBlockContent(page, id)).toBe("<p>Hello selection world</p>");
  });
}

test("clicking an HTML canvas element selects it and its source supports text selection", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator('[data-editor-mode="edgeless"]').click();
  const host = page
    .locator('[data-edgeless-visual-kind="html"]')
    .filter({ has: page.locator('[data-html-label="Focus"]') });
  await panToHtmlElement(page, "circle");
  const originalSource = await readElementSource(page, "circle");
  await expect(host).toBeVisible();
  await page.frameLocator('iframe[name="Focus"]').getByText("Focus").click();
  await expect(host).toHaveAttribute("data-selected");
  await host.hover();
  await host.getByRole("button", { name: "Edit HTML" }).click();
  const source = host.getByRole("textbox", { name: "HTML source" });
  await source.click();
  await expect(source).toBeFocused();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.insertText("<p>Hello selection world</p>");
  await selectHello(page, source);
  await expect.poll(() => page.evaluate(() => window.getSelection()?.toString())).toBe("Hello");
  await page.keyboard.insertText("Changed");
  await expect(source).toContainText("Changed selection world");
  await host.getByRole("button", { name: "Done" }).click();
  await expect.poll(() => readElementSource(page, "circle")).toBe("<p>Changed selection world</p>");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(() => readElementSource(page, "circle")).toBe(originalSource);
});

test("HTML canvas source editing keeps native focus, selection, and text operations", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator('[data-editor-mode="edgeless"]').click();
  const host = page
    .locator('[data-edgeless-visual-kind="html"]')
    .filter({ has: page.locator('[data-html-label="Focus"]') });
  await panToHtmlElement(page, "circle");
  await expect(host).toBeVisible();
  await host.hover();
  await host.getByRole("button", { name: "Edit HTML" }).click();
  const source = host.getByRole("textbox", { name: "HTML source" });
  await source.click();
  await expect(source).toBeFocused();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.insertText("<p>Hello selection world</p>");
  await selectHello(page, source);
  await expect.poll(() => page.evaluate(() => window.getSelection()?.toString())).toBe("Hello");
  await page.keyboard.insertText("Changed");
  await expect(source).toContainText("Changed selection world");
  await page.keyboard.press("ControlOrMeta+z");
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await expect(source).toBeFocused();
  await expect(source).not.toContainText("Changed selection world");
  await page.keyboard.press("ControlOrMeta+Shift+Z");
  await expect(source).toContainText("Changed selection world");
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.insertText("<p>Hello selection world</p>");
  await selectHello(page, source);
  await verifyNativeClipboard(page, source);
});

test("an HTML canvas control receives its first click and keeps native text selection", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator('[data-editor-mode="edgeless"]').click();
  await panToHtmlElement(page, "tally");
  const host = page
    .locator('[data-edgeless-visual-kind="html"]')
    .filter({ has: page.locator('[data-html-label="Tea"]') });
  const frame = page.frameLocator('iframe[name="Tea"]');
  await frame.getByRole("button", { name: "Add one" }).click();
  await expect(host).toHaveAttribute("data-selected", "true");
  await expect(frame.locator("#count")).toHaveText("3");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as DemoWindow).__rivtoDemo.editor.elements
            .getElementNodes()
            .find((item) => item.props.sample === "tally")?.props.count,
      ),
    )
    .toBe(3);
  const caption = frame.locator("#caption");
  const box = await caption.boundingBox();
  if (!box) {
    throw new Error("Missing iframe caption");
  }
  await page.mouse.dblclick(box.x + 8, box.y + box.height / 2);
  const childFrame = page.frame({ name: "Tea" });
  if (!childFrame) {
    throw new Error("Missing Tea frame");
  }
  await expect
    .poll(() => childFrame.evaluate(() => window.getSelection()?.toString().toLowerCase()))
    .toBe("tea");
  await expect(host).toHaveAttribute("data-selected", "true");
});

test("iframe pointer modifiers toggle canvas multiselection", async ({ page }) => {
  await page.goto("/");
  await page.locator('[data-editor-mode="edgeless"]').click();
  const ids = await page.evaluate(() => {
    const editor = (window as unknown as DemoWindow).__rivtoDemo.editor;
    const find = (sample: string) =>
      editor.elements.getElementNodes().find((item) => item.props.sample === sample)?.id;
    const circle = find("circle");
    const tally = find("tally");
    if (!circle || !tally) {
      throw new Error("Missing HTML elements");
    }
    return { circle, tally };
  });
  await panToHtmlElement(page, "circle");
  await page.frameLocator('iframe[name="Focus"]').getByText("Focus").click();
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as DemoWindow).__rivtoDemo.editor.selection.get()?.elements,
      ),
    )
    .toEqual([ids.circle]);
  await panToHtmlElement(page, "tally");
  await page.keyboard.down("Control");
  await page.frameLocator('iframe[name="Tea"]').locator("#caption").click();
  await page.keyboard.up("Control");
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as DemoWindow).__rivtoDemo.editor.selection.get()?.elements,
      ),
    )
    .toEqual([ids.circle, ids.tally]);
  await page.keyboard.down("Control");
  await page.frameLocator('iframe[name="Tea"]').locator("#caption").click();
  await page.keyboard.up("Control");
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as DemoWindow).__rivtoDemo.editor.selection.get()?.elements,
      ),
    )
    .toEqual([ids.circle]);
});

test("iframe clicks enter a canvas group before selecting its HTML child", async ({ page }) => {
  await page.goto("/");
  await page.locator('[data-editor-mode="edgeless"]').click();
  const ids = await page.evaluate(() => {
    const editor = (window as unknown as DemoWindow).__rivtoDemo.editor;
    const circle = editor.elements.getElementNodes().find((item) => item.props.sample === "circle");
    const tally = editor.elements.getElementNodes().find((item) => item.props.sample === "tally");
    if (!circle || !tally) {
      throw new Error("Missing HTML elements");
    }
    editor.commands.execute("edgeless.selection.set", [circle.id, tally.id]);
    const group = editor.commands.execute("edgeless.selection.group") as { id: string };
    editor.commands.execute("edgeless.selection.clear");
    return { circle: circle.id, group: group.id };
  });
  await panToHtmlElement(page, "circle");
  const content = page.frameLocator('iframe[name="Focus"]').getByText("Focus");
  await content.click();
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as DemoWindow).__rivtoDemo.editor.selection.get()?.elements,
      ),
    )
    .toEqual([ids.group]);
  await content.click();
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as DemoWindow).__rivtoDemo.editor.selection.get()?.elements,
      ),
    )
    .toEqual([ids.circle]);
  await content.click();
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as DemoWindow).__rivtoDemo.editor.selection.get()?.elements,
      ),
    )
    .toEqual([ids.circle]);
});

test("HTML block source keeps text selection inside an edgeless card", async ({ page }) => {
  await page.goto("/");
  const ids = await prepareHtmlCard(page);
  await page.locator('[data-editor-mode="edgeless"]').click();
  await panToCard(page, ids.card);
  const block = page.locator(`[data-block-id="${ids.block}"]`);
  await expect(block.locator("iframe")).toBeVisible();
  const sandbox = page.frame({ name: "Pomodoro" });
  if (!sandbox) {
    throw new Error("Missing HTML block frame");
  }
  await expect
    .poll(() => sandbox.evaluate(() => (window as unknown as WidgetWindow).rivto.context.mode))
    .toBe("edgeless");
  await block.hover();
  await block.getByRole("button", { name: "Edit HTML" }).click();
  const source = block.getByRole("textbox", { name: "HTML source" });
  await selectHello(page, source);
  await expect.poll(() => page.evaluate(() => window.getSelection()?.toString())).toBe("Hello");
  await expect(block).not.toHaveAttribute("data-block-selected", "true");
  await page.keyboard.insertText("Changed");
  await expect(source).toContainText("Changed selection world");
  await block.getByRole("button", { name: "Done" }).click();
  await expect
    .poll(() =>
      page.evaluate(
        (id) =>
          (window as unknown as DemoWindow).__rivtoDemo.editor.blocks.getBlockNode(id)?.content,
        ids.block,
      ),
    )
    .toBe("<p>Changed selection world</p>");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        (id) =>
          (window as unknown as DemoWindow).__rivtoDemo.editor.blocks.getBlockNode(id)?.content,
        ids.block,
      ),
    )
    .toBe("<p>Hello selection world</p>");
  await block.locator("[data-rivto-embedded-drag-handle]").first().click();
  await expect(block).not.toHaveAttribute("data-block-selected", "true");
});

/**
 * Prepares a small source on the seeded HTML card and positions that card.
 *
 * @param page - Demo page with an initialized document.
 * @returns The block and card IDs used by the browser interaction.
 */
async function prepareHtmlCard(page: Page): Promise<{ block: string; card: string }> {
  return page.evaluate(() => {
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
    editor.blocks.updateBlock(block.id, { content: "<p>Hello selection world</p>" });
    editor.elements.updateElement(card.id, { frame: { ...card.frame, x: 4000, y: 80 } });
    return { block: block.id, card: card.id };
  });
}

/**
 * Pans a block card into the canvas viewport.
 *
 * @param page - Demo page receiving the wheel input.
 * @param cardId - Persisted card to bring into view.
 * @returns The viewport has reached the card.
 */
async function panToCard(page: Page, cardId: string): Promise<void> {
  const viewport = page.locator(".edgeless-viewport");
  const expected = await viewport.evaluate((root, id) => {
    const editor = (window as unknown as DemoWindow).__rivtoDemo.editor;
    const card = editor.elements.getElementNode(id);
    if (!card) {
      throw new Error("Missing card");
    }
    const zoom = Number(root.getAttribute("data-edgeless-zoom")) || 1;
    const currentX = Number(root.getAttribute("data-edgeless-pan-x")) || 0;
    const currentY = Number(root.getAttribute("data-edgeless-pan-y")) || 0;
    const destination = { x: 120 - card.frame.x * zoom, y: 180 - card.frame.y * zoom };
    root.dispatchEvent(
      new WheelEvent("wheel", {
        deltaX: currentX - destination.x,
        deltaY: currentY - destination.y,
        bubbles: true,
        cancelable: true,
      }),
    );
    return destination;
  }, cardId);
  await expect
    .poll(async () => Number(await viewport.getAttribute("data-edgeless-pan-x")))
    .toBeCloseTo(expected.x);
  await expect
    .poll(async () => Number(await viewport.getAttribute("data-edgeless-pan-y")))
    .toBeCloseTo(expected.y);
}
