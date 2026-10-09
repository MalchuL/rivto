import { chromium, firefox, expect, test, type Locator, type Page } from "@playwright/test";

interface DemoInspection {
  storage: import("@chulane/document-model").DocumentStorage;
  editor: import("@chulane/rivto-react").EditorStorage;
  registry: import("@chulane/crdt-doc").YjsDocumentRegistry;
  panes: Set<{ id: string; editorRuntime: import("@chulane/rivto-react").EditorRuntime }>;
}

interface JournalInspection {
  editor: import("@chulane/rivto").RivtoEditorApi;
  editorRuntime: import("@chulane/rivto-react").EditorRuntime;
}

for (const repeat of [0, 200]) {
  test(`default journal embeds its existing nested branch in page and edgeless with repeat=${repeat}`, async ({ page, browserName }) => {
    test.setTimeout(120_000);
    page.setDefaultTimeout(10_000);
    await page.goto(`/?repeat=${repeat}`);
    const today = page.locator('[data-journal-document="today"]');
    const region = today.getByRole("region", { name: "Block editor" });
    await expect(region.locator('[data-block-id]')).toHaveCount(5);
    await expect(region.locator('[data-block-content]').first()).toHaveText("Nested branch one owns several Markdown children.");
    const { target, detailId } = await page.evaluate(() => {
      const { editor } = (window as unknown as { __rivtoDemo: JournalInspection }).__rivtoDemo;
      const embed = editor.blocks.getBlocks().find((block) => block.type === "embedding")!;
      const target = String(embed.props.targetBlockId);
      const child = editor.blocks.getBlockNode(target)!.childIds[0]!;
      return { target, detailId: editor.blocks.getBlockNode(child)!.childIds[0]! };
    });
    const original = today.locator(".page-surface").first().locator(`:scope > [data-block-id="${target}"]`);
    const detail = region.locator(`[data-block-id="${detailId}"] > .page-block-row [data-block-content]`);
    const originalDetail = original.locator(`[data-block-id="${detailId}"] > .page-block-row [data-block-content]`);
    await detail.fill("Warm embedded child");
    await expect(originalDetail).toHaveText("Warm embedded child");
    const samples: { command: number; render: number; keyboard: number }[] = [];
    for (let index = 0; index < 5; index += 1) {
      await detail.fill(`Sample ${index}`); await detail.press("End");
      const start = Date.now();
      await detail.press("x"); await expect(originalDetail).toHaveText(`Sample ${index}x`);
      await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      expect(await detail.evaluate((element) => element.ownerDocument.getSelection()?.focusOffset)).toBe(`Sample ${index}x`.length);
      const keyboard = Date.now() - start;
      const timing = await page.evaluate(async ({ id, index }) => {
        const { editor } = (window as unknown as { __rivtoDemo: JournalInspection }).__rivtoDemo;
        const start = performance.now();
        editor.blocks.updateBlock(id, { content: `Command ${index}` });
        const command = performance.now() - start;
        await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        return { command, render: performance.now() - start };
      }, { id: detailId, index });
      samples.push({ ...timing, keyboard });
      await expect(detail).toHaveText(`Command ${index}`);
      await expect(originalDetail).toHaveText(`Command ${index}`);
    }
    expect(samples.map(({ command }) => command).sort((a, b) => a - b)[2]).toBeLessThan(25);
    expect(samples.map(({ render }) => render).sort((a, b) => a - b)[2]).toBeLessThan(100);
    console.log(`journal embedding ${browserName} repeat=${repeat} ${JSON.stringify(samples)}`);
    await page.evaluate(() => (window as unknown as { __rivtoDemo: JournalInspection }).__rivtoDemo.editor.history.stopCapturing());
    await detail.press("End"); await detail.press("y");
    await expect(originalDetail).toHaveText("Command 4y");
    await detail.press("Control+z"); await expect(originalDetail).toHaveText("Command 4");
    await originalDetail.fill("Edited in the original branch");
    await expect(detail).toHaveText("Edited in the original branch");
    await today.getByRole("button", { name: "Edgeless", exact: true }).click();
    await expect(region.locator('[data-block-id]')).toHaveCount(5);
    await expect(detail).toHaveText("Edited in the original branch");
    await page.evaluate(() => (window as unknown as { __rivtoDemo: JournalInspection }).__rivtoDemo.editor.history.stopCapturing());
    const embeddedRoot = region.locator('[data-block-content]').first();
    const rootText = await embeddedRoot.textContent();
    await embeddedRoot.click(); await embeddedRoot.press("Control+End"); await embeddedRoot.press("z");
    await expect(embeddedRoot).toHaveText(`${rootText}z`);
    expect(await page.evaluate((id) => (window as unknown as { __rivtoDemo: JournalInspection }).__rivtoDemo.editor.blocks.getBlockNode(id)!.content, target)).toBe(`${rootText}z`);
    await embeddedRoot.press("Control+z"); await expect(embeddedRoot).toHaveText(rootText!);
    await today.getByRole("button", { name: "Page", exact: true }).click();
    await expect(originalDetail).toHaveText("Edited in the original branch");
    await expect(detail).toHaveText("Edited in the original branch");
  });
}

for (const repeat of [0, 200]) {
  for (const canvas of [false, true]) {
    test(`hovering in and out of an embedding preserves selection in ${canvas ? "edgeless" : "page"} with repeat=${repeat}`, async ({ page }) => {
      test.setTimeout(120_000);
      await page.goto(`/?repeat=${repeat}`);
      const today = page.locator('[data-journal-document="today"]');
      if (canvas) await today.getByRole("button", { name: "Edgeless", exact: true }).click();
      const region = today.getByRole("region", { name: "Block editor" });
      const content = region.locator('[data-block-content]').first();
      const host = today.locator('[data-block-type="embedding"]').first();
      const edit = host.locator(':scope > .page-block-row > [data-slot-position="right"]').getByRole("button", { name: "Edit embedding", exact: true });
      const readSelection = () => page.evaluate(() => (window as unknown as { __rivtoDemo: JournalInspection }).__rivtoDemo.editor.selection.get());
      await content.click({ modifiers: ["Control"] });
      const selected = await readSelection();
      expect(selected?.blocks).toHaveLength(1);
      await edit.hover();
      expect(await readSelection()).toEqual(selected);
      await content.hover();
      expect(await readSelection()).toEqual(selected);
      expect(await page.evaluate(() => {
        const { editorRuntime } = (window as unknown as { __rivtoDemo: JournalInspection }).__rivtoDemo;
        return editorRuntime.events.getRoot()?.getAttribute("role");
      })).toBe("region");
      await content.click();
      await content.press("End");
      await content.press("Shift+Home");
      const nativeText = await page.evaluate(() => window.getSelection()?.toString());
      expect(nativeText?.length).toBeGreaterThan(0);
      // Native selectionchange is delivered asynchronously after Shift+Home.
      await expect.poll(async () => {
        const range = (await readSelection())?.blocks[0];
        return range ? range.end - range.start : 0;
      }).toBe(nativeText!.length);
      const textSelection = await readSelection();
      expect(textSelection?.blocks).toHaveLength(1);
      await edit.hover();
      expect(await readSelection()).toEqual(textSelection);
      expect(await page.evaluate(() => window.getSelection()?.toString())).toBe(nativeText);
      await content.hover();
      expect(await readSelection()).toEqual(textSelection);
    });
  }
}

