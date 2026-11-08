import { expect, test, type Locator, type Page } from "@playwright/test";
import type { DocumentEditorAPI } from "@chulane/rivto";
import type { EditorStorage, ReactEditorApi } from "@chulane/rivto-react";

/**
 * Adds a writing block through the empty control or the editor's Enter command.
 *
 * @param page - Browser receiving keyboard input.
 * @param side - Side-note occurrence containing the writing blocks.
 * @returns Resolves after the insertion gesture is sent.
 */
async function addSideBlock(page: Page, side: Locator): Promise<void> {
  const add = side.getByRole("button", { name: "Add block" });
  if (await add.count()) {
    await add.click();
    return;
  }
  const inputs = side.getByRole("textbox", { name: "Markdown block content" });
  if (await inputs.count()) {
    await inputs.last().click();
    await page.keyboard.press("ControlOrMeta+End");
  } else {
    await side
      .locator("[data-side-block-card]")
      .last()
      .click({ modifiers: ["Control"] });
  }
  await page.keyboard.press("Enter");
}

/**
 * Deletes one side card using the editor's structural keyboard selection.
 *
 * @param page - Browser receiving keyboard input.
 * @param card - Card whose block should be selected and deleted.
 * @returns Resolves after the deletion gesture is sent.
 */
async function deleteSideCard(page: Page, card: Locator): Promise<void> {
  if (!(await card.locator(".rivto-block[data-block-selected]").count())) {
    await card
      .locator("[data-block-content]")
      .first()
      .click({ modifiers: ["Control"] });
  }
  await page.keyboard.press("Delete");
}

/** Browser instrumentation for the column width observer regression. */
interface ColumnStyleWindow extends Window {
  /** Style reads targeting the measured columns host. */
  columnStyleReads: number;
  /** Observed size notifications during the test. */
  columnSizeChanges: number;
  /** Test-owned observer disconnected after measurement. */
  columnObserver: ResizeObserver;
  /** Original browser function restored after measurement. */
  originalGetComputedStyle: typeof window.getComputedStyle;
}

/**
 * Waits for two browser frames so layout observers can settle.
 *
 * @param page - Browser page containing the observed layout.
 * @returns Resolves after the second animation frame.
 */
async function waitTwoFrames(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

test("shows side note controls while the pointer or focus is inside", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  const note = page.locator(
    '[data-journal-document="today"] [data-side-block-placement="left"] [data-side-note]',
  );
  const controls = note.locator(".demo-side-note-controls");
  const settings = note.getByRole("button", { name: "Side note settings" });
  await page.mouse.move(0, 0);
  await expect(controls).toHaveCSS("opacity", "0");
  await note.locator("[data-side-block-card]").first().hover();
  await expect(controls).toHaveCSS("opacity", "1");
  await page.mouse.move(0, 0);
  await expect(controls).toHaveCSS("opacity", "0");
  await settings.focus();
  await expect(controls).toHaveCSS("opacity", "1");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "Side note settings" })).toBeVisible();
});

test("styles a side note and restores its empty state and deleted container", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  const side = page.locator('[data-journal-document="today"] [data-side-block-placement="left"]');
  const note = side.locator("[data-side-note]");
  await expect(side.getByRole("button", { name: "Add block" })).toHaveCount(0);
  await expect(side.getByRole("button", { name: "Delete block" })).toHaveCount(0);
  await note.hover();
  await side.getByRole("button", { name: "Side note settings" }).click();
  const settings = page.getByRole("dialog", { name: "Side note settings" });
  const fill = settings.getByRole("group", { name: "Fill color" });
  const border = settings.getByRole("group", { name: "Border color" });
  await page.evaluate(() => window.__rivtoDemo.editor.history.clear());
  await fill.getByRole("button", { name: "red", exact: true }).click();
  await page.evaluate(() => window.__rivtoDemo.editor.history.undo());
  await expect(fill.getByRole("button", { name: "Default", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.evaluate(() => window.__rivtoDemo.editor.history.redo());
  await expect(fill.getByRole("button", { name: "red", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await fill.getByRole("button", { name: "transparent", exact: true }).click();
  await expect(note).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await fill.getByRole("button", { name: "red", exact: true }).click();
  await border.getByRole("button", { name: "transparent", exact: true }).click();
  await expect(note).toHaveCSS("border-top-color", "rgba(0, 0, 0, 0)");
  await border.getByRole("button", { name: "blue", exact: true }).click();
  await settings.getByLabel("Border style").selectOption("dashed");
  await settings.getByLabel("Animate dashes").check();
  await expect(note).toHaveAttribute("data-border-style", "dashed");
  await expect(note.locator(".demo-side-note-border rect")).toHaveCSS(
    "animation-name",
    "demo-side-note-dashes",
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(note.locator(".demo-side-note-border rect")).toHaveCSS("animation-name", "none");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await settings.getByLabel("Appearance").selectOption("editor");
  await expect(note).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(note.locator(".demo-side-note-border")).toHaveCount(0);
  await settings.getByLabel("Appearance").selectOption("card");
  await expect(fill.getByRole("button", { name: "red", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.keyboard.press("Escape");
  const saved = await page.evaluate(() => {
    const editor = window.__rivtoDemo.editor;
    const noteId = document.querySelector<HTMLElement>(
      '[data-journal-document="today"] [data-side-block-placement="left"]',
    )!.dataset.sideBlockId;
    const doc = editor.getDocument();
    const record = doc.pluginData.get<{ data: { rootBlockId: string } }>(
      `rivto.side-blocks.${noteId}`,
    )!;
    const props = doc.blocks.getBlockNode(record.data.rootBlockId)!.props;
    editor.load(editor.dump());
    return props;
  });
  expect(saved).toMatchObject({
    fill: "red",
    borderColor: "blue",
    borderStyle: "dashed",
    animated: true,
    appearance: "card",
  });
  await expect(note).toHaveAttribute("data-border-animated", "true");
  await side
    .getByRole("textbox", { name: "Markdown block content" })
    .click({ modifiers: ["Control"] });
  await page.keyboard.press("Delete");
  await expect(side.locator("[data-side-block-card]")).toHaveCount(0);
  await addSideBlock(page, side);
  await expect(side.getByRole("textbox", { name: "Markdown block content" })).toHaveCount(1);
  await expect(side.getByRole("button", { name: "Add block" })).toHaveCount(0);
  await note.hover();
  await side.getByRole("button", { name: "Delete note" }).click();
  await expect(side).toHaveCount(0);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(side).toHaveCount(1);
  await expect(note).toHaveAttribute("data-border-animated", "true");
});

test("replaces an empty side block with pasted content and restores it on undo", async ({
  page,
}) => {
  await page.goto("/");
  const side = page.locator('[data-journal-document="today"] [data-side-block-placement="left"]');
  const input = side.getByRole("textbox", { name: "Markdown block content" }).first();
  const id = await input
    .locator("xpath=ancestor::*[@data-block-id][1]")
    .getAttribute("data-block-id");
  await page.evaluate((blockId) => {
    window.__rivtoDemo.editor.blocks.updateBlock(blockId!, { content: "" });
    window.__rivtoDemo.editor.history.clear();
  }, id);
  await input.click();
  await input.evaluate((element) => {
    const data = new DataTransfer();
    data.setData("text/html", "<p>Side clipboard content</p>");
    data.setData("text/plain", "Side clipboard content");
    const event = new ClipboardEvent("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", { value: data });
    element.dispatchEvent(event);
  });
  await expect(side.getByRole("textbox", { name: "Markdown block content" })).toHaveText(
    "Side clipboard content",
  );
  await expect
    .poll(() => page.evaluate((blockId) => window.__rivtoDemo.editor.blocks.hasBlock(blockId!), id))
    .toBe(false);
  await page.keyboard.press("ControlOrMeta+z");
  await expect
    .poll(() => page.evaluate((blockId) => window.__rivtoDemo.editor.blocks.hasBlock(blockId!), id))
    .toBe(true);
  await expect(input).toHaveText("");
});

test("stores each side note in its own document container", async ({ page }) => {
  await page.goto("/");
  const notes = page.locator('[data-journal-document="today"] [data-side-block-id]');
  await expect(notes).toHaveCount(2);
  const ids = await notes.evaluateAll((elements) =>
    elements.map((element) => (element as HTMLElement).dataset.sideBlockId!),
  );
  const state = await page.evaluate((noteIds) => {
    const doc = window.__rivtoDemo.editor.getDocument();
    return noteIds.map((id) => {
      const note = doc.pluginData.get<{ data: { rootBlockId: string } }>(
        `rivto.side-blocks.${id}`,
      )!;
      const root = doc.blocks.getBlock(note.data.rootBlockId)!;
      return {
        id: root.id,
        type: root.type,
        content: root.content,
        children: root.children.length,
        onPage: doc.blocks.getRootIds().includes(root.id),
      };
    });
  }, ids);
  expect(new Set(state.map((root) => root.id)).size).toBe(2);
  for (const root of state) {
    expect(root).toMatchObject({
      type: "demo.side-note-container",
      content: "",
      children: 1,
      onPage: false,
    });
  }
});

test("drags side cards into a different order and undoes the move", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  const side = page.locator('[data-journal-document="today"] [data-side-block-placement="left"]');
  await addSideBlock(page, side);
  const cards = side.locator("[data-side-block-card]");
  await cards.nth(1).getByRole("textbox", { name: "Markdown block content" }).fill("Second");
  const source = cards.nth(1).locator(".rivto-block-row").first();
  await source.hover();
  const handle = source.locator(".block-handle").first();
  await expect(handle).toHaveAttribute("data-draggable", "true");
  const from = (await handle.boundingBox())!;
  const target = (await cards.first().locator(".rivto-block-row").first().boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x + target.width / 2, target.y + 2, { steps: 15 });
  await expect(page.locator(".rivto-block-drop-line:visible")).toHaveCount(1);
  await page.mouse.up();
  await expect(cards.first()).toContainText("Second");
  await page.keyboard.press("ControlOrMeta+z");
  await expect(cards.nth(1)).toContainText("Second");
});

test("drops a side card inside another block and undoes the nesting", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  const side = page.locator('[data-journal-document="today"] [data-side-block-placement="left"]');
  await addSideBlock(page, side);
  const cards = side.locator("[data-side-block-card]");
  const parentId = (await cards
    .first()
    .locator(".rivto-block")
    .first()
    .getAttribute("data-block-id"))!;
  const childId = (await cards
    .nth(1)
    .locator(".rivto-block")
    .first()
    .getAttribute("data-block-id"))!;
  const handle = cards.nth(1).locator(".block-handle").first();
  await handle.hover();
  const from = (await handle.boundingBox())!;
  const row = (await cards.first().locator(".rivto-block-row").first().boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(row.x + row.width * 0.65, row.y + row.height / 2, { steps: 15 });
  await expect(
    side.locator(`[data-block-id="${parentId}"][data-block-drop-active="true"]`),
  ).toBeVisible();
  await page.mouse.up();
  await expect
    .poll(() => page.evaluate((id) => window.__rivtoDemo.editor.blocks.getParentId(id), childId))
    .toBe(parentId);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(cards).toHaveCount(2);
});

test("moves a block between side notes and restores it with undo", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  const document = page.locator('[data-journal-document="today"]');
  const left = document.locator('[data-side-block-placement="left"]');
  const right = document.locator('[data-side-block-placement="right"]');
  const source = left.locator("[data-side-block-card]").first();
  const target = right.locator("[data-side-block-card]").first();
  const handle = source.locator(".block-handle").first();
  await handle.hover();
  const from = (await handle.boundingBox())!;
  const row = (await target.locator(".rivto-block-row").first().boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(row.x + row.width / 2, row.y + 2, { steps: 20 });
  await expect(page.locator(".rivto-block-drop-line:visible")).toHaveCount(1);
  await page.mouse.up();
  await expect(left.locator("[data-side-block-card]")).toHaveCount(0);
  await expect(right.locator("[data-side-block-card]")).toHaveCount(2);
  await expect(right.locator("[data-side-block-card]").first()).toContainText(
    "A note on the left.",
  );
  await page.keyboard.press("ControlOrMeta+z");
  await expect(left.locator("[data-side-block-card]")).toHaveCount(1);
  await expect(right.locator("[data-side-block-card]")).toHaveCount(1);
});

test("moves a page block into a side note and restores it with undo", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  const today = page.locator('[data-journal-document="today"]');
  const side = today.locator('[data-side-block-placement="left"]');
  await expect(side).toBeVisible();
  const ids = await page.evaluate(() => {
    const editor = window.__rivtoDemo.editor;
    const noteId = document.querySelector<HTMLElement>(
      '[data-journal-document="today"] [data-side-block-placement="left"]',
    )!.dataset.sideBlockId;
    const note = editor
      .getDocument()
      .pluginData.get<{ data: { rootBlockId: string } }>(`rivto.side-blocks.${noteId}`)!;
    return { source: editor.blocks.getRootIds()[1]!, root: note.data.rootBlockId };
  });
  const source = today.locator(`.page-surface [data-block-id="${ids.source}"]`).first();
  const handle = source.locator(":scope > .rivto-block-row .block-handle").first();
  await handle.hover();
  const from = (await handle.boundingBox())!;
  const target = (await side.locator(".rivto-block-row").first().boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x + target.width / 2, target.y + 2, { steps: 20 });
  await expect(page.locator(".rivto-block-drop-line:visible")).toHaveCount(1);
  await page.mouse.up();
  await expect
    .poll(() => page.evaluate((id) => window.__rivtoDemo.editor.blocks.getParentId(id), ids.source))
    .toBe(ids.root);
  await page.keyboard.press("ControlOrMeta+z");
  await expect
    .poll(() => page.evaluate((id) => window.__rivtoDemo.editor.blocks.getParentId(id), ids.source))
    .toBeNull();
});

test("applies registered creation processors when adding a side block", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await page.evaluate(() => {
    window.__rivtoDemo.editor.blocks.registerProcessor({
      id: "test.side-creation",
      priority: 0,
      processor: (block) => ({ ...block, content: "Processed side block" }),
    });
  });
  const side = page.locator('[data-journal-document="today"] [data-side-block-placement="left"]');
  await addSideBlock(page, side);
  await expect(side.getByRole("textbox", { name: "Markdown block content" }).last()).toHaveText(
    "Processed side block",
  );
  const today = page.locator('[data-journal-document="today"]');
  await today
    .locator("[data-block-id]")
    .first()
    .locator(":scope > .rivto-block-row .block-handle")
    .dispatchEvent("contextmenu", { button: 2 });
  await page.getByRole("menuitem", { name: "Add note to right" }).click();
  await expect(
    today
      .locator('[data-side-block-placement="right"]')
      .last()
      .getByRole("textbox", { name: "Markdown block content" }),
  ).toHaveText("Processed side block");
});

test("shows a newly registered side-compatible slash command", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await page.evaluate(() => {
    const editor = (window as unknown as { __rivtoDemo: { reactEditor: ReactEditorApi } })
      .__rivtoDemo.reactEditor;
    editor.slashCommands.register({
      id: "test.side-action",
      title: "Side action",
      execute: ({ reactPanel, blockId }) =>
        reactPanel.blocks.updateBlock(blockId, { content: "Updated dynamically" }),
    });
  });
  const side = page.locator('[data-journal-document="today"] [data-side-block-placement="left"]');
  const input = side.getByRole("textbox", { name: "Markdown block content" });
  await input.click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type(" /side");
  await expect(page.locator('[data-slash-command="test.side-action"]')).toBeVisible();
  await page.locator('[data-slash-command="test.side-action"]').click();
  await expect(input).toHaveText("Updated dynamically");
});

test("uses a block type registered after a side panel mounts", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await page.evaluate(() => {
    const release = window.__rivtoDemo.reactEditor.blockTypes.register({
      definition: { type: "test.live-block", title: "Live block" },
      render: () => "Live block content",
      slashCommand: {
        id: "test.custom-live-command",
        title: "Live block",
        keywords: ["liveblock"],
      },
    });
    (window as unknown as { releaseLiveBlock: () => void }).releaseLiveBlock = release;
  });
  const side = page.locator('[data-journal-document="today"] [data-side-block-placement="left"]');
  await side.getByRole("textbox", { name: "Markdown block content" }).click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type(" /liveblock");
  const command = page.locator('[data-slash-command="test.custom-live-command"]');
  await expect(command).toBeVisible();
  await command.click();
  await expect(side.getByText("Live block content")).toBeVisible();
  await addSideBlock(page, side);
  await side.getByRole("textbox", { name: "Markdown block content" }).click();
  await page.keyboard.type("/liveblock");
  await expect(command).toBeVisible();
  await page.evaluate(() => {
    (window as unknown as { releaseLiveBlock: () => void }).releaseLiveBlock();
  });
  await expect(command).toHaveCount(0);
});

test("mounts and removes dynamically registered extension UI in a side panel", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  const side = page.locator('[data-journal-document="today"] [data-side-block-placement="left"]');
  await page.evaluate(() => {
    const dispose = window.__rivtoDemo.reactEditor.extensions.mount(() => "Dynamic extension UI");
    (window as unknown as { releaseSideTestExtension: () => void }).releaseSideTestExtension =
      dispose;
  });
  await expect(side).toContainText("Dynamic extension UI");
  await page.evaluate(() => {
    (window as unknown as { releaseSideTestExtension: () => void }).releaseSideTestExtension();
  });
  await expect(side).not.toContainText("Dynamic extension UI");
});

test("opens the shared block context menu for a side card", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  const side = page.locator('[data-journal-document="today"] [data-side-block-placement="left"]');
  await side.locator("[data-side-block-card]").click({ button: "right" });
  await expect(page.getByRole("menu")).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Delete", exact: true })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Copy block embedding" })).toBeVisible();
  await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
  await expect(side.locator("[data-side-block-card]")).toHaveCount(0);
  await expect(
    page.locator('[data-journal-document="today"] .page-surface [data-block-content]').first(),
  ).toBeVisible();
});

