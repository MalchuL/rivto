import { expect, test, type Locator, type Page } from "@playwright/test";
import type { DocumentEditorAPI } from "@chulane/rivto";

interface DemoWindow extends Window {
  __rivtoDemo: { editor: DocumentEditorAPI };
}

for (const type of ["html", "unsafe-html"] as const) {
  test(`clicking ${type} preview selects its block`, async ({ page }) => {
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
    await page.locator('iframe[name="Click preview"]').click();
    await expect(block).toHaveAttribute("data-block-selected", "true");
  });
}

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
  await host.locator("iframe").click({ position: { x: 30, y: 30 } });
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
  await page.locator('iframe[name="Focus"]').click({ position: { x: 30, y: 30 } });
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as DemoWindow).__rivtoDemo.editor.selection.get()?.elements,
      ),
    )
    .toEqual([ids.circle]);
  await panToHtmlElement(page, "tally");
  await page.keyboard.down("Control");
  await page.locator('iframe[name="Tea"]').click({ position: { x: 20, y: 20 } });
  await page.keyboard.up("Control");
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as DemoWindow).__rivtoDemo.editor.selection.get()?.elements,
      ),
    )
    .toEqual([ids.circle, ids.tally]);
  await page.keyboard.down("Control");
  await page.locator('iframe[name="Tea"]').click({ position: { x: 20, y: 20 } });
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
  const iframe = page.locator('iframe[name="Focus"]');
  await iframe.click({ position: { x: 30, y: 30 } });
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as DemoWindow).__rivtoDemo.editor.selection.get()?.elements,
      ),
    )
    .toEqual([ids.group]);
  await iframe.click({ position: { x: 30, y: 30 } });
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as DemoWindow).__rivtoDemo.editor.selection.get()?.elements,
      ),
    )
    .toEqual([ids.circle]);
  await iframe.click({ position: { x: 30, y: 30 } });
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
  await block.locator("iframe").click();
  await expect(block).toHaveAttribute("data-block-selected", "true");
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