for (const [repeat, canvas] of [[0, false], [0, true], [200, false], [200, true]] as const) {
  test(`drag selection stops at the embedding in both directions in ${canvas ? "edgeless" : "page"} with repeat=${repeat}`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.goto(`/?repeat=${repeat}`);
    const today = page.locator('[data-journal-document="today"]');
    const ids = await page.evaluate(() => {
      const { editor } = (window as unknown as { __rivtoDemo: JournalInspection }).__rivtoDemo;
      const embed = editor.blocks.getBlocks().find((block) => block.type === "embedding")!.id;
      const before = editor.blocks.insertBlock({ type: "paragraph", content: "Start above the reference" }).id;
      const after = editor.blocks.insertBlock({ type: "paragraph", content: "Start below the reference" }).id;
      const child = editor.blocks.insertBlock({ type: "paragraph", content: "Ordinary child below the reference" }).id;
      editor.blocks.moveBlocks([before], embed, "before");
      editor.blocks.moveBlocks([after], embed, "after");
      return { embed, before, after, child };
    });
    if (canvas) {
      await today.getByRole("button", { name: "Edgeless", exact: true }).click();
      const zoom = today.getByRole("toolbar", { name: "Canvas zoom" });
      for (let index = 0; index < 3; index++) await zoom.getByRole("button", { name: "Zoom out", exact: true }).click();
      const cardId = await today.locator(`[data-block-id="${ids.embed}"]`).first().evaluate((element) =>
        element.closest<HTMLElement>("[data-edgeless-object-id]")!.dataset.edgelessObjectId!);
      await page.evaluate((id) => {
        const { editor } = (window as unknown as { __rivtoDemo: JournalInspection }).__rivtoDemo;
        editor.elements.updateElement(id, { zIndex: Math.max(...editor.elements.getElements().map((element) => element.zIndex)) + 1 });
      }, cardId);
    }
    const embedding = today.locator(`[data-block-id="${ids.embed}"]`).first();
    const body = embedding.locator(':scope > .rivto-slot[data-slot-position="body"]');
    const readSelection = () => page.evaluate(() => (window as unknown as { __rivtoDemo: JournalInspection })
      .__rivtoDemo.editor.selection.get()?.blocks.map(({ id }) => id));
    for (const withChild of [false, true]) {
      if (withChild) await page.evaluate(({ child, embed }) => (window as unknown as { __rivtoDemo: JournalInspection })
        .__rivtoDemo.editor.blocks.moveBlocks([child], embed, "inside"), ids);
      for (const fromAbove of [true, false]) {
        const anchorId = fromAbove ? ids.before : ids.after;
        const expected = fromAbove ? [ids.before, ids.embed] : [ids.embed, ids.after];
        if (!fromAbove && withChild) expected.splice(1, 0, ids.child);
        const anchor = today.locator(`[data-block-id="${anchorId}"] > .page-block-row [data-block-content]`).first();
        await body.scrollIntoViewIfNeeded();
        const start = (await anchor.boundingBox())!;
        const rect = (await body.boundingBox())!;
        await page.mouse.move(start.x + 20, start.y + start.height / 2);
        await page.mouse.down();
        // The pointer crosses another view, but the gesture still belongs to
        // the host. Its endpoint is the embedding, not nearby editable text.
        for (const fraction of [0.75, 0.25]) {
          await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height * fraction, { steps: 10 });
          await expect.poll(readSelection).toEqual(expected);
        }
        await page.mouse.up();
        await expect.poll(readSelection).toEqual(expected);
        await page.evaluate(() => (window as unknown as { __rivtoDemo: JournalInspection }).__rivtoDemo.editor.selection.clear());
      }
    }
  });
}

for (const canvas of [false, true]) {
  test(`trailing insertion controls stay outside embedded subtrees in ${canvas ? "edgeless" : "page"}`, async ({ page }) => {
    await page.goto("/");
    const today = page.locator('[data-journal-document="today"]');
    if (canvas) await today.getByRole("button", { name: "Edgeless", exact: true }).click();
    const embedded = today.getByRole("region", { name: "Block editor" });
    await expect(embedded.locator('[data-block-id]')).toHaveCount(5);
    await expect(embedded.locator(".page-trailing-block")).toHaveCount(0);
    await expect(embedded.locator("[data-page-end-slot]")).toHaveCount(0);
    await expect(today.locator(".page-trailing-block")).toHaveCount(canvas ? 0 : 3);
    if (canvas) return;

    const roots = today.locator(".page-surface").first().locator(":scope > [data-block-id]");
    const count = await roots.count();
    await page.evaluate(() => (window as unknown as { __rivtoDemo: JournalInspection }).__rivtoDemo.editor.history.clear());
    await today.getByRole("button", { name: "Add block", exact: true }).click();
    await expect(roots).toHaveCount(count + 1);
    await expect(roots.last().locator("[data-block-content]")).toBeFocused();
    await expect(embedded.locator('[data-block-id]')).toHaveCount(5);
    await page.keyboard.press("Control+z");
    await expect(roots).toHaveCount(count);
  });

  test(`embedded root collapse button is reachable and hides descendants in ${canvas ? "edgeless" : "page"}`, async ({ page }) => {
    await page.goto("/");
    const today = page.locator('[data-journal-document="today"]');
    if (canvas) await today.getByRole("button", { name: "Edgeless", exact: true }).click();
    const region = today.getByRole("region", { name: "Block editor" });
    await expect(region.locator('[data-block-id]')).toHaveCount(5);
    const collapse = region.getByRole("button", { name: "Collapse block: Nested branch one owns several Markdown children.", exact: true });
    await collapse.scrollIntoViewIfNeeded();
    expect(await collapse.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return element.contains(element.ownerDocument.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
    })).toBe(true);
    await page.evaluate(() => (window as unknown as { __rivtoDemo: JournalInspection }).__rivtoDemo.editor.history.clear());
    await collapse.click();
    await expect(region.locator('[data-block-id]')).toHaveCount(1);
    await expect(region.locator('[data-block-content]')).toHaveText("Nested branch one owns several Markdown children.");
    const spacing = await region.evaluate((element) => {
      const block = element.querySelector<HTMLElement>(":scope > [data-block-id]")!;
      const bottomGap = element.getBoundingClientRect().bottom - block.getBoundingClientRect().bottom;
      const padding = parseFloat(getComputedStyle(element).paddingBottom);
      const margin = parseFloat(getComputedStyle(block).marginBottom);
      return { bottomGap, expectedGap: padding + margin };
    });
    expect(spacing.bottomGap).toBeCloseTo(spacing.expectedGap, 0);
    const expand = region.getByRole("button", { name: "Expand block: Nested branch one owns several Markdown children.", exact: true });
    await expect(expand).toHaveAttribute("aria-expanded", "false");
    await page.evaluate(() => (window as unknown as { __rivtoDemo: JournalInspection }).__rivtoDemo.editor.history.undo());
    await expect(region.locator('[data-block-id]')).toHaveCount(5);
    await collapse.click();
    await expand.click();
    await expect(region.locator('[data-block-id]')).toHaveCount(5);
  });
}

/** Seeds one room with source and references, then waits for both live embeds. */
async function openDemo(page: Page, repeat = 0): Promise<string> {
  const room = `e2e-${crypto.randomUUID()}`;
  await page.goto(`/?embeddings=1&room=${room}&repeat=${repeat}`);
  await expect(page.getByRole("region", { name: "Block editor" })).toHaveCount(2);
  await expect(page.locator('[data-document-pane="source"] [data-block-content]').first()).toHaveText("Source text");
  return room;
}

for (const canvas of [false, true]) {
  test(`embedding settings save both IDs together and cancel without changes in ${canvas ? "edgeless" : "page"}`, async ({ page }) => {
    const room = await openDemo(page);
    const pane = page.locator('[data-document-pane="references"]');
    if (canvas) await pane.getByRole("button", { name: "Toggle mode", exact: true }).click();
    const host = pane.locator(`[data-block-id="${room}:embed-1"]`);
    const edit = host.locator(':scope > .page-block-row > [data-slot-position="right"]').getByRole("button", { name: "Edit embedding", exact: true });
    const settings = page.getByRole("dialog", { name: "Embedding settings" });
    await expect(host.locator(':scope > .page-block-row').getByRole("textbox")).toHaveCount(0);
    await expect(host.locator(':scope > .page-block-row .rivto-embedding')).toHaveText("");
    await expect(host.locator(':scope > .rivto-slot[data-slot-position="body"]')).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(host.getByRole("region", { name: "Block editor" })).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await host.scrollIntoViewIfNeeded();
    await page.mouse.move(0, 0);
    await expect(edit).toHaveCSS("opacity", "0");
    const beforeHover = await host.boundingBox();
    await host.hover();
    await expect(edit).toHaveCSS("opacity", "1");
    expect(await host.boundingBox()).toEqual(beforeHover);
    await page.mouse.move(0, 0);
    await expect(edit).toHaveCSS("opacity", "0");
    const readProps = () => page.evaluate((id) => (window as unknown as { __rivtoDocuments: DemoInspection })
      .__rivtoDocuments.editor.getEditor("references")!.blocks.getBlockNode(id)!.props, `${room}:embed-1`);
    const original = await readProps();
    await edit.focus();
    await expect(edit).toHaveCSS("opacity", "1");
    await edit.press("Enter");
    await expect(settings.getByRole("textbox", { name: "Target document ID" })).toHaveValue("source");
    await expect(settings.getByRole("textbox", { name: "Target block ID" })).toHaveValue(`${room}:source-block`);
    await settings.getByRole("textbox", { name: "Target document ID" }).fill("unsaved-document");
    await settings.getByRole("textbox", { name: "Target block ID" }).fill("unsaved-block");
    await settings.getByRole("textbox", { name: "Target block ID" }).press("Escape");
    await expect(settings).toBeHidden();
    expect(await readProps()).toEqual(original);
    await edit.click();
    await expect(settings.getByRole("textbox", { name: "Target document ID" })).toHaveValue("source");
    await settings.getByRole("textbox", { name: "Target document ID" }).fill(" references ");
    await settings.getByRole("textbox", { name: "Target block ID" }).fill(` ${room}:reference-heading `);
    expect(await readProps()).toEqual(original);
    await page.evaluate(() => (window as unknown as { __rivtoDocuments: DemoInspection }).__rivtoDocuments.editor.getEditor("references")!.history.clear());
    await settings.getByRole("button", { name: "Save embedding" }).click();
    await expect(settings).toBeHidden();
    expect(await readProps()).toEqual({ targetDocumentId: "references", targetBlockId: `${room}:reference-heading` });
    await expect(host.getByRole("region", { name: "Block editor" }).locator('[data-block-content]')).toHaveText("Live source references");
    await edit.click();
    await expect(settings.getByRole("textbox", { name: "Target document ID" })).toHaveValue("references");
    await settings.getByRole("textbox", { name: "Target block ID" }).press("Escape");
    await page.evaluate(() => (window as unknown as { __rivtoDocuments: DemoInspection }).__rivtoDocuments.editor.getEditor("references")!.history.undo());
    expect(await readProps()).toEqual(original);
    await expect(host.getByRole("region", { name: "Block editor" }).locator('[data-block-content]').first()).toHaveText("Source text");
  });
}