test("opens the side block context menu from the keyboard", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  const side = page.locator('[data-journal-document="today"] [data-side-block-placement="left"]');
  const input = side.getByRole("textbox", { name: "Markdown block content" });
  await input.focus();
  for (const key of ["Shift+F10", "ContextMenu"]) {
    await page.keyboard.press(key);
    await expect(page.getByRole("menuitem", { name: "Delete", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(input).toBeFocused();
  }
});

test("does not intercept context-menu input inside an embedded document", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  const side = page.locator('[data-journal-document="today"] [data-side-block-placement="left"]');
  const noteId = await side.getAttribute("data-side-block-id");
  await page.evaluate((id) => {
    const editor = window.__rivtoDemo.editor;
    const doc = editor.getDocument();
    const target = editor.blocks.getRootIds()[1]!;
    const key = `rivto.side-blocks.${id}`;
    const note = doc.pluginData.get<{ data: { rootBlockId: string } }>(key)!;
    const existing = doc.blocks.getChildIds(note.data.rootBlockId)[0]!;
    editor.blocks.removeBlock(existing);
    editor.blocks.insertBlock(
      { type: "embedding", props: { targetDocumentId: doc.id, targetBlockId: target } },
      { parentId: note.data.rootBlockId },
    );
  }, noteId);
  const embedded = side.getByRole("region", { name: "Block editor" });
  const input = embedded.getByRole("textbox", { name: "Markdown block content" }).first();
  await expect(input).toBeVisible();
  await input.click({ button: "right" });
  await expect(page.getByRole("menu")).toHaveCount(0);
  await input.focus();
  await page.keyboard.press("Shift+F10");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await embedded.locator(".block-handle").first().click({ button: "right" });
  await expect(page.getByRole("menuitem", { name: "Copy block embedding" })).toBeVisible();
});

test("copies and cuts a side block through its shared context menu", async ({
  page,
  context,
  browserName,
}) => {
  if (browserName === "chromium") {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  const side = page.locator('[data-journal-document="today"] [data-side-block-placement="left"]');
  const before = await side.getByRole("textbox", { name: "Markdown block content" }).textContent();
  await side.locator("[data-side-block-card]").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Copy", exact: true }).click();
  await addSideBlock(page, side);
  await side.getByRole("textbox", { name: "Markdown block content" }).nth(1).click();
  await page.keyboard.press("ControlOrMeta+v");
  await expect(side.getByRole("textbox", { name: "Markdown block content" }).nth(1)).toHaveText(
    before!,
  );
  await side.locator("[data-side-block-card]").first().click({ button: "right" });
  await page.getByRole("menuitem", { name: "Cut", exact: true }).click();
  await expect(side.locator("[data-side-block-card]")).toHaveCount(1);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(side.locator("[data-side-block-card]")).toHaveCount(2);
});

test("copies an embedding of a side block and edits its original through the reference", async ({
  page,
  context,
  browserName,
}) => {
  if (browserName === "chromium") {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  const side = page.locator('[data-journal-document="today"] [data-side-block-placement="left"]');
  const noteId = await side.getAttribute("data-side-block-id");
  const original = side.getByRole("textbox", { name: "Markdown block content" });
  await original.fill("Referenced side content");
  await side.locator("[data-side-block-card]").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Copy block embedding", exact: true }).click();
  const pageInput = page
    .locator('[data-journal-document="today"] .page-surface [data-block-content]')
    .first();
  await pageInput.click();
  await page.keyboard.press("End");
  await page.keyboard.press("ControlOrMeta+v");
  const embedded = page
    .locator('[data-journal-document="today"] .page-surface .rivto-embedded-surface')
    .first();
  const target = embedded.getByRole("textbox", { name: "Markdown block content" }).first();
  await expect(target).toHaveText("Referenced side content");
  await target.fill("Edited through reference");
  await expect(original).toHaveText("Edited through reference");
  await page.evaluate(() => {
    const editor = window.__rivtoDemo.editor;
    editor.load(editor.dump());
  });
  await expect(target).toHaveText("Edited through reference");
  await expect(original).toHaveText("Edited through reference");
  await page.evaluate((id) => {
    const document = window.__rivtoDemo.editor.getDocument();
    const key = `rivto.side-blocks.${id}`;
    const note = document.pluginData.get<{ data: { rootBlockId: string } }>(key)!;
    window.__rivtoDemo.editor.blocks.removeBlock(
      document.blocks.getChildIds(note.data.rootBlockId)[0]!,
    );
  }, noteId);
  await expect(embedded.getByRole("status")).toHaveText("Referenced block was deleted.");
  await page.evaluate(() => window.__rivtoDemo.editor.history.undo());
  await expect(target).toHaveText("Edited through reference");
  await side.locator("[data-side-note]").hover();
  await side.getByRole("button", { name: "Delete note" }).click();
  await expect(embedded.getByRole("status")).toHaveText("Referenced block was deleted.");
  await page.evaluate(() => window.__rivtoDemo.editor.history.undo());
  await expect(target).toHaveText("Edited through reference");
  await expect(side).toHaveAttribute("data-side-block-id", noteId!);
  await page.evaluate((id) => {
    const editor = window.__rivtoDemo.editor;
    const note = editor
      .getDocument()
      .pluginData.get<{ anchorId: string }>(`rivto.side-blocks.${id}`)!;
    editor.blocks.removeBlock(note.anchorId);
  }, noteId);
  await expect(side).toBeHidden();
  await expect(target).toHaveText("Edited through reference");
  await target.fill("Edited while card is unmounted");
  await expect
    .poll(() =>
      page.evaluate((id) => {
        const document = window.__rivtoDemo.editor.getDocument();
        const note = document.pluginData.get<{ data: { rootBlockId: string } }>(
          `rivto.side-blocks.${id}`,
        )!;
        return document.blocks.getBlockNode(document.blocks.getChildIds(note.data.rootBlockId)[0]!)
          ?.content;
      }, noteId),
    )
    .toBe("Edited while card is unmounted");
});

test("resolves a side-block reference in its source document when another document has the same block ID", async ({
  page,
}) => {
  await page.goto(`/?embeddings=1&sideBlocks=1&room=${crypto.randomUUID()}`);
  await expect(
    page.locator('[data-document-pane="source"] [data-block-content]').first(),
  ).toHaveText("Source text");
  const referenceId = await page.evaluate(() => {
    const storage = (window as unknown as { __rivtoDocuments: { editor: EditorStorage } })
      .__rivtoDocuments.editor;
    const source = storage.getEditor("source")!;
    const target = storage.getEditor("references")!;
    const blockId = "side-reference-collision";
    const collectionId = "side-reference-note";
    source.blocks.insertBlock(
      {
        id: "side-reference-root",
        type: "paragraph",
        children: [{ id: blockId, type: "paragraph", content: "Source side block" }],
      },
      { parentId: null, additional: true },
    );
    source.getDocument().pluginData.set(`rivto.side-blocks.${collectionId}`, {
      id: collectionId,
      anchorId: source.blocks.getRootIds()[0],
      anchorType: "block",
      type: "note",
      spacing: "flow",
      placement: "left",
      createdAt: 1,
      data: { rootBlockId: "side-reference-root" },
    });
    target.blocks.insertBlock({
      id: blockId,
      type: "paragraph",
      content: "Different document block",
    });
    return target.blocks.insertBlock({
      type: "embedding",
      props: {
        targetDocumentId: "source",
        targetBlockId: blockId,
      },
    }).id;
  });
  const reference = page.locator(
    `[data-document-pane="references"] [data-block-id="${referenceId}"]`,
  );
  const embedded = reference
    .locator(".rivto-embedded-surface")
    .getByRole("textbox", { name: "Markdown block content" });
  await expect(embedded).toHaveText("Source side block");
  await page.getByRole("button", { name: "Close source", exact: true }).click();
  await expect(page.locator('[data-document-pane="source"]')).toHaveCount(0);
  await expect(embedded).toHaveText("Source side block");
  await embedded.fill("Edited source side block");
  await expect
    .poll(() =>
      page.evaluate(() => {
        const storage = (window as unknown as { __rivtoDocuments: { editor: EditorStorage } })
          .__rivtoDocuments.editor;
        return storage.getEditor("source")!.blocks.getBlockNode("side-reference-collision")
          ?.content;
      }),
    )
    .toBe("Edited source side block");
  await expect(
    page
      .locator(
        '[data-document-pane="references"] [data-block-id="side-reference-collision"] [data-block-content]',
      )
      .first(),
  ).toHaveText("Different document block");
});

test("rejects a recursive reference to a side-owned block", async ({ page }) => {
  await page.goto("/");
  const side = page.locator('[data-journal-document="today"] [data-side-block-placement="left"]');
  const noteId = await side.getAttribute("data-side-block-id");
  await page.evaluate((id) => {
    const document = window.__rivtoDemo.editor.getDocument();
    const key = `rivto.side-blocks.${id}`;
    const note = document.pluginData.get<{ data: { rootBlockId: string } }>(key)!;
    const editor = window.__rivtoDemo.editor;
    editor.blocks.removeBlock(document.blocks.getChildIds(note.data.rootBlockId)[0]!);
    editor.blocks.insertBlock(
      {
        id: "recursive-side-reference",
        type: "embedding",
        props: { targetDocumentId: document.id, targetBlockId: "recursive-side-reference" },
      },
      { parentId: note.data.rootBlockId },
    );
  }, noteId);
  await expect(side.getByRole("status")).toHaveText("Recursive block reference.");
});

test("reports a missing side reference and renders it when its target appears", async ({
  page,
}) => {
  await page.goto("/");
  const side = page.locator('[data-journal-document="today"] [data-side-block-placement="left"]');
  const noteId = await side.getAttribute("data-side-block-id");
  const referenceId = await page.evaluate((id) => {
    const editor = window.__rivtoDemo.editor;
    return editor.blocks.insertBlock({
      type: "embedding",
      props: {
        targetDocumentId: editor.getDocument().id,
        targetBlockId: "late-side-target",
      },
    }).id;
  }, noteId);
  const reference = page.locator(
    `[data-journal-document="today"] .page-surface [data-block-id="${referenceId}"]`,
  );
  await expect(reference.getByRole("status")).toHaveText("Referenced block is unavailable.");
  await page.evaluate((id) => {
    const document = window.__rivtoDemo.editor.getDocument();
    const key = `rivto.side-blocks.${id}`;
    const note = document.pluginData.get<{ data: { rootBlockId: string } }>(key)!;
    window.__rivtoDemo.editor.blocks.insertBlock(
      {
        id: "late-side-target",
        type: "paragraph",
        content: "Restored target",
      },
      { parentId: note.data.rootBlockId },
    );
  }, noteId);
  await expect(
    reference
      .locator(".rivto-embedded-surface")
      .getByRole("textbox", { name: "Markdown block content" }),
  ).toHaveText("Restored target");
});

test("converts a side block to a TODO from the shared context menu", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  const side = page.locator('[data-journal-document="today"] [data-side-block-placement="left"]');
  await side.locator("[data-side-block-card]").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Convert to TODO item" }).click();
  const todo = side.locator('[data-block-type="todo-item"]');
  await expect(todo).toBeVisible();
  await todo.getByRole("button", { name: /Status: todo/ }).click();
  await expect(todo.getByRole("button", { name: /Status: doing/ })).toBeVisible();
});

test("collapses and expands a nested side subtree from its context menu", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  const side = page.locator('[data-journal-document="today"] [data-side-block-placement="left"]');
  const noteId = await side.getAttribute("data-side-block-id");
  await page.evaluate((id) => {
    const doc = window.__rivtoDemo.editor.getDocument();
    const key = `rivto.side-blocks.${id}`;
    const note = doc.pluginData.get<{ data: { rootBlockId: string } }>(key)!;
    const parentId = doc.blocks.getChildIds(note.data.rootBlockId)[0]!;
    window.__rivtoDemo.editor.blocks.insertBlock(
      {
        id: crypto.randomUUID(),
        type: "paragraph",
        content: "Nested note",
        props: {},
        listProps: {},
        pluginData: {},
        children: [],
      },
      { parentId },
    );
  }, noteId);
  const inputs = side.getByRole("textbox", { name: "Markdown block content" });
  await expect(inputs).toHaveCount(2);
  await inputs.first().click({ button: "right" });
  await page.getByRole("menuitem", { name: "Collapse subtree" }).click();
  await expect(inputs).toHaveCount(1);
  await inputs.first().click({ button: "right" });
  await page.getByRole("menuitem", { name: "Expand whole subtree" }).click();
  await expect(inputs).toHaveCount(2);
  await expect(inputs.nth(1)).toHaveText("Nested note");
});

test("targets nested side blocks with dynamically registered context actions", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  const side = page.locator('[data-journal-document="today"] [data-side-block-placement="left"]');
  const noteId = await side.getAttribute("data-side-block-id");
  await page.evaluate((id) => {
    const doc = window.__rivtoDemo.editor.getDocument();
    const key = `rivto.side-blocks.${id}`;
    const note = doc.pluginData.get<{ data: { rootBlockId: string } }>(key)!;
    const parentId = doc.blocks.getChildIds(note.data.rootBlockId)[0]!;
    window.__rivtoDemo.editor.blocks.insertBlock(
      {
        id: crypto.randomUUID(),
        type: "paragraph",
        content: "Nested target",
        props: {},
        listProps: {},
        pluginData: {},
        children: [],
      },
      { parentId },
    );
    window.__rivtoDemo.reactEditor.blockContextMenu.register({
      id: "test.nested-context-action",
      title: "Update target",
      execute: ({ reactPanel, blockId }) =>
        reactPanel.blocks.updateBlock(blockId, { content: "Changed target" }),
    });
  }, noteId);
  const inputs = side.getByRole("textbox", { name: "Markdown block content" });
  await expect(inputs).toHaveCount(2);
  await inputs.nth(1).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Update target" }).click();
  await expect(inputs.first()).toHaveText("A note on the left.");
  await expect(inputs.nth(1)).toHaveText("Changed target");
  await page.evaluate(() => window.__rivtoDemo.editor.history.clear());
  await inputs.nth(1).focus();
  await page.keyboard.press("Shift+F10");
  await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
  await expect(inputs).toHaveCount(1);
  await expect(inputs.first()).toHaveText("A note on the left.");
  await page.keyboard.press("ControlOrMeta+z");
  await expect(inputs.nth(1)).toHaveText("Changed target");
  await inputs.nth(1).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Delete", exact: true }).evaluate((item) => {
    (item as HTMLElement).click();
    document.querySelector<HTMLButtonElement>('[data-editor-mode="edgeless"]')!.focus();
  });
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  await expect(page.locator('[data-editor-mode="edgeless"]')).toBeFocused();
});