/** Moves the real mouse from a row's handle to another row; the caller checks feedback and releases it. */
async function dragRow(page: Page, source: Locator, destination: Locator, before = false): Promise<void> {
  await destination.scrollIntoViewIfNeeded();
  await source.hover();
  const handle = source.locator(':scope > .rivto-slot > .page-drag-handle');
  await handle.hover();
  // Keep the drop away from viewport edges so autoscroll does not move it during the gesture.
  await destination.evaluate((element) => window.scrollBy(0, element.getBoundingClientRect().top - window.innerHeight / 3));
  const from = await handle.boundingBox();
  const to = await destination.boundingBox();
  if (!from || !to) throw new Error("Expected source handle and destination row geometry");
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  const point = { x: before ? to.x + 4 : to.x + to.width / 2, y: before ? to.y + 1 : to.y + to.height / 2 };
  await page.mouse.move(point.x, point.y, { steps: 15 });
  await expect(source.locator("..")).toHaveAttribute("data-dragging", "true");
  expect(await destination.evaluate((element, point) => {
    const hit = element.ownerDocument.elementFromPoint(point.x, point.y);
    return Boolean(hit && element.contains(hit));
  }, point)).toBe(true);
}

test("embedded row hover exposes only its own reachable drag handle", async ({ page }) => {
  const room = await openDemo(page);
  const host = page.locator(`[data-document-pane="references"] [data-block-id="${room}:embed-1"]`);
  const region = page.getByRole("region", { name: "Block editor" }).first();
  const child = region.locator(`[data-block-id="${room}:child-0"]`);
  await child.locator(':scope > .page-block-row').hover();
  const handle = child.getByRole("button", { name: "Move block: Source child 0", exact: true });
  await expect(handle).toHaveCSS("opacity", "1");
  await expect(host.locator(':scope > .page-block-row > .rivto-slot > .page-drag-handle')).toHaveCSS("opacity", "0");
  await expect(region.getByRole("button", { name: "Move block: Source child 1", exact: true })).toHaveCSS("opacity", "0");
  await handle.hover();
  expect(await handle.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return element.contains(element.ownerDocument.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
  })).toBe(true);
});

test("checking an embedded child changes only its own row styling", async ({ page }) => {
  const room = await openDemo(page);
  await page.evaluate((roomId) => {
    const { editor } = (window as unknown as { __rivtoDocuments: DemoInspection }).__rivtoDocuments;
    editor.getEditor("source")!.blocks.updateBlock(`${roomId}:child-0`, { listProps: { type: "checkbox", checked: false } });
  }, room);
  const region = page.getByRole("region", { name: "Block editor" }).first();
  const child = region.locator(`[data-block-id="${room}:child-0"]`);
  await child.getByRole("checkbox").click();
  await expect(child.locator('[data-block-content]')).toHaveCSS("text-decoration-line", "line-through");
  await expect(region.locator(`[data-block-id="${room}:child-1"] [data-block-content]`)).toHaveCSS("text-decoration-line", "none");
  await expect(region.locator('[data-block-content]').first()).toHaveCSS("text-decoration-line", "none");
});

test("a host block drops into the embedded document and moves back out", async ({ page }) => {
  const room = await openDemo(page);
  const host = page.locator('[data-document-pane="references"]');
  const heading = host.locator(`[data-block-id="${room}:reference-heading"]`);
  const region = page.getByRole("region", { name: "Block editor" }).first();
  const destination = region.locator(`[data-block-id="${room}:child-0"] > .page-block-row`);
  await dragRow(page, heading.locator(':scope > .page-block-row'), destination);
  await expect(destination).toHaveAttribute("data-drop-inside", "true");
  await page.mouse.up();
  await expect.poll(() => page.evaluate((roomId) => {
    const { editor } = (window as unknown as { __rivtoDocuments: DemoInspection }).__rivtoDocuments;
    return { sourceParent: editor.getDocument("source")!.blocks.getParentId(`${roomId}:reference-heading`), hostHas: editor.getDocument("references")!.blocks.hasBlock(`${roomId}:reference-heading`) };
  }, room)).toEqual({ sourceParent: `${room}:child-0`, hostHas: false });
  const moved = region.locator(`[data-block-id="${room}:reference-heading"]`);
  const backRow = host.locator(`[data-block-id="${room}:embed-1"] > .page-block-row`);
  await dragRow(page, moved.locator(':scope > .page-block-row'), backRow, true);
  await expect(host.locator('.page-drop-indicator[data-kind="between"]')).toBeVisible();
  await page.mouse.up();
  await expect.poll(() => page.evaluate((id) => {
    const { editor } = (window as unknown as { __rivtoDocuments: DemoInspection }).__rivtoDocuments;
    return { hostHas: editor.getDocument("references")!.blocks.hasBlock(id), sourceHas: editor.getDocument("source")!.blocks.hasBlock(id) };
  }, `${room}:reference-heading`)).toEqual({ hostHas: true, sourceHas: false });
});

for (const [repeat, canvas] of [[0, false], [0, true], [200, false], [200, true]] as const) {
  test(`gaps around an embedding beside a container place siblings in ${canvas ? "edgeless" : "page"} with repeat=${repeat}`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.goto(`/?repeat=${repeat}`);
    const today = page.locator('[data-journal-document="today"]');
    const { embedId, movedId, nextId } = await page.evaluate(() => {
      const { editor } = (window as unknown as { __rivtoDemo: JournalInspection }).__rivtoDemo;
      const embedId = editor.blocks.getBlocks().find((block) => block.type === "embedding")!.id;
      const movedId = editor.blocks.insertBlock({ type: "paragraph", content: "Place below the embedding" }).id;
      editor.blocks.moveBlocks([movedId], embedId, "before");
      const nextId = editor.blocks.insertBlock({ type: "columns", children: [{ type: "columns-column" }] }).id;
      editor.blocks.moveBlocks([nextId], embedId, "after");
      editor.history.clear();
      return { embedId, movedId, nextId };
    });
    if (canvas) {
      await today.getByRole("button", { name: "Edgeless", exact: true }).click();
      const zoom = today.getByRole("toolbar", { name: "Canvas zoom" });
      for (let index = 0; index < 3; index++) await zoom.getByRole("button", { name: "Zoom out", exact: true }).click();
      // Repeated cards can overlap after their content grows. Keep the tested
      // card visible while retaining every stress card and the default layout.
      const cardId = await today.locator(`[data-block-id="${embedId}"]`).first().evaluate((element) =>
        element.closest<HTMLElement>("[data-edgeless-object-id]")!.dataset.edgelessObjectId!);
      await page.evaluate((id) => {
        const { editor } = (window as unknown as { __rivtoDemo: JournalInspection }).__rivtoDemo;
        editor.elements.updateElement(id, { zIndex: Math.max(...editor.elements.getElements().map((element) => element.zIndex)) + 1 });
        editor.history.clear();
      }, cardId);
    }
    const region = today.getByRole("region", { name: "Block editor" });
    const source = today.locator(`[data-block-id="${movedId}"] > .page-block-row`);
    await dragRow(page, source, region.locator(":scope > [data-block-id] > .page-block-row"));
    const embedding = today.locator(`[data-block-id="${embedId}"]`).first();
    const next = today.locator(`[data-block-id="${nextId}"]`).first();
    const embeddedRoot = region.locator(":scope > [data-block-id]");
    const rect = await embedding.boundingBox();
    const content = await embeddedRoot.boundingBox();
    const after = await next.boundingBox();
    if (!rect || !content || !after) throw new Error("Expected embedding and container geometry");
    const x = rect.x + (canvas ? 8.4 : 12);
    const line = today.locator('.page-drop-indicator[data-kind="between"]');
    // Check the gap above the reference, then its bottom padding and the next
    // container's edge. All of these belong to the enclosing document.
    await page.mouse.move(x, rect.y - 1, { steps: 10 });
    await expect(line).toHaveCount(1);
    expect(await line.evaluate((element) => Boolean(element.closest('[role="region"]')))).toBe(false);
    expect(Math.abs((await line.boundingBox())!.x - rect.x)).toBeLessThan(2);
    // The reference's top edge sorts it; its row center may accept children.
    await page.mouse.move(x, rect.y + 1);
    await expect(line).toHaveCount(1);
    expect(await line.evaluate((element) => Boolean(element.closest('[role="region"]')))).toBe(false);
    const firstY = content.y + content.height + 1;
    for (let y = firstY; y <= after.y + 4; y += 2) {
      await page.mouse.move(x, y);
      await expect(line).toHaveCount(1);
      expect(await line.evaluate((element) => Boolean(element.closest('[role="region"]')))).toBe(false);
      // Autoscroll can move the canvas during a sweep; compare the line with
      // its current neighbors rather than their pre-gesture viewport positions.
      await expect.poll(() => line.evaluate((element, { embedId, nextId }) => {
        const view = element.closest("[data-rivto-document-view]")!;
        const before = view.querySelector(`[data-block-id="${embedId}"]`)!.getBoundingClientRect();
        const after = view.querySelector(`[data-block-id="${nextId}"]`)!.getBoundingClientRect();
        const indicator = element.getBoundingClientRect();
        return indicator.y + indicator.height / 2 - (before.bottom + after.top) / 2;
      }, { embedId, nextId })).toBeCloseTo(0, 0);
    }
    // Release in the inner padding, rather than only testing the outermost edge.
    await page.mouse.move(x, firstY);
    await page.mouse.up();
    const readPlacement = () => page.evaluate(({ embedId, movedId }) => {
      const { editor } = (window as unknown as { __rivtoDemo: JournalInspection }).__rivtoDemo;
      const roots = editor.blocks.getRootIds();
      return { parent: editor.blocks.getParentId(movedId), followsEmbedding: roots.indexOf(movedId) === roots.indexOf(embedId) + 1 };
    }, { embedId, movedId });
    await expect.poll(readPlacement).toEqual({ parent: null, followsEmbedding: true });
    await page.keyboard.press("Control+z");
    await expect.poll(readPlacement).toEqual({ parent: null, followsEmbedding: false });
  });
}

for (const [repeat, canvas] of [[0, false], [0, true], [200, false], [200, true]] as const) {
  test(`indented gaps before and after an embedding create children in ${canvas ? "edgeless" : "page"} with repeat=${repeat}`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.goto(`/?repeat=${repeat}`);
    const today = page.locator('[data-journal-document="today"]');
    const ids = await page.evaluate(() => {
      const { editor } = (window as unknown as { __rivtoDemo: JournalInspection }).__rivtoDemo;
      const embed = editor.blocks.getBlocks().find((block) => block.type === "embedding")!;
      const source = editor.blocks.insertBlock({ type: "paragraph", content: "Drag into an outline gap" }).id;
      const upper = editor.blocks.insertBlock({ type: "paragraph", content: "Before the embedding" }).id;
      const lower = editor.blocks.insertBlock({ type: "columns", children: [{ type: "columns-column" }] }).id;
      editor.blocks.moveBlocks([upper, source], embed.id, "before");
      editor.blocks.moveBlocks([lower], embed.id, "after");
      editor.history.clear();
      return { source, upper, embed: embed.id, lower };
    });
    if (canvas) {
      await today.getByRole("button", { name: "Edgeless", exact: true }).click();
      const zoom = today.getByRole("toolbar", { name: "Canvas zoom" });
      for (let index = 0; index < 3; index++) await zoom.getByRole("button", { name: "Zoom out", exact: true }).click();
      const cardId = await today.locator(`[data-block-id="${ids.embed}"]`).first().evaluate((element) =>
        element.closest<HTMLElement>("[data-edgeless-object-id]")!.dataset.edgelessObjectId!);
      await page.evaluate((id) => {
        const { editor } = (window as unknown as { __rivtoDemo: JournalInspection }).__rivtoDemo;
        editor.elements.updateElement(id, { zIndex: Math.max(...editor.elements.getElements().map((element) => element.zIndex)) + 1 });
        editor.history.clear();
      }, cardId);
    }
    for (const [parentId, nextId] of [[ids.upper, ids.embed], [ids.embed, ids.lower]]) {
      const parent = today.locator(`[data-block-id="${parentId}"]`).first();
      const next = today.locator(`[data-block-id="${nextId}"]`).first();
      const source = today.locator(`[data-block-id="${ids.source}"] > .page-block-row`).first();
      await dragRow(page, source, parent.locator(":scope > .page-block-row"));
      const box = (await parent.boundingBox())!;
      const after = (await next.boundingBox())!;
      const scale = canvas ? 0.7 : 1;
      const line = today.locator('.page-drop-indicator[data-kind="between"]');
      // Moving right across the same gap must turn its sibling line into an
      // indented child line, even when the following block owns another view.
      for (const y of [box.y + box.height - 1, (box.y + box.height + after.y) / 2, after.y + 1]) {
        await page.mouse.move(box.x + 12 * scale, y, { steps: 10 });
        await expect(line).toHaveCount(1);
        expect(Math.abs((await line.boundingBox())!.x - box.x)).toBeLessThan(2);
        await page.mouse.move(box.x + 36 * scale, y);
        await expect(line).toHaveCount(1);
        expect(Math.abs((await line.boundingBox())!.x - (box.x + 24 * scale))).toBeLessThan(2);
        await expect(parent.locator(":scope > .page-block-row")).not.toHaveAttribute("data-drop-inside", "true");
      }
      await page.mouse.up();
      await expect.poll(() => page.evaluate((id) => (window as unknown as {
        __rivtoDemo: JournalInspection;
      }).__rivtoDemo.editor.blocks.getParentId(id), ids.source)).toBe(parentId);
      await expect(parent.locator(`:scope > .page-block-children > [data-block-id="${ids.source}"]`)).toBeVisible();
      if (parentId === ids.embed) {
        const body = parent.locator(':scope > .rivto-slot[data-slot-position="body"]');
        // The reference has its own decoration; ordinary outline children
        // below it must see the surrounding document's background instead.
        await expect(parent).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
        await expect(body).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
        await expect(body).toHaveCSS("border-top-width", "1px");
        await expect(parent).toHaveCSS("border-top-width", "0px");
        await page.evaluate((id) => (window as unknown as { __rivtoDemo: JournalInspection }).__rivtoDemo.editor.selection.set({
          type: "selection", blocks: [{ id, start: 0, end: -1 }], anchorBlockId: id, focusBlockId: id,
        }), parentId);
        await expect(parent).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
        await expect(body).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
        await page.evaluate(() => (window as unknown as { __rivtoDemo: JournalInspection }).__rivtoDemo.editor.selection.clear());
      }
      await page.keyboard.press("Control+z");
      await expect.poll(() => page.evaluate((id) => (window as unknown as {
        __rivtoDemo: JournalInspection;
      }).__rivtoDemo.editor.blocks.getParentId(id), ids.source)).toBeNull();
    }
  });
}