test("runs a registered clear action on a side subtree and undoes it", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  const side = page.locator('[data-journal-document="today"] [data-side-block-placement="left"]');
  const noteId = await side.getAttribute("data-side-block-id");
  await page.evaluate((id) => {
    const doc = window.__rivtoDemo.editor.getDocument();
    const key = `rivto.side-blocks.${id}`;
    const note = doc.pluginData.get<{ data: { rootBlockId: string } }>(key)!;
    const parentId = doc.blocks.getChildIds(note.data.rootBlockId)[0]!;
    window.__rivtoDemo.editor.blocks.insertBlock(
      {
        id: crypto.randomUUID(),
        type: "paragraph",
        content: "Child to clear",
        props: {},
        listProps: {},
        pluginData: {},
        children: [],
      },
      { parentId },
    );
    window.__rivtoDemo.reactEditor.blockContextMenu.register({
      id: "test.clear-subtree",
      title: "Clear subtree",
      execute: ({ reactPanel, blockId }) => reactPanel.blocks.clearBlock(blockId),
    });
    window.__rivtoDemo.editor.history.clear();
  }, noteId);
  const inputs = side.getByRole("textbox", { name: "Markdown block content" });
  await expect(inputs).toHaveCount(2);
  await inputs.first().click({ button: "right" });
  await page.getByRole("menuitem", { name: "Clear subtree" }).click();
  await expect(inputs).toHaveCount(1);
  await expect(inputs.first()).toHaveText("");
  await page.evaluate(() => window.__rivtoDemo.editor.history.undo());
  await expect(inputs).toHaveCount(2);
  await expect(inputs.nth(1)).toHaveText("Child to clear");
});

test("runs registered property processors for side context actions and undo", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  const side = page.locator('[data-journal-document="today"] [data-side-block-placement="left"]');
  const noteId = await side.getAttribute("data-side-block-id");
  await page.evaluate(() => {
    window.__rivtoDemo.editor.blocks.registerProcessor({
      id: "test.side-context-processor",
      priority: 0,
      processor: (block) => ({
        ...block,
        props:
          typeof block.props?.value === "number"
            ? { ...block.props, value: Math.min(block.props.value, 10) }
            : block.props,
      }),
    });
    window.__rivtoDemo.reactEditor.blockContextMenu.register({
      id: "test.side-processed-property",
      title: "Set processed property",
      execute: ({ reactPanel, blockId }) =>
        reactPanel.blocks.updateBlock(blockId, { props: { value: 20 } }),
    });
    window.__rivtoDemo.editor.history.clear();
  });
  await side
    .getByRole("textbox", { name: "Markdown block content" })
    .first()
    .click({ button: "right" });
  await page.getByRole("menuitem", { name: "Set processed property" }).click();
  const value = () =>
    page.evaluate((id) => {
      const doc = window.__rivtoDemo.editor.getDocument();
      const note = doc.pluginData.get<{ data: { rootBlockId: string } }>(
        `rivto.side-blocks.${id}`,
      )!;
      return doc.blocks.getBlockNode(doc.blocks.getChildIds(note.data.rootBlockId)[0]!)?.props
        .value;
    }, noteId);
  await expect.poll(value).toBe(10);
  await page.evaluate(() => window.__rivtoDemo.editor.history.undo());
  await expect.poll(value).toBeUndefined();
});

test("updates an open side context menu when actions are registered", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  const side = page.locator('[data-journal-document="today"] [data-side-block-placement="left"]');
  const card = side.locator("[data-side-block-card]");
  await card.click({ button: "right" });
  await page.evaluate(() => {
    window.__rivtoDemo.reactEditor.blockContextMenu.register({
      id: "test.side-context-action",
      title: "Update side content",
      execute: ({ reactPanel, blockId }) =>
        reactPanel.blocks.updateBlock(blockId, { content: "Updated from context menu" }),
    });
  });
  await page.getByRole("menuitem", { name: "Update side content" }).click();
  await expect(side.getByRole("textbox", { name: "Markdown block content" })).toHaveText(
    "Updated from context menu",
  );
});

test("renders icon and destructive style supplied by a registered side action", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(() => {
    window.__rivtoDemo.reactEditor.blockContextMenu.register({
      id: "test.custom-presentation",
      title: "Custom destructive action",
      icon: () => "★",
      variant: "destructive",
      execute: () => {},
    });
  });
  const side = page.locator('[data-journal-document="today"] [data-side-block-placement="left"]');
  await side.locator("[data-side-block-card]").click({ button: "right" });
  const action = page.getByRole("menuitem", { name: "Custom destructive action" });
  await expect(action).toContainText("★");
  await expect(action.locator('[aria-hidden="true"]')).toHaveText("★");
  await expect(action).toHaveAttribute("data-variant", "destructive");
});

test("updates a registered menu action when the side collection revision changes", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  const side = page.locator('[data-journal-document="today"] [data-side-block-placement="left"]');
  const noteId = await side.getAttribute("data-side-block-id");
  await page.evaluate(() => {
    let initial: number | undefined;
    window.__rivtoDemo.reactEditor.blockContextMenu.register({
      id: "test.side-revision-action",
      title: "Side collection changed",
      isAvailable: ({ reactPanel }) => {
        const current = reactPanel.blocks.revision;
        initial ??= current;
        return current > initial;
      },
      execute: () => {},
    });
  });
  await side.locator("[data-side-block-card]").click({ button: "right" });
  await expect(page.getByRole("menuitem", { name: "Side collection changed" })).toHaveCount(0);
  await page.evaluate((id) => {
    const document = window.__rivtoDemo.editor.getDocument();
    const key = `rivto.side-blocks.${id}`;
    const note = document.pluginData.get<{ data: { rootBlockId: string } }>(key)!;
    const blockId = document.blocks.getChildIds(note.data.rootBlockId)[0]!;
    window.__rivtoDemo.editor.blocks.updateBlock(blockId, { content: "Changed externally" });
  }, noteId);
  await expect(page.getByRole("menuitem", { name: "Side collection changed" })).toBeVisible();
});

test("updates an open side context menu when the target changes", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  const side = page.locator('[data-journal-document="today"] [data-side-block-placement="left"]');
  const noteId = await side.getAttribute("data-side-block-id");
  await page.evaluate(() => {
    window.__rivtoDemo.reactEditor.blockContextMenu.register({
      id: "test.dynamic-availability",
      title: "Available after update",
      isAvailable: ({ reactPanel, blockId }) =>
        reactPanel.blocks.getBlockNode(blockId)?.content === "Ready",
      execute: () => {},
    });
  });
  await side.locator("[data-side-block-card]").click({ button: "right" });
  const action = page.getByRole("menuitem", { name: "Available after update" });
  await expect(action).toHaveCount(0);
  await page.evaluate((id) => {
    const doc = window.__rivtoDemo.editor.getDocument();
    const key = `rivto.side-blocks.${id}`;
    const note = doc.pluginData.get<{ data: { rootBlockId: string } }>(key)!;
    const blockId = doc.blocks.getChildIds(note.data.rootBlockId)[0]!;
    window.__rivtoDemo.editor.blocks.updateBlock(blockId, { content: "Ready" });
  }, noteId);
  await expect(action).toBeVisible();
  await page.evaluate((id) => {
    const doc = window.__rivtoDemo.editor.getDocument();
    const key = `rivto.side-blocks.${id}`;
    const note = doc.pluginData.get<{ data: { rootBlockId: string } }>(key)!;
    const blockId = doc.blocks.getChildIds(note.data.rootBlockId)[0]!;
    window.__rivtoDemo.editor.blocks.updateBlock(blockId, { content: "Not ready" });
  }, noteId);
  await expect(action).toHaveCount(0);
});

test("refreshes an open side context menu when a nested block changes", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  const side = page.locator('[data-journal-document="today"] [data-side-block-placement="left"]');
  const noteId = await side.getAttribute("data-side-block-id");
  await page.evaluate((id) => {
    const doc = window.__rivtoDemo.editor.getDocument();
    const key = `rivto.side-blocks.${id}`;
    const note = doc.pluginData.get<{ data: { rootBlockId: string } }>(key)!;
    const parentId = doc.blocks.getChildIds(note.data.rootBlockId)[0]!;
    window.__rivtoDemo.editor.blocks.insertBlock(
      {
        id: crypto.randomUUID(),
        type: "paragraph",
        content: "Before",
        props: {},
        listProps: {},
        pluginData: {},
        children: [],
      },
      { parentId },
    );
    window.__rivtoDemo.reactEditor.blockContextMenu.register({
      id: "test.nested-availability",
      title: "Child is ready",
      isAvailable: ({ reactPanel, blockId }) => {
        const child = reactPanel.blocks.getChildIds(blockId)[0];
        return !!child && reactPanel.blocks.getBlockNode(child)?.content === "Ready";
      },
      execute: () => {},
    });
  }, noteId);
  await side
    .getByRole("textbox", { name: "Markdown block content" })
    .first()
    .click({ button: "right" });
  const action = page.getByRole("menuitem", { name: "Child is ready" });
  await expect(action).toHaveCount(0);
  await page.evaluate((id) => {
    const doc = window.__rivtoDemo.editor.getDocument();
    const key = `rivto.side-blocks.${id}`;
    const note = doc.pluginData.get<{ data: { rootBlockId: string } }>(key)!;
    const parent = doc.blocks.getChildIds(note.data.rootBlockId)[0]!;
    const child = doc.blocks.getChildIds(parent)[0]!;
    window.__rivtoDemo.editor.blocks.updateBlock(child, { content: "Ready" });
  }, noteId);
  await expect(action).toBeVisible();
});

test("targets the containing side block when its content has a block ID attribute", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  const side = page.locator('[data-journal-document="today"] [data-side-block-placement="left"]');
  const noteId = await side.getAttribute("data-side-block-id");
  const rootId = await page.evaluate((id) => {
    const doc = window.__rivtoDemo.editor.getDocument();
    const key = `rivto.side-blocks.${id}`;
    const note = doc.pluginData.get<{ data: { rootBlockId: string } }>(key)!;
    const rootId = doc.blocks.getChildIds(note.data.rootBlockId)[0]!;
    window.__rivtoDemo.editor.blocks.insertBlock(
      {
        id: crypto.randomUUID(),
        type: "paragraph",
        content: "Nested target",
        props: {},
        listProps: {},
        pluginData: {},
        children: [],
      },
      { parentId: rootId },
    );
    window.__rivtoDemo.reactEditor.blockContextMenu.register({
      id: "test.inner-attribute",
      title: "Update nested target",
      execute: ({ reactPanel, blockId }) =>
        reactPanel.blocks.updateBlock(blockId, { content: "Changed nested target" }),
    });
    return rootId;
  }, noteId);
  const inputs = side.getByRole("textbox", { name: "Markdown block content" });
  await expect(inputs).toHaveCount(2);
  await inputs.nth(1).evaluate((input, id) => {
    const child = document.createElement("span");
    child.dataset.blockId = id;
    child.dataset.testInner = "true";
    child.textContent = "Inner content";
    input.closest(".rivto-block")!.append(child);
  }, rootId);
  await side.locator("[data-test-inner]").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Update nested target" }).click();
  await expect(inputs.first()).toHaveText("A note on the left.");
  await expect(inputs.nth(1)).toHaveText("Changed nested target");
});

test("side card deletion respects dynamically registered block behavior", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  const side = page.locator('[data-journal-document="today"] [data-side-block-placement="left"]');
  await addSideBlock(page, side);
  const cards = side.locator("[data-side-block-card]");
  await expect(cards).toHaveCount(2);
  const blockId = await cards
    .nth(1)
    .locator("[data-block-id]")
    .first()
    .getAttribute("data-block-id");
  await page.evaluate((id) => {
    const dispose = window.__rivtoDemo.reactEditor.blockBehaviors.register({
      isAvailable: ({ block }) => block.id === id,
      onStructuralDelete: () => "rejected",
    });
    (window as unknown as { releaseDeletePolicy: () => void }).releaseDeletePolicy = dispose;
  }, blockId);
  await deleteSideCard(page, cards.nth(1));
  await expect(cards).toHaveCount(2);
  await page.evaluate(() => {
    (window as unknown as { releaseDeletePolicy: () => void }).releaseDeletePolicy();
    window.__rivtoDemo.editor.history.clear();
  });
  await deleteSideCard(page, cards.nth(1));
  await expect(cards).toHaveCount(1);
  await expect(side.locator(".rivto-side-block-content")).toBeFocused();
  await page.keyboard.press("ControlOrMeta+z");
  await expect(cards).toHaveCount(2);
});

test("applies side context menu list and background properties", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  const side = page.locator('[data-journal-document="today"] [data-side-block-placement="left"]');
  const noteId = await side.getAttribute("data-side-block-id");
  const properties = () =>
    page.evaluate((id) => {
      const doc = window.__rivtoDemo.editor.getDocument();
      const note = doc.pluginData.get<{ data: { rootBlockId: string } }>(
        `rivto.side-blocks.${id}`,
      )!;
      return doc.blocks.getBlockNode(doc.blocks.getChildIds(note.data.rootBlockId)[0]!)?.listProps;
    }, noteId);
  const card = side.locator("[data-side-block-card]");
  await card.click({ button: "right" });
  await page.getByRole("menuitem", { name: "List style" }).hover();
  await page.getByRole("menuitemcheckbox", { name: "Checkboxes" }).click();
  await expect.poll(properties).toMatchObject({ type: "checkbox" });
  await side.getByRole("checkbox", { name: /Mark block as complete/ }).click();
  await expect.poll(properties).toMatchObject({ type: "checkbox", checked: true });
  await card.click({ button: "right" });
  await page.getByRole("menuitem", { name: "red", exact: true }).click();
  await expect.poll(properties).toMatchObject({ type: "checkbox", backgroundColor: "red" });
  await expect(side.locator('[data-block-type="paragraph"]')).toHaveAttribute(
    "data-block-background",
    "var(--rivto-block-red)",
  );
  await card.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Default", exact: true }).click();
  await expect.poll(async () => (await properties())?.backgroundColor).toBeUndefined();
});

test("converts a side paragraph with a slash command and undoes the conversion", async ({
  page,
}) => {
  await page.goto("/");
  const side = page.locator('[data-journal-document="today"] [data-side-block-placement="left"]');
  const editor = side.getByRole("textbox", { name: "Markdown block content" });
  await editor.click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type(" /slider");
  await expect(page.locator('[data-slash-command="type.demo.slider"]')).toBeVisible();
  await expect(page.locator('[data-slash-command="block.delete"]')).toHaveCount(0);
  await page.keyboard.press("Enter");
  const slider = side.locator('[data-side-block-card] input[type="range"]');
  await expect(slider).toBeVisible();
  await page.keyboard.press("ControlOrMeta+z");
  await expect(side.getByRole("textbox", { name: "Markdown block content" })).toContainText(
    "/slider",
  );
});

/**
 * Waits until a side item aligns with its anchor's own row.
 *
 * @param anchor - Rendered document block containing the row.
 * @param side - Rendered side item.
 * @returns Resolves after the two vertical centers are within two CSS pixels.
 */
async function expectAligned(anchor: Locator, side: Locator): Promise<void> {
  await expect
    .poll(async () => {
      const row = await anchor.locator(":scope > .rivto-block-row").boundingBox();
      const item = await side.boundingBox();
      return row && item ? Math.abs(row.y + row.height / 2 - item.y - item.height / 2) : Infinity;
    })
    .toBeLessThan(2);
}

test("renders and edits a side paragraph with the registered Markdown component", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  const side = page.locator('[data-journal-document="today"] [data-side-block-placement="left"]');
  const editor = side.getByRole("textbox", { name: "Markdown block content" });
  await expect(editor).toBeVisible();
  await editor.click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type("**Formatted side text**");
  await expect(editor).toHaveText("**Formatted side text**");
  await editor.blur();
  await expect(side.locator(".markdown-preview strong")).toHaveText("Formatted side text");
  await expect(side.locator("[data-drop-target]")).toHaveCount(0);
});

test("updates a side slider without changing the document block tree", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  const side = page.locator('[data-journal-document="today"] [data-side-block-placement="left"]');
  const rootIds = await page.evaluate(() => window.__rivtoDemo.editor.blocks.getRootIds());
  await side.getByRole("textbox", { name: "Markdown block content" }).click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type(" /slider");
  await expect(page.locator('[data-slash-command="type.demo.slider"]')).toBeVisible();
  await page.keyboard.press("Enter");
  const slider = side.getByRole("slider", { name: "Slider value" });
  await expect(slider).toBeVisible();
  await slider.focus();
  await page.keyboard.press("ArrowRight");
  await expect(slider).toHaveValue("51");
  expect(await page.evaluate(() => window.__rivtoDemo.editor.blocks.getRootIds())).toEqual(rootIds);
});

test("converts a side block to a counter and updates it", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  const side = page.locator('[data-journal-document="today"] [data-side-block-placement="left"]');
  await side.getByRole("textbox", { name: "Markdown block content" }).click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type(" /counter");
  await expect(page.locator('[data-slash-command="type.demo.counter"]')).toBeVisible();
  await page.keyboard.press("Enter");
  await side.getByRole("button", { name: "Count: 0" }).click();
  await expect(side.getByRole("button", { name: "Count: 1" })).toBeVisible();
});

test("inserts a separator and a writing block in a side note", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  const side = page.locator('[data-journal-document="today"] [data-side-block-placement="left"]');
  await side.getByRole("textbox", { name: "Markdown block content" }).click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type(" /separator");
  await expect(page.locator('[data-slash-command="block.separator.insert"]')).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(side.getByRole("separator", { name: "Block element separator" })).toBeVisible();
  await expect(side.locator("[data-side-block-card]")).toHaveCount(3);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(side.locator("[data-side-block-card]")).toHaveCount(1);
});

test("offers registered commands in the side panel", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  const side = page.locator('[data-journal-document="today"] [data-side-block-placement="left"]');
  await side.getByRole("textbox", { name: "Markdown block content" }).click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type(" /");
  const menu = page.locator("[data-slash-menu]");
  await expect(menu).toBeVisible();
  await expect(menu.locator('[data-slash-command="type.demo.slider"]')).toBeVisible();
  await expect(menu.locator('[data-slash-command="block.delete"]')).toBeVisible();
  await expect(menu.locator('[data-slash-command="block.duplicate"]')).toBeVisible();
});

test("duplicates a side block using the shared slash command", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  const side = page.locator('[data-journal-document="today"] [data-side-block-placement="left"]');
  const rootIds = await page.evaluate(() => window.__rivtoDemo.editor.blocks.getRootIds());
  const original = await side
    .getByRole("textbox", { name: "Markdown block content" })
    .textContent();
  await side.getByRole("textbox", { name: "Markdown block content" }).click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type(" /duplicate");
  await page.keyboard.press("Enter");
  await expect(side.locator("[data-side-block-card]")).toHaveCount(2);
  await expect(side.getByRole("textbox", { name: "Markdown block content" })).toHaveText([
    original!,
    original!,
  ]);
  expect(await page.evaluate(() => window.__rivtoDemo.editor.blocks.getRootIds())).toEqual(rootIds);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(side.locator("[data-side-block-card]")).toHaveCount(1);
});