for (const mode of ["Page", "Edgeless"] as const) {
  test(`same-document embedding accepts moves in and out in ${mode} without allowing a cycle`, async ({ page }) => {
    await page.goto("/");
    const today = page.locator('[data-journal-document="today"]');
    const region = today.getByRole("region", { name: "Block editor" });
    await expect(region.locator('[data-block-id]')).toHaveCount(5);
    const { embedId, targetId, childId, movedId } = await page.evaluate(() => {
      const { editor } = (window as unknown as { __rivtoDemo: JournalInspection }).__rivtoDemo;
      const embed = editor.blocks.getBlocks().find((block) => block.type === "embedding")!;
      const targetId = String(embed.props.targetBlockId);
      const childId = editor.blocks.getBlockNode(targetId)!.childIds[0]!;
      const moved = editor.blocks.insertBlock({ type: "paragraph", content: "Drag into the source" });
      editor.blocks.moveBlocks([moved.id], embed.id, "before");
      editor.history.stopCapturing();
      return { embedId: embed.id, targetId, childId, movedId: moved.id };
    });
    if (mode === "Edgeless") {
      await today.getByRole("button", { name: "Edgeless", exact: true }).click();
      // Keep the reference header and source children visible together, using native canvas zoom.
      const zoom = today.getByRole("toolbar", { name: "Canvas zoom" });
      for (let index = 0; index < 3; index++) await zoom.getByRole("button", { name: "Zoom out", exact: true }).click();
      await expect(zoom.getByRole("button", { name: "Reset zoom" })).toHaveText("70%");
    }
    const outer = today.locator('[data-rivto-document-view]').first();
    const header = outer.locator(`[data-block-id="${embedId}"] > .page-block-row`);
    const source = outer.locator(`[data-block-id="${movedId}"] > .page-block-row`);
    const destination = region.locator(`[data-block-id="${childId}"] > .page-block-row`);
    await dragRow(page, source, destination);
    await expect(destination).toHaveAttribute("data-drop-inside", "true"); await page.mouse.up();
    await expect.poll(() => page.evaluate((id) => (window as unknown as { __rivtoDemo: JournalInspection }).__rivtoDemo.editor.blocks.getParentId(id), movedId)).toBe(childId);
    await expect(region.locator(`[data-block-id="${movedId}"]`)).toHaveCount(1);
    await page.evaluate(() => (window as unknown as { __rivtoDemo: JournalInspection }).__rivtoDemo.editor.history.stopCapturing());
    await dragRow(page, region.locator(`[data-block-id="${movedId}"] > .page-block-row`), header, true);
    await expect(outer.locator('.page-drop-indicator[data-kind="between"]')).toBeVisible(); await page.mouse.up();
    await expect.poll(() => page.evaluate((id) => (window as unknown as { __rivtoDemo: JournalInspection }).__rivtoDemo.editor.blocks.getParentId(id), movedId)).toBeNull();
    await expect(region.locator(`[data-block-id="${movedId}"]`)).toHaveCount(0);
    await page.keyboard.press("Control+z");
    await expect.poll(() => page.evaluate((id) => (window as unknown as { __rivtoDemo: JournalInspection }).__rivtoDemo.editor.blocks.getParentId(id), movedId)).toBe(childId);
    await page.keyboard.press("Control+Shift+z");
    await expect.poll(() => page.evaluate((id) => (window as unknown as { __rivtoDemo: JournalInspection }).__rivtoDemo.editor.blocks.getParentId(id), movedId)).toBeNull();
    // The original branch cannot be moved into a descendant displayed through its own reference.
    const original = outer.locator(`[data-block-id="${targetId}"]`).first();
    await dragRow(page, original.locator(':scope > .page-block-row'), destination);
    await expect(destination).not.toHaveAttribute("data-drop-inside", "true");
    await expect(outer.locator('.page-drop-indicator')).toHaveCount(0); await page.mouse.up();
    await expect.poll(() => page.evaluate((id) => (window as unknown as { __rivtoDemo: JournalInspection }).__rivtoDemo.editor.blocks.getParentId(id), targetId)).toBeNull();
    await expect(region.locator('[data-block-id]')).toHaveCount(5);
  });
}

test("edits source through shared-runtime embeds, survives source pane closure, and undoes deletion", async ({ page }) => {
  const room = await openDemo(page);
  const target = `${room}:source-block`;
  const embeds = page.getByRole("region", { name: "Block editor" });
  const edited = embeds.first().locator('[data-block-content]').first();
  await edited.fill("Edited through embed");
  await expect(embeds.nth(1).locator('[data-block-content]').first()).toHaveText("Edited through embed");
  await expect(page.locator('[data-document-pane="source"] [data-block-content]').first()).toHaveText("Edited through embed");
  await page.getByRole("button", { name: "Close source", exact: true }).click();
  await expect(page.locator('[data-document-pane="source"]')).toHaveCount(0);
  await edited.fill("Source has no pane");
  await expect(embeds.nth(1).locator('[data-block-content]').first()).toHaveText("Source has no pane");
  await page.getByRole("button", { name: "Open source", exact: true }).click();
  await expect(page.locator('[data-document-pane="source"] [data-block-content]').first()).toHaveText("Source has no pane");
  await page.evaluate((id) => {
    const inspection = (window as unknown as { __rivtoDocuments: DemoInspection }).__rivtoDocuments;
    const pane = [...inspection.panes].find((entry) => entry.id === "source")!;
    pane.editorRuntime.history.batchUpdates(() => pane.editorRuntime.blocks.removeBlock(id));
  }, target);
  await expect(page.getByText("Referenced block was deleted.", { exact: true })).toHaveCount(2);
  await page.evaluate(() => {
    const inspection = (window as unknown as { __rivtoDocuments: DemoInspection }).__rivtoDocuments;
    [...inspection.panes].find((entry) => entry.id === "source")!.editorRuntime.history.undo();
  });
  await expect(embeds).toHaveCount(2);
  await expect(embeds.first().locator('[data-block-content]').first()).toHaveText("Source has no pane");
});

test("references follow the same block into a new document identity without persisting that identity", async ({ page }) => {
  const room = await openDemo(page);
  const target = `${room}:source-block`;
  await page.evaluate(async (blockId) => {
    const { editor, panes } = (window as unknown as { __rivtoDocuments: DemoInspection }).__rivtoDocuments;
    const source = [...panes].find((pane) => pane.id === "source")!.editorRuntime;
    const snapshot = source.blocks.getBlock(blockId)!;
    const inspection = (window as unknown as { __rivtoDocuments: DemoInspection }).__rivtoDocuments;
    inspection.storage.registerDocument("new-source");
    const moved = await editor.acquireEditor("new-source");
    (window as unknown as { __movedSource: typeof moved }).__movedSource = moved;
    source.blocks.removeBlock(blockId);
    moved.document.blocks.insertBlock(snapshot);
  }, target);
  const content = page.getByRole("region", { name: "Block editor" }).first().locator('[data-block-content]').first();
  await expect(content).toHaveText("Source text");
  await expect.poll(() => page.evaluate(() => {
    const { editor } = (window as unknown as { __rivtoDocuments: DemoInspection }).__rivtoDocuments;
    return editor.getDocument("new-source")?.blocks.getBlockNode(editor.getDocument("new-source")!.blocks.getRootIds()[0]!)?.content;
  })).toBe("Source text");
  await content.fill("Moved source edit");
  await expect.poll(() => page.evaluate((id) => {
    const { editor } = (window as unknown as { __rivtoDocuments: DemoInspection }).__rivtoDocuments;
    return editor.getDocument("new-source")?.blocks.getBlockNode(id)?.content;
  }, target)).toBe("Moved source edit");
  await page.evaluate(async () => {
    await (window as unknown as { __movedSource: import("@chulane/rivto-react").EditorAcquisition }).__movedSource.release();
  });
  await expect(content).toHaveText("Moved source edit");
  const props = await page.evaluate(() => {
    const { panes } = (window as unknown as { __rivtoDocuments: DemoInspection }).__rivtoDocuments;
    return [...panes].find((pane) => pane.id === "references")!.editorRuntime.blocks.getBlocks().filter((block) => block.type === "embedding").map((block) => block.props);
  });
  expect(props).toEqual([{ targetDocumentId: "source", targetBlockId: target }, { targetDocumentId: "source", targetBlockId: target }]);
});

test("shared keyboard handling creates source siblings without expanding the reference or mutating the host", async ({ page }) => {
  await openDemo(page);
  await page.evaluate(() => {
    const panes = [...(window as unknown as { __rivtoDocuments: DemoInspection }).__rivtoDocuments.panes];
    const source = panes.find((pane) => pane.id === "source")!.editorRuntime;
    const root = source.blocks.getRootIds()[0]!;
    source.history.batchUpdates(() => source.blocks.getBlockNode(root)!.childIds.forEach((id) => source.blocks.removeBlock(id)));
  });
  const first = page.getByRole("region", { name: "Block editor" }).first();
  const content = first.locator('[data-block-content]').first();
  await content.click(); await content.press("End");
  await expect.poll(() => page.evaluate(() => {
    const { panes } = (window as unknown as { __rivtoDocuments: DemoInspection }).__rivtoDocuments;
    return [...panes].find((pane) => pane.id === "source")!.editorRuntime.selection.get()?.blocks[0]?.id;
  })).toContain(":source-block");
  await content.press("Enter");
  await expect(first.locator('[data-block-id]')).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => {
    const panes = [...(window as unknown as { __rivtoDocuments: DemoInspection }).__rivtoDocuments.panes];
    return panes.find((pane) => pane.id === "source")!.editorRuntime.blocks.getRootIds().length;
  })).toBe(2);
  const host = await page.evaluate(() => {
    const panes = [...(window as unknown as { __rivtoDocuments: DemoInspection }).__rivtoDocuments.panes];
    const pane = panes.find((pane) => pane.id === "references")!;
    return { roots: pane.editorRuntime.blocks.getRootIds().length, selection: pane.editorRuntime.selection.get() };
  });
  expect(host.roots).toBe(3);
  expect(host.selection?.blocks.every(({ id }) => id.endsWith(":source-block")) ?? true).toBe(true);
});