test("renders editable Bento children in a side card", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  const side = page.locator('[data-journal-document="today"] [data-side-block-placement="left"]');
  const input = side.getByRole("textbox", { name: "Markdown block content" });
  await input.click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type(" /bento");
  await expect(page.locator('[data-slash-command="block.bento.insert"]')).toBeVisible();
  await page.keyboard.press("Enter");
  const board = side.locator('[data-block-type="bento"]');
  await expect(board).toBeVisible();
  const noteId = await side.getAttribute("data-side-block-id");
  await page.evaluate((id) => {
    const doc = window.__rivtoDemo.editor.getDocument();
    const key = `rivto.side-blocks.${id}`;
    const note = doc.pluginData.get<{ data: { rootBlockId: string } }>(key)!;
    const parentId = doc.blocks.getChildIds(note.data.rootBlockId)[0]!;
    window.__rivtoDemo.editor.blocks.insertBlock(
      {
        id: crypto.randomUUID(),
        type: "paragraph",
        content: "Tile",
        props: {},
        listProps: {},
        pluginData: {},
        children: [],
      },
      { parentId },
    );
  }, noteId);
  await expect(board.locator(".rivto-bento-tile")).not.toHaveCount(0);
  const child = side.locator(".rivto-bento-tile").first().getByRole("textbox", {
    name: "Markdown block content",
  });
  await child.fill("Side tile content");
  await expect(child).toHaveText("Side tile content");
  await page.evaluate(() => {
    window.__rivtoDemo.reactEditor.blockContextMenu.register({
      id: "test.nested-side-action",
      title: "Update nested block",
      execute: ({ reactPanel, blockId }) =>
        reactPanel.blocks.updateBlock(blockId, { content: "Updated nested block" }),
    });
  });
  await child.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Update nested block" }).click();
  await expect(child).toHaveText("Updated nested block");
  await child.fill("Keyboard target");
  await page.keyboard.press("Shift+F10");
  await page.getByRole("menuitem", { name: "Update nested block" }).click();
  await expect(child).toHaveText("Updated nested block");
  await expect(board).toHaveAttribute("data-block-type", "bento");
});

test("adds the first child to an empty side Bento with the keyboard", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  const side = page.locator('[data-journal-document="today"] [data-side-block-placement="left"]');
  await side.getByRole("textbox", { name: "Markdown block content" }).click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type(" /bento");
  await page.keyboard.press("Enter");
  const board = side.locator('[data-block-type="bento"]');
  await board.locator(".rivto-bento-summary").click();
  await page.keyboard.press("Enter");
  await expect(board.locator(".rivto-bento-tile")).toHaveCount(1);
  await expect(board.getByRole("textbox", { name: "Markdown block content" })).toBeFocused();
  await page.keyboard.press("ControlOrMeta+z");
  await expect(board.locator(".rivto-bento-tile")).toHaveCount(0);
});

test("expands a side Bento and edits its existing child", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  const side = page.locator('[data-journal-document="today"] [data-side-block-placement="left"]');
  const noteId = await side.getAttribute("data-side-block-id");
  await side.getByRole("textbox", { name: "Markdown block content" }).click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type(" /bento");
  await page.keyboard.press("Enter");
  const board = side.locator('[data-block-type="bento"]');
  await board.locator(".rivto-bento-summary").click();
  await page.keyboard.press("Enter");
  await board.getByRole("textbox", { name: "Markdown block content" }).fill("Before expansion");
  await board.getByRole("button", { name: "Expand Bento" }).click();
  const dialog = page.getByRole("dialog", { name: "Expanded Bento" });
  await expect(dialog).toBeVisible();
  const child = dialog.getByRole("textbox", { name: "Markdown block content" });
  await expect(child).toHaveText("Before expansion");
  await page.evaluate(() => window.__rivtoDemo.editor.history.clear());
  await child.fill("Edited in dialog");
  await expect
    .poll(() =>
      page.evaluate((id) => {
        const doc = window.__rivtoDemo.editor.getDocument();
        const note = doc.pluginData.get<{ data: { rootBlockId: string } }>(
          `rivto.side-blocks.${id}`,
        )!;
        const board = doc.blocks.getChildIds(note.data.rootBlockId)[0]!;
        return doc.blocks.getBlockNode(doc.blocks.getChildIds(board)[0]!)?.content;
      }, noteId),
    )
    .toBe("Edited in dialog");
  await page.evaluate(() => window.__rivtoDemo.editor.history.undo());
  await expect(child).toHaveText("Before expansion");
  await page.evaluate(() => window.__rivtoDemo.editor.history.redo());
  await expect(child).toHaveText("Edited in dialog");
  await dialog.getByRole("button", { name: "Collapse Bento" }).click();
  await expect(board.getByRole("textbox", { name: "Markdown block content" })).toHaveText(
    "Edited in dialog",
  );
});

for (const label of ["Kanban", "Table"]) {
  test(`expands the registered ${label} layout from a side block`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/");
    const side = page.locator('[data-journal-document="today"] [data-side-block-placement="left"]');
    await side.getByRole("textbox", { name: "Markdown block content" }).click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.type(` /${label.toLowerCase()}`);
    await page.locator(`[data-slash-command="block.${label.toLowerCase()}.insert"]`).click();
    const block = side.locator(`[data-block-type="${label.toLowerCase()}"]`);
    const childCount = await block.locator("[data-block-id]").count();
    expect(childCount).toBeGreaterThan(0);
    await block.getByRole("button", { name: `Expand ${label}` }).click();
    const dialog = page.getByRole("dialog", { name: `Expanded ${label}` });
    await expect(dialog.locator(`[data-block-type="${label.toLowerCase()}"]`)).toBeVisible();
    await expect(dialog.locator("[data-block-id]")).toHaveCount(childCount + 1);
    await dialog.getByRole("button", { name: `Collapse ${label}` }).click();
    await expect(block).toBeVisible();
  });
}

test("adds a row in a side table using its registered control", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  const side = page.locator('[data-journal-document="today"] [data-side-block-placement="left"]');
  await side.getByRole("textbox", { name: "Markdown block content" }).click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type(" /table");
  await page.locator('[data-slash-command="block.table.insert"]').click();
  const table = side.locator('[data-block-type="table"]');
  const rows = table.locator('[data-block-type="table-row"]');
  await expect(rows).toHaveCount(3);
  await rows.first().hover();
  await rows.first().getByRole("button", { name: "Add table row below" }).click();
  await expect(rows).toHaveCount(4);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(rows).toHaveCount(3);
});

test("indents and outdents side writing blocks with the keyboard", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  const side = page.locator('[data-journal-document="today"] [data-side-block-placement="left"]');
  await addSideBlock(page, side);
  const second = side.getByRole("textbox", { name: "Markdown block content" }).nth(1);
  await second.fill("Nested writing block");
  await second.press("Tab");
  const roots = side.locator("[data-side-block-card]");
  await expect(roots).toHaveCount(1);
  await expect(roots.first().getByRole("textbox", { name: "Markdown block content" })).toHaveCount(
    2,
  );
  await page.evaluate(() => window.__rivtoDemo.editor.history.undo());
  await expect(roots).toHaveCount(2);
  await page.evaluate(() => window.__rivtoDemo.editor.history.redo());
  await expect(roots).toHaveCount(1);
  await second.press("Shift+Tab");
  await expect(roots).toHaveCount(2);
});

test("respects registered move restrictions when indenting side blocks", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  const side = page.locator('[data-journal-document="today"] [data-side-block-placement="left"]');
  await addSideBlock(page, side);
  const inputs = side.getByRole("textbox", { name: "Markdown block content" });
  const parentId = await inputs
    .first()
    .evaluate((input) => input.closest<HTMLElement>("[data-block-id]")?.dataset.blockId);
  await page.evaluate((id) => {
    window.__rivtoDemo.reactEditor.blockBehaviors.register({
      isAvailable: ({ block }) => block.id === id,
      canMove: () => false,
    });
  }, parentId);
  await inputs.nth(1).fill("Keep at root");
  await inputs.nth(1).press("Tab");
  await expect(side.locator("[data-side-block-card]")).toHaveCount(2);
  await expect(inputs.nth(1)).toHaveText("Keep at root");
});

test("moves side blocks with the keyboard and undoes the move", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  const side = page.locator('[data-journal-document="today"] [data-side-block-placement="left"]');
  await addSideBlock(page, side);
  const inputs = side.getByRole("textbox", { name: "Markdown block content" });
  await inputs.nth(1).fill("Second block");
  await inputs.nth(1).press("Alt+Shift+ArrowUp");
  await expect(inputs.first()).toHaveText("Second block");
  await page.evaluate(() => window.__rivtoDemo.editor.history.undo());
  await expect(inputs.nth(1)).toHaveText("Second block");
});

test("registered commands can indent and outdent side blocks", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await page.evaluate(() => {
    const commands = window.__rivtoDemo.reactEditor.slashCommands;
    commands.register({
      id: "test.side-indent",
      title: "Side indent",
      keywords: ["side-indent"],
      execute: ({ reactPanel, blockId }) => reactPanel.blocks.indentBlock(blockId),
    });
    commands.register({
      id: "test.side-outdent",
      title: "Side outdent",
      keywords: ["side-outdent"],
      execute: ({ reactPanel, blockId }) => reactPanel.blocks.outdentBlock(blockId),
    });
  });
  const side = page.locator('[data-journal-document="today"] [data-side-block-placement="left"]');
  await addSideBlock(page, side);
  let child = side.getByRole("textbox", { name: "Markdown block content" }).nth(1);
  await child.fill("Child");
  await page.keyboard.type(" /side-indent");
  await page.locator('[data-slash-command="test.side-indent"]').click();
  await expect(side.locator("[data-side-block-card]")).toHaveCount(1);
  child = side.getByRole("textbox", { name: "Markdown block content" }).nth(1);
  await child.click();
  await child.press("ControlOrMeta+End");
  await page.keyboard.type(" /side-outdent");
  await page.locator('[data-slash-command="test.side-outdent"]').click();
  await expect(side.locator("[data-side-block-card]")).toHaveCount(2);
  await expect(side.getByRole("textbox", { name: "Markdown block content" }).nth(1)).toHaveText(
    "Child ",
  );
});

test("merges adjacent side writing blocks with Backspace and undoes the merge", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  const side = page.locator('[data-journal-document="today"] [data-side-block-placement="left"]');
  await addSideBlock(page, side);
  const inputs = side.getByRole("textbox", { name: "Markdown block content" });
  const firstText = await inputs.first().textContent();
  await inputs.nth(1).fill("Second block");
  await inputs.nth(1).press("ControlOrMeta+Home");
  await page.keyboard.press("Backspace");
  await expect(side.locator("[data-side-block-card]")).toHaveCount(1);
  await expect(inputs.first()).toHaveText(`${firstText}Second block`);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(side.locator("[data-side-block-card]")).toHaveCount(2);
  await expect(inputs.nth(1)).toHaveText("Second block");
});

test("outdents a nested side block with Backspace at its start", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  const side = page.locator('[data-journal-document="today"] [data-side-block-placement="left"]');
  const noteId = await side.getAttribute("data-side-block-id");
  await page.evaluate((id) => {
    const doc = window.__rivtoDemo.editor.getDocument();
    const key = `rivto.side-blocks.${id}`;
    const note = doc.pluginData.get<{ data: { rootBlockId: string } }>(key)!;
    const parentId = doc.blocks.getChildIds(note.data.rootBlockId)[0]!;
    window.__rivtoDemo.editor.blocks.insertBlock(
      {
        id: crypto.randomUUID(),
        type: "paragraph",
        content: "Child",
        props: {},
        listProps: {},
        pluginData: {},
        children: [],
      },
      { parentId },
    );
  }, noteId);
  const child = side.getByRole("textbox", { name: "Markdown block content" }).nth(1);
  await child.click();
  await child.press("ControlOrMeta+Home");
  await page.keyboard.press("Backspace");
  await expect(side.locator("[data-side-block-card]")).toHaveCount(2);
  await expect(side.getByRole("textbox", { name: "Markdown block content" }).nth(1)).toHaveText(
    "Child",
  );
});

test("merges the next side writing block with Delete", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  const side = page.locator('[data-journal-document="today"] [data-side-block-placement="left"]');
  await addSideBlock(page, side);
  const inputs = side.getByRole("textbox", { name: "Markdown block content" });
  const firstText = await inputs.first().textContent();
  await inputs.nth(1).fill("Next block");
  await inputs.first().click();
  await inputs.first().press("ControlOrMeta+End");
  await page.keyboard.press("Delete");
  await expect(side.locator("[data-side-block-card]")).toHaveCount(1);
  await expect(inputs.first()).toHaveText(`${firstText}Next block`);
});

for (const type of ["columns", "kanban", "table"]) {
  test(`converts a side block to ${type} with its registered child layout`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/");
    const side = page.locator('[data-journal-document="today"] [data-side-block-placement="left"]');
    const input = side.getByRole("textbox", { name: "Markdown block content" });
    await input.click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.type(` /${type}`);
    await expect(page.locator(`[data-slash-command="block.${type}.insert"]`)).toBeVisible();
    await page.locator(`[data-slash-command="block.${type}.insert"]`).click();
    const block = side.locator(`[data-block-type="${type}"]`);
    await expect(block).toBeVisible();
    await expect(block.locator("[data-block-id]").first()).toBeVisible();
  });
}

test("edits both columns inside a narrow side card", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  const side = page.locator('[data-journal-document="today"] [data-side-block-placement="left"]');
  await side.getByRole("textbox", { name: "Markdown block content" }).click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type(" /columns");
  await page.locator('[data-slash-command="block.columns.insert"]').click();
  const columns = side.locator('[data-block-type="columns-column"]');
  await expect(columns).toHaveCount(2);
  for (const [index, value] of ["First lane", "Second lane"].entries()) {
    const lane = columns.nth(index);
    const empty = lane.getByRole("button", { name: "Column", exact: true });
    await expect(empty).toBeVisible();
    await empty.click();
    const input = lane.getByRole("textbox", { name: "Markdown block content" });
    await expect(input).toBeVisible();
    await input.fill(value);
    await expect(input).toHaveText(value);
    await expect.poll(async () => (await input.boundingBox())?.width).toBeGreaterThanOrEqual(24);
    expect(await input.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
      true,
    );
    expect(await input.evaluate((element) => element.scrollHeight <= element.clientHeight)).toBe(
      true,
    );
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

for (const count of [3, 6]) {
  test(`keeps ${count} side columns editable without horizontal scrolling`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/");
    const side = page.locator('[data-journal-document="today"] [data-side-block-placement="left"]');
    await side.getByRole("textbox", { name: "Markdown block content" }).click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.type(" /columns");
    await page.locator('[data-slash-command="block.columns.insert"]').click();
    await side
      .locator('[data-block-type="columns"]')
      .getByRole("button", { name: "Columns settings" })
      .click();
    for (let index = 2; index < count; index += 1) {
      await page.getByRole("button", { name: "Add column" }).click();
    }
    await page.keyboard.press("Escape");
    const lanes = side.locator('[data-block-type="columns-column"]');
    await expect(lanes).toHaveCount(count);
    await expect(side.locator(".rivto-columns-children")).toHaveAttribute(
      "data-block-drop-axis",
      "vertical",
    );
    for (let index = 0; index < count; index += 1) {
      const value = `Lane ${index + 1}`;
      const lane = lanes.nth(index);
      await lane.getByRole("button", { name: "Column", exact: true }).click();
      const input = lane.getByRole("textbox", { name: "Markdown block content" });
      await expect.poll(async () => (await input.boundingBox())?.width).toBeGreaterThanOrEqual(80);
      await input.fill(value);
      await expect(input).toHaveText(value);
      expect(await input.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
        true,
      );
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}

test("growing side-column text does not remeasure unchanged width", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  const side = page.locator('[data-journal-document="today"] [data-side-block-placement="left"]');
  await side.getByRole("textbox", { name: "Markdown block content" }).click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type(" /columns");
  await page.locator('[data-slash-command="block.columns.insert"]').click();
  const lane = side.locator('[data-block-type="columns-column"]').first();
  await lane.getByRole("button", { name: "Column", exact: true }).click();
  const input = lane.getByRole("textbox", { name: "Markdown block content" });
  await waitTwoFrames(page);
  await page.evaluate(() => {
    const tracked = document.querySelector(
      '[data-journal-document="today"] [data-side-block-placement="left"] .rivto-columns-children',
    );
    const original = window.getComputedStyle;
    const state = window as ColumnStyleWindow;
    state.columnStyleReads = 0;
    state.columnSizeChanges = 0;
    state.columnObserver = new ResizeObserver(() => {
      state.columnSizeChanges += 1;
    });
    state.columnObserver.observe(tracked!);
    state.originalGetComputedStyle = original;
    window.getComputedStyle = (element, pseudo) => {
      if (element === tracked) {
        state.columnStyleReads += 1;
      }
      return original.call(window, element, pseudo);
    };
  });
  for (const value of ["short", "long line ".repeat(25).trim()]) {
    await input.fill(value);
    await expect(input).toHaveText(value);
    await waitTwoFrames(page);
  }
  const reads = await page.evaluate(() => {
    const state = window as ColumnStyleWindow;
    window.getComputedStyle = state.originalGetComputedStyle;
    state.columnObserver.disconnect();
    return { reads: state.columnStyleReads, sizeChanges: state.columnSizeChanges };
  });
  expect(reads.sizeChanges).toBeGreaterThan(0);
  expect(reads.reads).toBeLessThanOrEqual(1);
});

test("removes a side column without losing its nested blocks", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  const side = page.locator('[data-journal-document="today"] [data-side-block-placement="left"]');
  const noteId = await side.getAttribute("data-side-block-id");
  const documentRoots = await page.evaluate(() => window.__rivtoDemo.editor.blocks.getRootIds());
  await side.getByRole("textbox", { name: "Markdown block content" }).click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type(" /columns");
  await page.locator('[data-slash-command="block.columns.insert"]').click();
  const board = side.locator('[data-block-type="columns"]');
  const columns = board.locator('[data-block-type="columns-column"]');
  await expect(columns).toHaveCount(2);
  await page.evaluate((id) => {
    const doc = window.__rivtoDemo.editor.getDocument();
    const key = `rivto.side-blocks.${id}`;
    const note = doc.pluginData.get<{ data: { rootBlockId: string } }>(key)!;
    const boardId = doc.blocks.getChildIds(note.data.rootBlockId)[0]!;
    const parentId = doc.blocks.getChildIds(boardId)[1]!;
    window.__rivtoDemo.editor.blocks.insertBlock(
      {
        id: crypto.randomUUID(),
        type: "paragraph",
        content: "Keep this",
        props: {},
        listProps: {},
        pluginData: {},
        children: [],
      },
      { parentId },
    );
  }, noteId);
  await expect(columns.nth(1)).toContainText("Keep this");
  await page.evaluate(() => window.__rivtoDemo.editor.history.clear());
  await board.getByRole("button", { name: "Columns settings" }).click();
  await page.getByRole("button", { name: "Remove column" }).click();
  await expect(columns).toHaveCount(1);
  await expect(columns.first()).toContainText("Keep this");
  expect(await page.evaluate(() => window.__rivtoDemo.editor.blocks.getRootIds())).toEqual(
    documentRoots,
  );
  await page.evaluate(() => window.__rivtoDemo.editor.history.undo());
  await expect(columns).toHaveCount(2);
  await expect(columns.nth(1)).toContainText("Keep this");
});

test("deletes a side block using the shared slash command", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  const today = page.locator('[data-journal-document="today"]');
  const side = today.locator('[data-side-block-placement="left"]');
  const rootIds = await page.evaluate(() => window.__rivtoDemo.editor.blocks.getRootIds());
  await side.getByRole("textbox", { name: "Markdown block content" }).click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type(" /delete");
  await expect(page.locator('[data-slash-command="block.delete"]')).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(side.locator("[data-side-block-card]")).toHaveCount(0);
  expect(await page.evaluate(() => window.__rivtoDemo.editor.blocks.getRootIds())).toEqual(rootIds);
});

test("deletes selected side text without changing the anchored page", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  const today = page.locator('[data-journal-document="today"]');
  const pageContent = today.locator(".page-surface [data-block-content]").first();
  const before = await pageContent.textContent();
  const side = today.locator('[data-side-block-placement="left"]');
  const editor = side.getByRole("textbox", { name: "Markdown block content" });
  await page.evaluate(() => window.__rivtoDemo.editor.history.clear());
  await editor.click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("Backspace");
  await expect(editor).toHaveText("");
  await expect(pageContent).toHaveText(before ?? "");
  await page.keyboard.press("ControlOrMeta+z");
  await expect(editor).toHaveText("A note on the left.");
});

test("the default demo shows left and right notes without changing the page layout", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  const today = page.locator('[data-journal-document="today"]');
  const surface = today.locator(".page-surface").first();
  await expect(surface).toHaveCSS("min-height", "160px");
  const left = today.locator('[data-side-block-placement="left"]');
  const right = today.locator('[data-side-block-placement="right"]');
  await expect(left).toBeVisible();
  await expect(right).toBeVisible();
  await expect(left.getByRole("textbox", { name: "Markdown block content" })).toHaveText(
    "A note on the left.",
  );
  await expect(right.getByRole("textbox", { name: "Markdown block content" })).toHaveText(
    "A note on the right.",
  );
  const paper = (await surface.boundingBox())!;
  const leftBox = (await left.boundingBox())!;
  const rightBox = (await right.boundingBox())!;
  expect(leftBox.x + leftBox.width).toBeLessThanOrEqual(paper.x);
  expect(rightBox.x).toBeGreaterThanOrEqual(paper.x + paper.width);
  expect(Math.abs(leftBox.y - rightBox.y)).toBeLessThan(2);
  const contents = today.locator(".page-surface [data-block-content]");
  await expect(contents.first()).toContainText("A weekend outdoors");
  await expect(contents.nth(4)).toContainText("The lake is usually quiet");
  await expect.poll(async () => (await contents.first().boundingBox())?.height).toBeGreaterThan(30);
  await expect.poll(async () => (await contents.nth(3).boundingBox())?.height).toBeGreaterThan(30);
  const before = await contents.evaluateAll((elements) =>
    elements.slice(0, 5).map((element) => {
      const bounds = element.getBoundingClientRect();
      return { x: bounds.x, y: bounds.y, width: bounds.width };
    }),
  );
  await left.getByRole("textbox", { name: "Markdown block content" }).fill("Updated left note");
  await right.getByRole("textbox", { name: "Markdown block content" }).fill("Updated right note");
  await expect(left.getByRole("textbox", { name: "Markdown block content" })).toHaveText(
    "Updated left note",
  );
  await expect(right.getByRole("textbox", { name: "Markdown block content" })).toHaveText(
    "Updated right note",
  );
  await left.locator("[data-side-note]").hover();
  await left.getByRole("button", { name: "Delete note" }).click();
  await right.locator("[data-side-note]").hover();
  await right.getByRole("button", { name: "Delete note" }).click();
  await expect(today.locator("[data-side-block-id]")).toHaveCount(0);
  const after = await contents.evaluateAll((elements) =>
    elements.slice(0, 5).map((element) => {
      const bounds = element.getBoundingClientRect();
      return { x: bounds.x, y: bounds.y, width: bounds.width };
    }),
  );
  expect(after).toEqual(before);
});