test("cycles stop before recursive acquisition and target changes release the previous source", async ({ page }) => {
  const room = await openDemo(page);
  await page.evaluate((roomId) => {
    const inspection = (window as unknown as { __rivtoDocuments: DemoInspection }).__rivtoDocuments;
    const source = [...inspection.panes].find((pane) => pane.id === "source")!;
    source.editorRuntime.blocks.insertBlock({ id: `${roomId}:cycle`, type: "embedding", props: { targetDocumentId: "references", targetBlockId: `${roomId}:embed-1` } });
    source.editorRuntime.blocks.moveBlocks([`${roomId}:cycle`], `${roomId}:source-block`, "inside");
  }, room);
  await expect(page.getByText("Recursive block reference.", { exact: true }).first()).toBeVisible();
  await page.locator(`[data-document-pane="references"] [data-block-id="${room}:embed-1"]`).first().hover();
  await page.locator(`[data-document-pane="references"] [data-block-id="${room}:embed-1"]`).getByRole("button", { name: "Edit embedding", exact: true }).first().click();
  const settings = page.getByRole("dialog", { name: "Embedding settings" });
  await settings.getByRole("textbox", { name: "Target block ID", exact: true }).fill("unknown-block");
  await settings.getByRole("button", { name: "Save embedding" }).click();
  await expect(page.getByText("Loading embedded block…", { exact: true }).first()).toBeVisible();
});

test("an acyclic reference to another embedding resolves its source", async ({ page }) => {
  const room = await openDemo(page);
  await page.locator(`[data-document-pane="references"] [data-block-id="${room}:embed-1"]`).hover();
  await page.locator(`[data-document-pane="references"] [data-block-id="${room}:embed-1"]`).getByRole("button", { name: "Edit embedding", exact: true }).first().click();
  const settings = page.getByRole("dialog", { name: "Embedding settings" });
  await settings.getByRole("textbox", { name: "Target block ID" }).fill(`${room}:embed-2`);
  await settings.getByRole("button", { name: "Save embedding" }).click();
  await expect(page.getByRole("region", { name: "Block editor" })).toHaveCount(3);
  await expect(page.getByText("Recursive block reference.", { exact: true })).toHaveCount(0);
});

test("WebRTC syncs selectively between Chromium and Firefox", async ({ browserName, baseURL }) => {
  const signaling = process.env.WEBRTC_SIGNALING_URL;
  test.skip(!signaling, "Set WEBRTC_SIGNALING_URL to an existing y-webrtc signaling server.");
  const room = `network-${crypto.randomUUID()}`;
  const route = `/?embeddings=1&room=${room}&provider=webrtc&signaling=${encodeURIComponent(signaling!)}`;
  // Loopback peers use host ICE candidates directly: this environment cannot reliably
  // resolve Chromium's mDNS host candidates across the separate browser processes.
  const chrome = await chromium.launch({ args: ["--disable-features=WebRtcHideLocalIpsWithMdns"] });
  const fox = await firefox.launch({ firefoxUserPrefs: { "media.peerconnection.ice.obfuscate_host_addresses": false } });
  const sourceBrowser = browserName === "chromium" ? chrome : fox;
  const peerBrowser = browserName === "chromium" ? fox : chrome;
  const page = await sourceBrowser.newPage();
  const peer = await peerBrowser.newPage();
  try {
    await page.goto(`${baseURL}${route}`);
    await expect(page.getByRole("region", { name: "Block editor" })).toHaveCount(2);
    await peer.goto(`${baseURL}${route}&join=1`);
    await expect(peer.getByRole("button", { name: "Open references", exact: true })).toBeVisible({ timeout: 15000 });
    const untouched = await peer.evaluate(() => {
      const inspection = (window as unknown as { __rivtoDocuments: DemoInspection }).__rivtoDocuments;
      return [...inspection.registry.root.doc.getSubdocs()].every((doc) => !doc.shouldLoad);
    });
    expect(untouched).toBe(true);
    await peer.getByRole("button", { name: "Open references", exact: true }).click();
    const content = peer.getByRole("region", { name: "Block editor" }).first().locator('[data-block-content]').first();
    await expect(content).toHaveText("Source text", { timeout: 15000 });
    await content.fill("Network peer edit");
    await expect(page.locator('[data-document-pane="source"] [data-block-content]').first()).toHaveText("Network peer edit");
  } finally { await chrome.close(); await fox.close(); }
});

test("registry-only client loads referenced documents and reconnects after final local release", async ({ page, context }) => {
  const room = await openDemo(page);
  const peer = await context.newPage();
  await peer.goto(`/?embeddings=1&room=${room}&join=1`);
  await expect(peer.getByRole("button", { name: "Open references", exact: true })).toBeVisible();
  await expect(peer.locator('[data-document-pane]')).toHaveCount(0);
  await peer.getByRole("button", { name: "Open references", exact: true }).click();
  const embedded = peer.getByRole("region", { name: "Block editor" }).first().locator('[data-block-content]').first();
  await expect(embedded).toHaveText("Source text");
  await embedded.fill("Remote source edit");
  await expect(page.locator('[data-document-pane="source"] [data-block-content]').first()).toHaveText("Remote source edit");
  await peer.getByRole("button", { name: "Close references", exact: true }).click();
  await expect(peer.locator('[data-document-pane]')).toHaveCount(0);
  await page.locator('[data-document-pane="source"] [data-block-content]').first().fill("While peer disconnected");
  await peer.getByRole("button", { name: "Open references", exact: true }).click();
  await expect(embedded).toHaveText("While peer disconnected");
});

test("embeds remain editable inside an edgeless host", async ({ page }) => {
  const room = await openDemo(page);
  await page.locator('[data-document-pane="references"]').getByRole("button", { name: "Toggle mode" }).click();
  const content = page.getByRole("region", { name: "Block editor" }).first().locator('[data-block-content]').first();
  await expect(content).toBeVisible();
  await content.fill("Edgeless embedded edit");
  await expect(page.locator('[data-document-pane="source"] [data-block-content]').first()).toHaveText("Edgeless embedded edit");
  await content.press("End");
  await content.press("x");
  await expect(content).toHaveText("Edgeless embedded editx");
  await content.press("Control+z");
  await expect(content).toHaveText("Source text");
  await content.press("Control+Shift+z");
  await expect(content).toHaveText("Edgeless embedded editx");
  const child = page.getByRole("region", { name: "Block editor" }).first()
    .locator(`[data-block-id="${room}:child-1"] [data-block-content]`);
  await child.click();
  await child.press("Tab");
  await expect.poll(() => page.evaluate((id) => {
    const { editor } = (window as unknown as { __rivtoDocuments: DemoInspection }).__rivtoDocuments;
    return { parent: editor.getDocument("source")!.blocks.getParentId(`${id}:child-1`),
      mode: document.querySelector('[data-document-pane="references"] .edgeless-viewport')?.getAttribute("data-rivto-surface") };
  }, room)).toEqual({ parent: `${room}:child-0`, mode: "edgeless" });
});

test("reference shell selection removes only the reference and collapse controls have per-view IDs", async ({ page }) => {
  await openDemo(page);
  const toggles = page.getByRole("button", { name: "Collapse block: Source text", exact: true });
  await expect(toggles).toHaveCount(3);
  const controls = await toggles.evaluateAll((elements) => elements.map((element) => {
    const id = element.getAttribute("aria-controls")!;
    const region = document.getElementById(id);
    return { id, own: region?.closest("[data-rivto-document-view]") === element.closest("[data-rivto-document-view]") };
  }));
  expect(new Set(controls.map(({ id }) => id)).size).toBe(3);
  expect(controls.every(({ own }) => own)).toBe(true);
  const header = page.locator('[data-document-pane="references"] .rivto-embedding[data-block-selection-anchor]').first();
  await header.click({ position: { x: 10, y: 10 } });
  await header.press("Delete");
  await expect(page.getByRole("region", { name: "Block editor" })).toHaveCount(1);
  await expect(page.locator('[data-document-pane="source"] [data-block-content]').first()).toHaveText("Source text");
});

for (const repeat of [0, 200]) {
  test(`editing cost and lifecycle with repeat=${repeat}`, async ({ page, browserName }) => {
    const room = await openDemo(page, repeat);
    const samples: { command: number; render: number; input: number; keyboard: number }[] = [];
    const content = page.getByRole("region", { name: "Block editor" }).first().locator('[data-block-content]').first();
    await content.fill("Warm source");
    await page.evaluate(() => {
      const storage = (window as unknown as { __rivtoDocuments: DemoInspection }).__rivtoDocuments.editor;
      const original = storage.resolveBlock.bind(storage);
      (window as unknown as { __documentSearches: number }).__documentSearches = 0;
      storage.resolveBlock = (...args) => {
        (window as unknown as { __documentSearches: number }).__documentSearches += 1;
        return original(...args);
      };
    });
    for (let index = 0; index < 5; index += 1) {
      const inputStart = Date.now();
      await content.fill(`Keyboard sample ${index}`);
      await expect(page.locator('[data-document-pane="source"] [data-block-content]').first()).toHaveText(`Keyboard sample ${index}`);
      const input = Date.now() - inputStart;
      await content.press("End");
      const keyboardStart = Date.now();
      await content.press("x");
      await expect(content).toHaveText(`Keyboard sample ${index}x`);
      await expect(page.locator('[data-document-pane="source"] [data-block-content]').first()).toHaveText(`Keyboard sample ${index}x`);
      await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      expect(await content.evaluate((element) => element.ownerDocument.getSelection()?.focusOffset)).toBe(`Keyboard sample ${index}x`.length);
      const keyboard = Date.now() - keyboardStart;
      const timing = await page.evaluate(async ({ target, index }) => {
        const panes = [...(window as unknown as { __rivtoDocuments: DemoInspection }).__rivtoDocuments.panes];
        const source = panes.find((pane) => pane.id === "source")!.editorRuntime;
        const start = performance.now();
        source.blocks.updateBlock(target, { content: `Command sample ${index}` });
        const command = performance.now() - start;
        await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        return { command, render: performance.now() - start };
      }, { target: `${room}:source-block`, index });
      samples.push({ ...timing, input, keyboard });
      await expect(content).toHaveText(`Command sample ${index}`);
    }
    expect(await page.evaluate(() => (window as unknown as { __documentSearches: number }).__documentSearches)).toBe(0);
    const commandMedian = samples.map(({ command }) => command).sort((a, b) => a - b)[2]!;
    const renderMedian = samples.map(({ render }) => render).sort((a, b) => a - b)[2]!;
    // Measured command medians were below 4 ms and DOM restoration below 35 ms
    // in both browsers; these budgets allow headroom without accepting a stalled edit.
    expect(commandMedian).toBeLessThan(25);
    expect(renderMedian).toBeLessThan(100);
    console.log(`embedding ${browserName} repeat=${repeat} ${JSON.stringify(samples)}`);
    await page.getByRole("button", { name: "Close source", exact: true }).click();
    await expect(content).toHaveText("Command sample 4");
    await page.getByRole("button", { name: "Close references", exact: true }).click();
    await expect(page.locator('[data-document-pane]')).toHaveCount(0);
    await page.getByRole("button", { name: "Open source", exact: true }).click();
    await expect(page.locator('[data-document-pane="source"] [data-block-id]')).toHaveCount(3 + repeat);
    await expect(page.locator('[data-document-pane="source"] [data-block-content]').first()).toHaveText("Command sample 4");
  });
}

test("one host selection follows the clicked occurrence and source keyboard edits undo independently", async ({ page }) => {
  const room = await openDemo(page);
  const regions = page.getByRole("region", { name: "Block editor" });
  const second = regions.nth(1).locator('[data-block-content]').first();
  await second.click(); await second.press("End"); await second.press("x");
  await expect(second).toHaveText("Source textx");
  await expect(regions.first().locator('[data-block-content]').first()).toHaveText("Source textx");
  await expect.poll(() => page.evaluate(() => document.activeElement?.closest('[role="region"]') ===
    document.querySelectorAll('[role="region"]')[1])).toBe(true);
  await expect.poll(() => page.evaluate(() => {
    const { panes } = (window as unknown as { __rivtoDocuments: DemoInspection }).__rivtoDocuments;
    return [...panes].find((pane) => pane.id === "source")!.editorRuntime.selection.get()?.blocks;
  })).toEqual([{ id: `${room}:source-block`, start: 12, end: 12 }]);
  await second.press("Control+z");
  await expect(second).toHaveText("Source text");
  await second.press("Control+Shift+z");
  await expect(second).toHaveText("Source textx");
  const child = regions.nth(1).locator('[data-block-content]').nth(2);
  await child.click(); await child.press("Tab");
  await expect.poll(() => page.evaluate((id) => {
    const { editor } = (window as unknown as { __rivtoDocuments: DemoInspection }).__rivtoDocuments;
    return editor.getDocument("source")!.blocks.getParentId(`${id}:child-1`);
  }, room)).toBe(`${room}:child-0`);
  await child.press("Shift+Tab");
  await expect.poll(() => page.evaluate((id) => {
    const { editor } = (window as unknown as { __rivtoDocuments: DemoInspection }).__rivtoDocuments;
    return editor.getDocument("source")!.blocks.getParentId(`${id}:child-1`);
  }, room)).toBe(`${room}:source-block`);
  const host = page.locator('[data-document-pane="references"] [data-block-content]').first();
  await host.click(); await host.press("End"); await host.press("h");
  await expect(host).toHaveText("Live source referencesh");
  await host.press("Control+z");
  await expect(host).toHaveText("Live source references");
  await expect(second).toHaveText("Source textx");
});

test("slash conversion and native clipboard paste use the source model in an embedded occurrence", async ({ page }) => {
  await openDemo(page);
  const content = page.getByRole("region", { name: "Block editor" }).nth(1).locator('[data-block-content]').first();
  await content.fill(""); await content.press("/");
  await expect(page.locator('[data-slash-menu]')).toBeVisible();
  await content.pressSequentially("checkbox", { delay: 10 });
  await page.locator('[data-slash-menu]').getByText("Checkbox", { exact: true }).click();
  await expect.poll(() => page.evaluate(() => {
    const { editor } = (window as unknown as { __rivtoDocuments: DemoInspection }).__rivtoDocuments;
    const source = editor.getDocument("source")!;
    return source.blocks.getBlockNode(source.blocks.getRootIds()[0]!)?.listProps.type;
  })).toBe("checkbox");
  await expect(page.locator('[data-document-pane="references"] [data-block-id]').first()).toHaveAttribute("data-block-type", "paragraph");
  await content.fill("Paste here"); await content.click(); await content.press("End");
  await expect.poll(() => page.evaluate(() => {
    const { panes } = (window as unknown as { __rivtoDocuments: DemoInspection }).__rivtoDocuments;
    return [...panes].find((pane) => pane.id === "source")!.editorRuntime.selection.get()?.blocks[0]?.start;
  })).toBe(10);
  await content.evaluate((element) => {
    const clipboardData = new DataTransfer();
    clipboardData.setData("text/plain", "!");
    const event = new ClipboardEvent("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", { value: clipboardData });
    element.dispatchEvent(event);
  });
  await expect(content).toHaveText("Paste here!");
  await expect(page.locator('[data-document-pane="source"] [data-block-content]').first()).toHaveText("Paste here!");
  await content.press("Control+z");
  await expect(content).toHaveText("Paste here");
});

test("source drag handles move children through shared commands without moving the reference", async ({ page }) => {
  const room = await openDemo(page);
  const region = page.getByRole("region", { name: "Block editor" }).first();
  const handle = region.getByRole("button", { name: "Move block: Source child 0", exact: true });
  const target = region.locator(`[data-block-id="${room}:child-1"]`);
  await region.locator(`[data-block-id="${room}:child-0"] > .page-block-row`).hover();
  await handle.hover();
  const from = await handle.boundingBox();
  const to = await target.locator(':scope > .page-block-row').boundingBox();
  if (!from || !to) throw new Error("Expected embedded drag geometry");
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 10 });
  await expect(target.locator(':scope > .page-block-row')).toHaveAttribute("data-drop-inside", "true");
  await page.mouse.up();
  await expect.poll(() => page.evaluate((id) => {
    const { editor } = (window as unknown as { __rivtoDocuments: DemoInspection }).__rivtoDocuments;
    return editor.getDocument("source")!.blocks.getParentId(`${id}:child-0`);
  }, room)).toBe(`${room}:child-1`);
  await expect(page.getByRole("region", { name: "Block editor" })).toHaveCount(2);
});

test("shared source selection deletes the target and source view undo restores it", async ({ page }) => {
  const room = await openDemo(page);
  const content = page.getByRole("region", { name: "Block editor" }).first().locator('[data-block-content]').first();
  await content.click();
  await page.evaluate((id) => {
    const { editor } = (window as unknown as { __rivtoDocuments: DemoInspection }).__rivtoDocuments;
    const source = editor.getEditor("source")!;
    source.selection.set({ type: "selection", blocks: [{ id, start: 0, end: -1 }], anchorBlockId: id, focusBlockId: id });
    document.getSelection()?.removeAllRanges();
    document.querySelector<HTMLElement>('[role="region"][aria-label="Block editor"]')!.focus();
  }, `${room}:source-block`);
  await page.keyboard.press("Delete");
  await expect(page.getByText("Referenced block was deleted.", { exact: true })).toHaveCount(2);
  await page.keyboard.press("Control+z");
  await expect(content).toHaveText("Source text");
  await expect(page.getByRole("region", { name: "Block editor" })).toHaveCount(2);
  await page.keyboard.press("Control+Shift+z");
  await expect(page.getByText("Referenced block was deleted.", { exact: true })).toHaveCount(2);
});