test("the demo stacks flow notes after the page on a narrow viewport", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto("/");
  const today = page.locator('[data-journal-document="today"]');
  const surface = today.locator(".page-surface").first();
  await expect(surface).toBeVisible();
  const surfaceBounds = (await surface.boundingBox())!;
  const boxes = [];
  for (const placement of ["left", "right"]) {
    const side = today.locator(`[data-side-block-placement="${placement}"]`);
    await expect(side).toBeVisible();
    const bounds = (await side.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(375);
    await expect(side.getByRole("textbox", { name: "Markdown block content" })).toBeVisible();
    expect(bounds.y).toBeGreaterThanOrEqual(surfaceBounds.y + surfaceBounds.height);
    boxes.push(bounds);
  }
  boxes.sort((first, second) => first.y - second.y);
  expect(boxes[1]!.y).toBeGreaterThanOrEqual(boxes[0]!.y + boxes[0]!.height);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("adds and removes independent blocks on both sides without moving the page", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  const today = page.locator('[data-journal-document="today"]');
  const content = today.locator(".page-surface [data-block-content]").first();
  await expect.poll(async () => (await content.boundingBox())?.height).toBeGreaterThan(30);
  const before = (await content.boundingBox())!;
  for (const placement of ["left", "right"]) {
    const side = today.locator(`[data-side-block-placement="${placement}"]`);
    const id = await side.getAttribute("data-side-block-id");
    const originalId = await page.evaluate((blockId) => {
      const doc = window.__rivtoDemo.editor.getDocument();
      const note = doc.pluginData.get<{ data: { rootBlockId: string } }>(
        `rivto.side-blocks.${blockId}`,
      );
      return note && doc.blocks.getChildIds(note.data.rootBlockId)[0];
    }, id);
    await addSideBlock(page, side);
    const blocks = side.getByRole("textbox", { name: "Markdown block content" });
    await expect(blocks).toHaveCount(2);
    const cards = side.locator("[data-side-block-card]");
    await expect(cards).toHaveCount(2);
    const firstCard = (await cards.first().boundingBox())!;
    const secondCard = (await cards.nth(1).boundingBox())!;
    expect(secondCard.y).toBeGreaterThanOrEqual(firstCard.y + firstCard.height);
    await blocks.nth(1).fill(`Second ${placement} block`);
    await blocks.first().fill("Long note\n".repeat(12));
    await expect
      .poll(() => blocks.first().evaluate((element) => element.scrollHeight - element.clientHeight))
      .toBeLessThanOrEqual(1);
    await expect
      .poll(async () => (await cards.nth(1).boundingBox())!.y)
      .toBeGreaterThan(secondCard.y);
    await blocks.first().fill(`A note on the ${placement}.`);
    await expect
      .poll(async () => (await cards.nth(1).boundingBox())!.y)
      .toBeLessThanOrEqual(secondCard.y + 1);
    const saved = await page.evaluate((blockId) => {
      const doc = window.__rivtoDemo.editor.getDocument();
      const note = doc.pluginData.get<{ data: { rootBlockId: string } }>(
        `rivto.side-blocks.${blockId}`,
      )!;
      return {
        rootBlockId: note.data.rootBlockId,
        blocks: doc.blocks.getBlock(note.data.rootBlockId)?.children,
      };
    }, id);
    expect(saved?.blocks).toEqual([
      {
        id: expect.any(String),
        type: "paragraph",
        content: `A note on the ${placement}.`,
        props: {},
        listProps: { backgroundColor: "", type: "list", checked: false, collapsed: false },
        pluginData: {},
        children: [],
      },
      {
        id: expect.any(String),
        type: "paragraph",
        content: `Second ${placement} block`,
        props: {},
        listProps: { backgroundColor: "", type: "list", checked: false, collapsed: false },
        pluginData: {},
        children: [],
      },
    ]);
    expect(saved!.blocks![0]!.id).not.toBe(saved!.blocks![1]!.id);
    expect(saved!.blocks![0]!.id).toBe(originalId);
    const snapshotData = await page.evaluate((blockId) => {
      const snapshot = window.__rivtoDemo.editor.getDocument().getSnapshot();
      return (snapshot.pluginData?.[`rivto.side-blocks.${blockId}`] as { data: unknown }).data;
    }, id);
    expect(snapshotData).toEqual({ rootBlockId: saved.rootBlockId });
    const snapshotBlocks = await page.evaluate(
      (rootId) =>
        window.__rivtoDemo.editor
          .getDocument()
          .getSnapshot()
          .additionalBlocks?.find((block) => block.id === rootId)?.children,
      saved.rootBlockId,
    );
    expect(snapshotBlocks).toEqual(saved.blocks);
    await page.evaluate(() => window.__rivtoDemo.editor.history.clear());
    await deleteSideCard(page, side.locator("[data-side-block-card]").first());
    await expect(blocks).toHaveCount(1);
    await expect(blocks.first()).toHaveText(`Second ${placement} block`);
    await page.evaluate(() => window.__rivtoDemo.editor.history.undo());
    await expect(blocks).toHaveCount(2);
    await expect(blocks.first()).toHaveText(`A note on the ${placement}.`);
  }
  const after = (await content.boundingBox())!;
  expect({ x: after.x, y: after.y, width: after.width }).toEqual({
    x: before.x,
    y: before.y,
    width: before.width,
  });
});

test("left and right remain on their physical sides in RTL", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await page.evaluate(() => {
    document.documentElement.dir = "rtl";
  });
  const today = page.locator('[data-journal-document="today"]');
  const paper = today.locator(".page-surface").first();
  const left = today.locator('[data-side-block-placement="left"]');
  const right = today.locator('[data-side-block-placement="right"]');
  await expect(left).toBeVisible();
  await expect(right).toBeVisible();
  await expect
    .poll(async () => {
      const surfaceBox = await paper.boundingBox();
      const leftBox = await left.boundingBox();
      const rightBox = await right.boundingBox();
      return (
        !!surfaceBox &&
        !!leftBox &&
        !!rightBox &&
        leftBox.x + leftBox.width <= surfaceBox.x &&
        rightBox.x >= surfaceBox.x + surfaceBox.width
      );
    })
    .toBe(true);
});

test("edits a comment alongside its anchor and keeps it outside the page surface", async ({
  page,
}) => {
  await page.goto("/?sideBlocks=1");
  const document = page.locator('[data-journal-document="today"]');
  const content = document.locator("[data-block-content]").first();
  await content.click();
  await page.keyboard.press("End");
  await page.keyboard.type(" /comment");
  await page.locator('[data-slash-command="comment.create"]').click();

  const anchor = content.locator("xpath=ancestor::*[@data-block-id][1]");
  const side = document.locator("[data-side-block-id]");
  const thread = side.locator("[data-comment-thread-id]");
  await expect(thread).toBeVisible();
  await expect(document.locator(".page-surface [data-comment-thread-id]")).toHaveCount(0);
  await expectAligned(anchor, side);
  await thread.getByRole("textbox", { name: "New comment" }).fill("Please clarify");
  await thread.getByRole("button", { name: "Comment", exact: true }).click();
  await expect(thread).toContainText("Please clarify");
  await expect(thread).toContainText("Demo User");
  await expect
    .poll(async () => {
      const card = await side.boundingBox();
      const next = await document.locator("[data-block-content]").nth(1).boundingBox();
      return card && next ? next.y - (card.y + card.height) : -Infinity;
    })
    .toBeGreaterThanOrEqual(-1);
  const originalText = await content.textContent();
  await content.click();
  await page.keyboard.press("End");
  await page.keyboard.type("x");
  await expect(content).toHaveText(`${originalText}x`);
  await thread.getByRole("textbox", { name: "Reply to comment" }).fill("A reply");
  await thread.getByRole("button", { name: "Reply", exact: true }).click();
  await expect(thread).toContainText("A reply");
  await thread.getByRole("button", { name: "Edit", exact: true }).last().click();
  await thread.getByRole("textbox", { name: "Edit comment" }).fill("Edited reply");
  await thread.getByRole("button", { name: "Save" }).click();
  await expect(thread).toContainText("Edited reply");
  await thread.getByRole("button", { name: "Resolve" }).click();
  await expect(thread).toHaveAttribute("data-comment-resolved", "true");
  await thread.getByRole("button", { name: "Reopen" }).click();
  await thread.getByRole("button", { name: "Delete message" }).first().click();
  await expect(thread).toHaveCount(0);
  await page.locator('[data-editor-action="undo"]').first().click();
  await expect(thread).toContainText("Please clarify");
  await expect(thread).toContainText("Edited reply");
});

test("reserves space for multiple comments on the same block", async ({ page }) => {
  await page.goto("/?sideBlocks=1");
  const document = page.locator('[data-journal-document="today"]');
  const content = document.locator("[data-block-content]").first();
  for (let index = 0; index < 2; index += 1) {
    await content.click();
    await page.keyboard.press("End");
    await page.keyboard.type(" /comment");
    await page.locator('[data-slash-command="comment.create"]').click();
  }
  const comments = document.locator('[data-side-block-spacing="reserve"]');
  await expect(comments).toHaveCount(2);
  await expect
    .poll(async () => {
      const first = await comments.nth(0).boundingBox();
      const second = await comments.nth(1).boundingBox();
      const following = await document.locator("[data-block-content]").nth(1).boundingBox();
      return first && second && following
        ? Math.min(second.y - first.y - first.height, following.y - second.y - second.height)
        : -Infinity;
    })
    .toBeGreaterThanOrEqual(-1);
});

test("lets flow notes grow without moving following blocks and reserves a full-width note", async ({
  page,
}) => {
  await page.goto("/?sideBlocks=1");
  const document = page.locator('[data-journal-document="today"]');
  const contents = document.locator("[data-block-content]");
  const first = contents.first();
  const following = contents.nth(1);
  await first.click();
  await page.keyboard.press("End");
  await page.keyboard.type(" /side");
  await page.locator('[data-slash-command="side-note.flow"]').click();
  const flow = document.locator("[data-side-note]");
  await expect(flow).toBeVisible();
  await flow
    .getByRole("textbox", { name: "Markdown block content" })
    .fill("A lightweight side note");
  const before = await following.boundingBox();
  await flow
    .getByRole("textbox", { name: "Markdown block content" })
    .evaluate((element: HTMLTextAreaElement) => {
      element.style.height = "240px";
    });
  await expect.poll(async () => (await flow.boundingBox())?.height).toBeGreaterThan(240);
  const after = await following.boundingBox();
  expect(before && after ? Math.abs(before.y - after.y) : Infinity).toBeLessThan(2);

  await flow.hover();
  await flow.getByRole("button", { name: "Delete note" }).click();
  await first.click();
  await page.keyboard.press("End");
  await page.keyboard.type(" /full");
  await page.locator('[data-slash-command="side-note.full"]').click();
  const full = document.locator('[data-side-block-placement="full"]');
  await expect(full).toBeVisible();
  await expect
    .poll(async () => {
      const item = await full.boundingBox();
      const next = await following.boundingBox();
      return item && next ? next.y - (item.y + item.height) : -Infinity;
    })
    .toBeGreaterThanOrEqual(-1);
  await full.locator("[data-side-note]").hover();
  await full.getByRole("button", { name: "Delete note" }).click();
  await expect(full).toHaveCount(0);
  const row = first.locator(
    "xpath=ancestor::*[contains(concat(' ', normalize-space(@class), ' '), ' rivto-block-row ')][1]",
  );
  await expect
    .poll(() => row.evaluate((element: HTMLElement) => element.style.marginBottom))
    .toBe("");
});

test("comments on a selected canvas element outside the transformed viewport", async ({ page }) => {
  await page.goto("/?sideBlocks=1");
  await page.locator('[data-editor-mode="edgeless"]').click();
  const document = page.locator('[data-journal-document="today"]');
  const visual = document.locator('[data-edgeless-visual-kind="rectangle"]').first();
  await visual.click();
  await expect(visual).toHaveAttribute("data-selected", "true");
  const sidebar = document.getByRole("complementary", { name: "Comments" });
  await sidebar.getByRole("button", { name: "Comment on selection" }).click();
  const thread = sidebar.locator("[data-comment-thread-id]");
  await expect(thread).toBeVisible();
  await thread.getByRole("textbox", { name: "New comment" }).fill("Canvas feedback");
  await thread.getByRole("button", { name: "Comment", exact: true }).click();
  await expect(thread).toContainText("Canvas feedback");
  await expect(document.locator(".edgeless-viewport [data-comment-thread-id]")).toHaveCount(0);
  await page.locator('[data-editor-mode="block"]').click();
  await expect(document.locator("[data-comment-thread-id]")).toHaveCount(0);
  await page.locator('[data-editor-mode="edgeless"]').click();
  await expect(document.getByRole("complementary", { name: "Comments" })).toContainText(
    "Canvas feedback",
  );
});

test("a full-width flow item does not reserve vertical space", async ({ page }) => {
  await page.goto("/?test_features=1&sideBlocks=1");
  const today = page.locator('[data-journal-document="today"]');
  const following = today.locator("[data-block-content]").nth(1);
  await expect(following).toBeVisible();
  await page.evaluate(() => {
    const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }).__rivtoDemo
      .editor;
    const root = editor.blocks.insertBlock(
      {
        type: "paragraph",
        children: [{ type: "paragraph", content: "Full-width flow" }],
      },
      { parentId: null, additional: true },
    );
    editor.getDocument().pluginData.set("rivto.side-blocks.full-flow", {
      id: "full-flow",
      anchorId: editor.blocks.getRootIds()[0],
      anchorType: "block",
      type: "note",
      spacing: "flow",
      placement: "full",
      createdAt: 1,
      data: { rootBlockId: root.id },
    });
  });
  const note = today.locator('[data-side-block-id="full-flow"]');
  await expect(note).toBeVisible();
  const before = await following.evaluate(
    (element) => element.getBoundingClientRect().top + window.scrollY,
  );
  await note
    .getByRole("textbox", { name: "Markdown block content" })
    .fill("Long note\n".repeat(16));
  await expect.poll(async () => (await note.boundingBox())?.height).toBeGreaterThan(240);
  const after = await following.evaluate(
    (element) => element.getBoundingClientRect().top + window.scrollY,
  );
  expect(Math.abs(after - before)).toBeLessThan(2);
});

test("does not render an anchor's side content in its embedding", async ({ page }) => {
  await page.goto("/?test_features=1&sideBlocks=1");
  const today = page.locator('[data-journal-document="today"]');
  const embedded = today.getByRole("region", { name: "Block editor" });
  await expect(embedded.locator("[data-block-id]")).toHaveCount(5);
  const target = await page.evaluate(() => {
    const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }).__rivtoDemo
      .editor;
    const embedding = editor.blocks.getBlocks().find((block) => block.type === "embedding")!;
    const anchorId = String(embedding.props.targetBlockId);
    editor.getDocument().pluginData.set("rivto.side-blocks.embed-check", {
      id: "embed-check",
      anchorId,
      anchorType: "block",
      type: "note",
      spacing: "reserve",
      placement: "right",
      createdAt: 1,
      data: {
        rootBlockId: editor.blocks.insertBlock(
          { type: "paragraph", children: [{ type: "paragraph", content: "outside embedding" }] },
          { parentId: null, additional: true },
        ).id,
      },
    });
    return anchorId;
  });
  await expect(today.locator('[data-side-block-id="embed-check"]')).toBeVisible();
  await expect(today.locator(`[data-block-id="${target}"]`).first()).toBeVisible();
  await expect(embedded.locator("[data-side-block-id]")).toHaveCount(0);
  await expect(embedded.locator("[data-side-blocks-editor]")).toHaveCount(0);
  await embedded.locator("[data-block-content]").first().click();
  await page.keyboard.press("End");
  await page.keyboard.type(" /comment");
  await expect(page.locator('[data-slash-command="comment.create"]')).toHaveCount(0);
});