test("document tabs share one editor cache and retain inactive documents without reconnecting", async ({ page }) => {
  const room = `tabs-${crypto.randomUUID()}`;
  await page.goto(`/?embeddings=1&room=${room}&tabs=1`);
  const sourceTab = page.getByRole("tab", { name: "source", exact: true });
  const referencesTab = page.getByRole("tab", { name: "references", exact: true });
  const source = page.locator('[data-document-pane="source"] [data-block-content]').first();
  await sourceTab.click(); await source.fill("Edited in source tab");
  const before = await page.evaluate(() => {
    const info = (window as unknown as { __rivtoDocuments: DemoInspection & { channels: Map<string, number> } }).__rivtoDocuments;
    const panes = [...info.panes];
    return { shared: panes.every((pane) => info.editor.getEditor(pane.id) === pane.editorRuntime && !("editorStorage" in pane.editorRuntime)), channels: [...info.channels] };
  });
  expect(before.shared).toBe(true);
  await referencesTab.click();
  const embedded = page.getByRole("region", { name: "Block editor" }).first().locator('[data-block-content]').first();
  await expect(embedded).toHaveText("Edited in source tab");
  await embedded.fill("Edited from references tab");
  await sourceTab.click(); await expect(source).toHaveText("Edited from references tab");
  await source.press("End"); await source.press("x");
  await referencesTab.click(); await expect(embedded).toHaveText("Edited from references tabx");
  expect(await page.evaluate(() => [...(window as unknown as { __rivtoDocuments: { channels: Map<string, number> } }).__rivtoDocuments.channels])).toEqual(before.channels);
  await expect(page.getByRole("alert")).toHaveCount(0);
});

/** Verifies shared editing, independent private documents, and lazy acquisition for two users. */
async function checkTwoUsers(first: Page, second: Page, route: string): Promise<void> {
  await first.goto(`${route}&user=1`);
  await expect(first.getByRole("tab", { name: "private-1", exact: true })).toBeVisible();
  await second.goto(`${route}&join=1&user=2`);
  await expect(second.getByRole("button", { name: "Open references", exact: true })).toBeVisible({ timeout: 15000 });
  await second.getByRole("button", { name: "Open source", exact: true }).click();
  await second.getByRole("button", { name: "Open references", exact: true }).click();
  await first.getByRole("tab", { name: "source", exact: true }).click();
  await first.locator('[data-document-pane="source"] [data-block-content]').first().fill("User one source edit");
  await second.getByRole("tab", { name: "references", exact: true }).click();
  const embedded = second.getByRole("region", { name: "Block editor" }).first().locator('[data-block-content]').first();
  await expect(embedded).toHaveText("User one source edit", { timeout: 15000 });
  await embedded.fill("User two embedded edit");
  await expect(first.locator('[data-document-pane="source"] [data-block-content]').first()).toHaveText("User two embedded edit");
  await second.locator('[data-document-pane="references"] [data-block-content]').first().fill("User two reference edit");
  await first.getByRole("tab", { name: "references", exact: true }).click();
  await expect(first.locator('[data-document-pane="references"] [data-block-content]').first()).toHaveText("User two reference edit");
  for (const [page, user, unopened] of [[first, "1", "private-2"], [second, "2", "private-1"]] as const) {
    await page.getByRole("tab", { name: `private-${user}`, exact: true }).click();
    await page.locator(`[data-document-pane="private-${user}"] [data-block-content]`).first().fill(`Private edit ${user}`);
    const state = await page.evaluate((unopened) => {
      const info = (window as unknown as { __rivtoDocuments: DemoInspection & { channels: Map<string, number> } }).__rivtoDocuments;
      const panes = [...info.panes];
      return {
        oneEditorStorage: panes.every((pane) => info.editor.getEditor(pane.id) === pane.editorRuntime && !("editorStorage" in pane.editorRuntime)),
        singleEditors: new Set(panes.map((pane) => pane.editorRuntime)).size,
        loaded: info.editor.getDocuments().map((doc) => doc.id).sort(),
        channels: [...info.channels.keys()].map((channel) => JSON.parse(channel)[1]),
        unopenedLoaded: info.editor.getDocument(unopened) !== undefined,
        unopenedSubdocument: [...info.registry.root.doc.getSubdocs()].find((doc) => JSON.parse(doc.guid)[2] === unopened)?.shouldLoad,
      };
    }, unopened);
    expect(state.oneEditorStorage).toBe(true);
    expect(state.singleEditors).toBe(3);
    expect(state.loaded).toEqual([`private-${user}`, "references", "source"]);
    expect(state.channels).not.toContain(unopened);
    expect(state.unopenedLoaded).toBe(false);
    expect(state.unopenedSubdocument).toBe(false);
  }
  await second.getByRole("button", { name: "Open private-1", exact: true }).click();
  await expect(second.locator('[data-document-pane="private-1"] [data-block-content]').first()).toHaveText("Private edit 1", { timeout: 15000 });
  await first.getByRole("button", { name: "Open private-2", exact: true }).click();
  await expect(first.locator('[data-document-pane="private-2"] [data-block-content]').first()).toHaveText("Private edit 2", { timeout: 15000 });
}

test("two users synchronize shared tabs over BroadcastChannel while private documents remain unloaded", async ({ page, context }) => {
  const second = await context.newPage();
  const room = `users-${crypto.randomUUID()}`;
  try {
    await checkTwoUsers(page, second, `/?embeddings=1&room=${room}&tabs=1`);
  } finally { await second.close(); }
});

test("two users synchronize shared tabs while each third document stays unopened by the other", async ({ browserName, baseURL }) => {
  const signaling = process.env.WEBRTC_SIGNALING_URL;
  test.skip(!signaling, "Set WEBRTC_SIGNALING_URL to an existing y-webrtc signaling server.");
  const room = `users-${crypto.randomUUID()}`;
  const chrome = await chromium.launch({ args: ["--disable-features=WebRtcHideLocalIpsWithMdns"] });
  const fox = await firefox.launch({ firefoxUserPrefs: { "media.peerconnection.ice.obfuscate_host_addresses": false } });
  const first = await (browserName === "chromium" ? chrome : fox).newPage();
  const second = await (browserName === "chromium" ? fox : chrome).newPage();
  const route = `${baseURL}/?embeddings=1&room=${room}&tabs=1&provider=webrtc&signaling=${encodeURIComponent(signaling!)}`;
  try {
    await checkTwoUsers(first, second, route);
  } finally { await chrome.close(); await fox.close(); }
});

test("qualified embeddings allow equal block IDs, show ambiguous fallback, and keep the saved address", async ({ page }) => {
  const room = await openDemo(page);
  const target = `${room}:source-block`;
  await page.evaluate((id) => {
    const { editor } = (window as unknown as { __rivtoDocuments: DemoInspection }).__rivtoDocuments;
    editor.getEditor("references")!.blocks.insertBlock({ id, type: "paragraph", content: "Same ID in references" });
  }, target);
  const embeds = page.getByRole("region", { name: "Block editor" });
  await expect(embeds.first().locator('[data-block-content]').first()).toHaveText("Source text");
  await expect(page.getByText("Multiple documents contain this block; showing the first match.", { exact: true })).toHaveCount(0);
  await page.evaluate((id) => {
    const { editor } = (window as unknown as { __rivtoDocuments: DemoInspection }).__rivtoDocuments;
    const reference = editor.getEditor("references")!.blocks.getBlocks().find((block) => block.type === "embedding")!;
    editor.getEditor("references")!.blocks.setBlockProp(reference.id, "targetDocumentId", "old-document");
    if (!editor.getDocument("source")!.blocks.hasBlock(id)) throw new Error("Source must remain present");
  }, target);
  await expect(page.getByText("Multiple documents contain this block; showing the first match.", { exact: true })).toHaveCount(1);
  await expect(embeds.first().locator('[data-block-content]').first()).toHaveText("Same ID in references");
  await embeds.first().locator('[data-block-content]').first().fill("Edited fallback document");
  expect(await page.evaluate((id) => {
    const { editor } = (window as unknown as { __rivtoDocuments: DemoInspection }).__rivtoDocuments;
    return [editor.getDocument("references")!.blocks.getBlockNode(id)?.content, editor.getDocument("source")!.blocks.getBlockNode(id)?.content];
  }, target)).toEqual(["Edited fallback document", "Source text"]);
  expect(await page.evaluate(() => {
    const { editor } = (window as unknown as { __rivtoDocuments: DemoInspection }).__rivtoDocuments;
    return editor.getEditor("references")!.blocks.getBlocks().find((block) => block.type === "embedding")!.props.targetDocumentId;
  })).toBe("old-document");
  await page.evaluate((id) => {
    const { editor } = (window as unknown as { __rivtoDocuments: DemoInspection }).__rivtoDocuments;
    // An embedding may itself have the same local ID as its target in another document.
    const host = editor.getEditor("references")!;
    host.history.batchUpdates(() => {
      host.blocks.setBlockType(id, "embedding");
      host.blocks.updateBlock(id, { content: "", props: { targetDocumentId: "source", targetBlockId: id } });
    });
  }, target);
  await expect(page.getByText("Recursive block reference.", { exact: true })).toHaveCount(0);
  await expect(embeds.first().locator('[data-block-content]').first()).toHaveText("Source text");
});