test("stacks multiple side blocks without overlap and reserves space for a later item", async ({
  page,
}) => {
  await page.goto("/?test_features=1&sideBlocks=1");
  const today = page.locator('[data-journal-document="today"]');
  await expect(today.locator("[data-block-content]").first()).toBeVisible();
  await page.evaluate(() => {
    const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }).__rivtoDemo
      .editor;
    const anchorId = editor.blocks.getRootIds()[0]!;
    for (const [id, spacing, createdAt] of [
      ["first", "flow", 1],
      ["second", "reserve", 2],
    ] as const) {
      editor.getDocument().pluginData.set(`rivto.side-blocks.${id}`, {
        id,
        anchorId,
        anchorType: "block",
        type: "note",
        spacing,
        placement: "right",
        createdAt,
        data: {
          rootBlockId: editor.blocks.insertBlock(
            { type: "paragraph", children: [{ type: "paragraph", content: id }] },
            { parentId: null, additional: true },
          ).id,
        },
      });
    }
  });
  const first = today.locator('[data-side-block-id="first"]');
  const second = today.locator('[data-side-block-id="second"]');
  await expect(first).toBeVisible();
  await expect(second).toBeVisible();
  await expect
    .poll(async () => {
      const left = await first.boundingBox();
      const right = await second.boundingBox();
      return left && right ? right.y - (left.y + left.height) : -Infinity;
    })
    .toBeGreaterThanOrEqual(0);
  const following = today.locator("[data-block-content]").nth(1);
  await expect
    .poll(async () => {
      const item = await second.boundingBox();
      const next = await following.boundingBox();
      return item && next ? next.y - (item.y + item.height) : -Infinity;
    })
    .toBeGreaterThanOrEqual(-1);
});

test("keeps side content attached when its anchor moves", async ({ page }) => {
  await page.goto("/?test_features=1&sideBlocks=1");
  const today = page.locator('[data-journal-document="today"]');
  await expect(today.locator("[data-block-content]").first()).toBeVisible();
  const ids = await page.evaluate(() => {
    const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }).__rivtoDemo
      .editor;
    const [anchor, next] = editor.blocks.getRootIds();
    editor.getDocument().pluginData.set("rivto.side-blocks.moving", {
      id: "moving",
      anchorId: anchor,
      anchorType: "block",
      type: "note",
      spacing: "reserve",
      placement: "right",
      createdAt: 1,
      data: {
        rootBlockId: editor.blocks.insertBlock(
          { type: "paragraph", children: [{ type: "paragraph", content: "Move with anchor" }] },
          { parentId: null, additional: true },
        ).id,
      },
    });
    return { anchor: anchor!, next: next! };
  });
  const anchor = today.locator(`[data-block-id="${ids.anchor}"]`).first();
  const note = today.locator('[data-side-block-id="moving"]');
  await expect(note).toBeVisible();
  await expectAligned(anchor, note);
  const previousTop = (await anchor.boundingBox())!.y;
  await page.evaluate(({ anchor, next }) => {
    const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }).__rivtoDemo
      .editor;
    editor.blocks.moveBlocks([anchor], next, "after");
  }, ids);
  await expect.poll(async () => (await anchor.boundingBox())?.y).not.toBe(previousTop);
  await expectAligned(anchor, note);
  await expect
    .poll(async () => {
      const endpoint = await note
        .locator("[data-side-block-connector] path")
        .evaluate((path: SVGPathElement) => {
          const point = path.getPointAtLength(path.getTotalLength());
          const matrix = path.getScreenCTM()!;
          return {
            x: point.x * matrix.a + point.y * matrix.c + matrix.e,
            y: point.x * matrix.b + point.y * matrix.d + matrix.f,
          };
        });
      const row = await anchor.locator(":scope > .rivto-block-row").boundingBox();
      return row
        ? Math.hypot(endpoint.x - row.x - row.width, endpoint.y - row.y - row.height / 2)
        : Infinity;
    })
    .toBeLessThan(2);
  await page.setViewportSize({ width: 1000, height: 700 });
  await expectAligned(anchor, note);
});

test("connects every side card from its inner edge", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  const today = page.locator('[data-journal-document="today"]');
  for (const placement of ["left", "right"] as const) {
    const side = today.locator(`[data-side-block-placement="${placement}"]`).first();
    await addSideBlock(page, side);
    const cards = side.locator("[data-side-block-card]");
    await expect(cards).toHaveCount(2);
    const path = side.locator("[data-side-block-connector] path");
    await expect
      .poll(async () => {
        const points = await path.evaluate((element) =>
          [...(element.getAttribute("d") ?? "").matchAll(/M ([\d.-]+) ([\d.-]+)/g)].map(
            (match) => ({ x: Number(match[1]), y: Number(match[2]) }),
          ),
        );
        const sideBox = await side.boundingBox();
        const boxes = await Promise.all([cards.nth(0).boundingBox(), cards.nth(1).boundingBox()]);
        if (!sideBox || boxes.some((box) => !box) || points.length !== 2) {
          return false;
        }
        return boxes.every(
          (box, index) =>
            box &&
            Math.abs(
              points[index].x + sideBox.x - (placement === "left" ? box.x + box.width : box.x),
            ) < 2 &&
            Math.abs(points[index].y + sideBox.y - box.y - box.height / 2) < 2,
        );
      })
      .toBe(true);
    await deleteSideCard(page, side.locator("[data-side-block-card]").first());
    await expect
      .poll(async () => ((await path.getAttribute("d"))?.match(/M /g) ?? []).length)
      .toBe(1);
  }
});

test("connects side notes to the nearest edge of their anchor", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  const today = page.locator('[data-journal-document="today"]');
  const anchor = today.locator("[data-block-id]").first();
  const row = anchor.locator(":scope > .rivto-block-row");
  for (const placement of ["left", "right"] as const) {
    const side = today.locator(`[data-side-block-placement="${placement}"]`).first();
    const path = side.locator("[data-side-block-connector] path");
    await expect(path).toBeVisible();
    await expect
      .poll(async () => {
        const endpoint = await path.evaluate((element: SVGPathElement) => {
          const point = element.getPointAtLength(element.getTotalLength());
          const matrix = element.getScreenCTM()!;
          return {
            x: point.x * matrix.a + point.y * matrix.c + matrix.e,
            y: point.x * matrix.b + point.y * matrix.d + matrix.f,
          };
        });
        const box = await row.boundingBox();
        return box
          ? Math.hypot(
              endpoint.x - (placement === "left" ? box.x : box.x + box.width),
              endpoint.y - box.y - box.height / 2,
            )
          : Infinity;
      })
      .toBeLessThan(2);
  }
});

test("treats side-block IDs and renderer types as data rather than object prototypes", async ({
  page,
}) => {
  await page.goto("/?test_features=1&sideBlocks=1");
  const today = page.locator('[data-journal-document="today"]');
  await expect(today.locator("[data-block-content]").first()).toBeVisible();
  await page.evaluate(() => {
    const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }).__rivtoDemo
      .editor;
    const anchorId = editor.blocks.getRootIds()[0]!;
    for (const [id, type] of [
      ["__proto__", "note"],
      ["unknown", "toString"],
    ]) {
      editor.getDocument().pluginData.set(`rivto.side-blocks.${id}`, {
        id,
        anchorId,
        anchorType: "block",
        type,
        spacing: "reserve",
        placement: "right",
        createdAt: 1,
        data: {
          rootBlockId: editor.blocks.insertBlock(
            { type: "paragraph", children: [{ type: "paragraph", content: "Example" }] },
            { parentId: null, additional: true },
          ).id,
        },
      });
    }
  });
  await expect(today.locator('[data-side-block-id="__proto__"]')).toBeVisible();
  await expect(today.locator('[data-side-block-id="unknown"]')).toHaveCount(0);
});

test("places side blocks attached to different anchors without overlap", async ({ page }) => {
  await page.goto("/?test_features=1&sideBlocks=1");
  const today = page.locator('[data-journal-document="today"]');
  await expect(today.locator("[data-block-content]").first()).toBeVisible();
  await page.evaluate(() => {
    const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }).__rivtoDemo
      .editor;
    const anchors = editor.blocks.getRootIds().slice(0, 2);
    anchors.forEach((anchorId, index) => {
      const id = `distinct-${index}`;
      editor.getDocument().pluginData.set(`rivto.side-blocks.${id}`, {
        id,
        anchorId,
        anchorType: "block",
        type: "note",
        spacing: "reserve",
        placement: "right",
        createdAt: index,
        data: {
          rootBlockId: editor.blocks.insertBlock(
            { type: "paragraph", children: [{ type: "paragraph", content: id }] },
            { parentId: null, additional: true },
          ).id,
        },
      });
    });
  });
  const first = today.locator('[data-side-block-id="distinct-0"]');
  const second = today.locator('[data-side-block-id="distinct-1"]');
  await expect(first).toBeVisible();
  await expect(second).toBeVisible();
  await expect
    .poll(async () => {
      const before = await first.boundingBox();
      const after = await second.boundingBox();
      return before && after ? after.y - before.y - before.height : -Infinity;
    })
    .toBeGreaterThanOrEqual(0);
});

test("hides side content while a virtualized anchor is unmounted and restores it on return", async ({
  page,
}) => {
  await page.goto("/?test_features=1&sideBlocks=1");
  const today = page.locator('[data-journal-document="today"]');
  await expect(today.locator("[data-block-content]").first()).toBeVisible();
  const id = await page.evaluate(() => {
    const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }).__rivtoDemo
      .editor;
    const anchorId = editor.blocks.getRootIds()[0]!;
    editor.history.batchUpdates(() => {
      let previous = editor.blocks.getRootIds().at(-1)!;
      for (let index = 0; index < 120; index += 1) {
        previous = editor.blocks.insertBlock(
          { type: "paragraph", content: `Virtual row ${index}` },
          editor.blocks.getInsertionDestinationAfter(previous),
        ).id;
      }
      editor.getDocument().pluginData.set("rivto.side-blocks.virtual-check", {
        id: "virtual-check",
        anchorId,
        anchorType: "block",
        type: "note",
        spacing: "reserve",
        placement: "right",
        createdAt: 1,
        data: {
          rootBlockId: editor.blocks.insertBlock(
            { type: "paragraph", children: [{ type: "paragraph", content: "virtual side note" }] },
            { parentId: null, additional: true },
          ).id,
        },
      });
    });
    return anchorId;
  });
  await page.getByRole("checkbox", { name: "Virtualize page" }).check();
  const anchor = today.locator(`[data-block-id="${id}"]`);
  const side = today.locator('[data-side-block-id="virtual-check"]');
  await anchor.scrollIntoViewIfNeeded();
  await expect(side).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect(anchor).toHaveCount(0);
  await expect(side).toBeHidden();
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(anchor).toHaveCount(1);
  await expect(side).toBeVisible();
});

test("adds notes on either side from the block context menu", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/?sideBlocks=1");
  const today = page.locator('[data-journal-document="today"]');
  const anchor = today.locator("[data-block-id]").first();
  const anchorId = await anchor.getAttribute("data-block-id");
  for (const placement of ["left", "right"] as const) {
    const notes = today.locator(`[data-side-block-placement="${placement}"]`);
    const before = await notes.count();
    await anchor
      .locator(":scope > .rivto-block-row .block-handle")
      .dispatchEvent("contextmenu", { button: 2 });
    const leftAction = page.getByRole("menuitem", { name: "Add note to left" });
    const rightAction = page.getByRole("menuitem", { name: "Add note to right" });
    await expect(page.getByRole("menuitem", { name: "Copy block embedding" })).toBeVisible();
    await expect(
      leftAction
        .locator("xpath=preceding-sibling::*[2]")
        .getByRole("group", { name: "Block background" }),
    ).toBeVisible();
    await expect(leftAction.locator("xpath=preceding-sibling::*[1]")).toHaveAttribute(
      "role",
      "separator",
    );
    await expect(rightAction.locator("xpath=following-sibling::*[1]")).toHaveAttribute(
      "role",
      "separator",
    );
    await page.getByRole("menuitem", { name: `Add note to ${placement}` }).click();
    await expect(notes).toHaveCount(before + 1);
    await expect(
      notes.last().getByRole("textbox", { name: "Markdown block content" }),
    ).toBeVisible();
    const id = await notes.last().getAttribute("data-side-block-id");
    const savedAnchor = await page.evaluate(
      (noteId) =>
        window.__rivtoDemo.editor
          .getDocument()
          .pluginData.get<{ anchorId: string }>(`rivto.side-blocks.${noteId}`)?.anchorId,
      id,
    );
    expect(savedAnchor).toBe(anchorId);
  }
});
