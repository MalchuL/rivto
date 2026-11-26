import { expect, test, type Page, type Locator } from "@playwright/test";
import type { DocumentEditorAPI } from "@chulane/rivto";

interface DemoWindow extends Window {
  __rivtoDemo: { editor: DocumentEditorAPI };
}

/**
 * Inserts a widget at the start of the current demo and brings its editor controls into view.
 *
 * @param page - Page displaying the notebook.
 * @param content - Authored markup for the block.
 * @returns The mounted host and stable block ID.
 */
async function insertWidget(page: Page, content: string) {
  const id = await page.evaluate((source) => {
    const editor = (window as unknown as DemoWindow).__rivtoDemo.editor;
    return editor.blocks.insertBlock(
      { type: "html", content: source, props: { label: "Session widget" } },
      { parentId: null, beforeId: editor.blocks.getRootIds()[0] },
    ).id;
  }, content);
  const host = page.locator(`[data-block-id="${id}"]`);
  await host.scrollIntoViewIfNeeded();
  return { host, id };
}

test("saving a props-only draft preserves remote source and added keys", async ({ page }) => {
  await page.goto("/");
  const { host, id } = await insertWidget(page, "<p>Original</p>");
  await host.hover();
  await host.getByRole("button", { name: "Edit HTML" }).click();
  await host.getByRole("textbox", { name: "Widget props" }).fill('{"label":"Local edit"}');
  await page.evaluate((blockId) => {
    (window as unknown as DemoWindow).__rivtoDemo.editor.blocks.updateBlock(blockId, {
      content: "<p>Remote</p>",
      props: { remote: true },
    });
  }, id);
  await host.getByRole("button", { name: "Done" }).click();
  const block = await page.evaluate(
    (blockId) => (window as unknown as DemoWindow).__rivtoDemo.editor.blocks.getBlockNode(blockId),
    id,
  );
  expect(block).toMatchObject({
    content: "<p>Remote</p>",
    props: { label: "Local edit", remote: true },
  });
});

test("fullscreen toggles retain the source selection and undo history", async ({ page }) => {
  await page.goto("/");
  const { host } = await insertWidget(page, "original");
  await host.hover();
  await host.getByRole("button", { name: "Edit HTML" }).click();
  const inline = host.getByRole("textbox", { name: "HTML source" });
  await inline.press("End");
  await page.keyboard.insertText(" edited");
  await inline.press("Shift+ArrowLeft");
  await host.getByRole("button", { name: "Expand HTML editor" }).click();
  const dialog = page.getByRole("dialog");
  const expanded = dialog.getByRole("textbox", { name: "HTML source" });
  await expanded.focus();
  await expect.poll(() => page.evaluate(() => window.getSelection()?.toString())).toBe("d");
  await expanded.press("ControlOrMeta+z");
  await expect(expanded).toHaveText("original");
  await dialog.getByRole("button", { name: "Collapse HTML editor" }).click();
  await inline.press("ControlOrMeta+Shift+z");
  await expect(inline).toHaveText("original edited");
});

test("a native disclosure and its relocated button retain pointer input", async ({ page }) => {
  await page.goto("/");
  const { host } = await insertWidget(
    page,
    '<main style="height:200px"><details><summary style="height:36px;width:200px">Title</summary><p>Details</p></details><button onclick="this.textContent=\'Clicked\'">Action</button></main>',
  );
  const frame = host.locator("iframe").contentFrame();
  await expect(host.locator("[data-html-drag-handle]").first()).toBeVisible();
  await frame.locator("summary").click({ position: { x: 180, y: 15 } });
  await expect(frame.locator("details")).toHaveAttribute("open", "");
  await frame.getByRole("button", { name: "Action" }).click();
  await expect(frame.getByRole("button", { name: "Clicked" })).toBeVisible();
});

test("temporary pointer listeners release their background drag regions", async ({ page }) => {
  await page.goto("/");
  const { host } = await insertWidget(
    page,
    '<div id="background" style="width:180px;height:80px"></div>',
  );
  const box = host.locator("iframe").contentFrame().locator("#background");
  const handles = host.locator("[data-html-drag-handle]");
  const bounds = await box.boundingBox();
  if (!bounds) {
    throw new Error("Missing widget background");
  }
  const hit = () =>
    page.evaluate(
      ({ x, y }) =>
        document.elementFromPoint(x + 35, y + 25)?.hasAttribute("data-html-drag-handle"),
      bounds,
    );
  await expect(handles.first()).toBeVisible();
  for (const mode of ["remove", "once", "abort"]) {
    await box.evaluate((node, kind) => {
      const signal = new AbortController();
      const listener = () => {};
      node.addEventListener("click", listener, {
        capture: true,
        once: kind === "once",
        signal: signal.signal,
      });
      node.addEventListener(
        "release",
        () => {
          if (kind === "abort") {
            signal.abort();
          } else if (kind === "remove") {
            node.removeEventListener("click", listener, true);
          } else {
            node.dispatchEvent(new Event("click"));
          }
        },
        { once: true },
      );
    }, mode);
    await expect.poll(hit).toBe(false);
    await box.evaluate((node) => node.dispatchEvent(new Event("release")));
    await expect.poll(hit).toBe(true);
  }
});

for (const head of ["", "<head></head>"]) {
  test(`ready resolves before a slow image loads with ${head || "an omitted head"}`, async ({
    page,
  }) => {
    await page.goto("/");
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/pending-widget-image", async (route) => {
      await pending;
      await route.abort();
    });
    try {
      const { host } = await insertWidget(
        page,
        `<html>${head}<body><script>rivto.ready().then(node => document.querySelector("header").textContent = node.props.label)</script><header>Waiting</header><img src="/pending-widget-image"></body></html>`,
      );
      await expect(host.locator("iframe").contentFrame().locator("header")).toHaveText(
        "Session widget",
      );
    } finally {
      release();
    }
  });
}

test("a navigated widget drops its drag targets and the authored document can reload", async ({
  page,
}) => {
  await page.goto("/");
  await page.route("**/widget-destination", (route) =>
    route.fulfill({ contentType: "text/html", body: "<p>Destination</p>" }),
  );
  const { host } = await insertWidget(
    page,
    '<div style="height:80px"><a href="/widget-destination">Continue</a><output></output></div><script>rivto.ready().then(node => document.querySelector("output").textContent = node.props.label)</script>',
  );
  const frame = host.locator("iframe").contentFrame();
  await expect(frame.locator("output")).toHaveText("Session widget");
  await frame.locator("output").evaluate(() => location.reload());
  await expect(frame.locator("output")).toHaveText("Session widget");
  const handles = host.locator("[data-html-drag-handle]");
  await expect(handles.first()).toBeVisible();
  await frame.getByRole("link", { name: "Continue" }).click();
  await expect(frame.locator("p")).toHaveText("Destination");
  await expect(handles).toHaveCount(0);
});

/**
 * Checks the draft in both fullscreen layouts, hides its frame and discards the edit.
 *
 * @param page - Demo page containing the source dialog.
 * @param host - Block with an open inline preview and updated properties.
 * @returns Once the fullscreen session has closed.
 */
async function checkFullscreenPreview(page: Page, host: Locator) {
  await host.getByRole("button", { name: "Expand HTML editor" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator("iframe").contentFrame().locator("output")).toHaveText("Updated");
  const fields = dialog.locator(".html-code-fields");
  const pane = dialog.getByRole("region", { name: "HTML preview" });
  expect((await pane.boundingBox())!.x).toBeGreaterThan((await fields.boundingBox())!.x);
  await page.setViewportSize({ width: 680, height: 800 });
  await expect
    .poll(
      async () =>
        (await pane.boundingBox())!.y >=
        (await fields.boundingBox())!.y + (await fields.boundingBox())!.height,
    )
    .toBe(true);
  const toggle = dialog.getByRole("button", { name: "Preview", exact: true });
  const done = dialog.getByRole("button", { name: "Done", exact: true });
  const primary = await done.evaluate((button) => getComputedStyle(button).backgroundColor);
  await page.mouse.move(0, 0);
  await expect(toggle).toHaveCSS("background-color", primary);
  await toggle.click();
  await page.mouse.move(0, 0);
  await expect(toggle).not.toHaveCSS("background-color", primary);
  await expect(dialog.locator("iframe")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
}

for (const repeat of [0, 200]) {
  test(`draft preview coalesces typing and isolates widget commands, repeat=${repeat}`, async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.goto(`/?repeat=${repeat}`);
    const { host, id } = await insertWidget(page, "<p>Original</p>");
    await host.hover();
    await host.getByRole("button", { name: "Edit HTML" }).click();
    const source = host.getByRole("textbox", { name: "HTML source" });
    await source.focus();
    const toggle = host.getByRole("button", { name: "Preview", exact: true });
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    const frame = host.locator("iframe").contentFrame();
    await expect(frame.locator("p")).toHaveText("Original");
    await expect(source).toBeFocused();
    let navigations = 0;
    page.on("framenavigated", (item) => {
      if (item.name() === "HTML draft preview") {
        navigations += 1;
      }
    });
    const time = new Date();
    await page.clock.install({ time });
    await page.clock.pauseAt(new Date(time.getTime() + 60_000));
    await source.fill(
      "<button onclick=\"this.textContent='Clicked';rivto.setProp('write',true)\">Try</button><output></output><script>rivto.subscribe(n => document.querySelector(\"output\").textContent=n.props.label)</script>",
    );
    await page.clock.runFor(200);
    await source.press("ControlOrMeta+End");
    await page.keyboard.type("draft");
    await page.clock.runFor(399);
    await expect(frame.locator("p")).toHaveText("Original");
    await page.clock.resume();
    await expect(frame.locator("body")).toContainText("draft");
    await expect(source).toBeFocused();
    await frame.getByRole("button", { name: "Try" }).click();
    const props = host.getByRole("textbox", { name: "Widget props" });
    await props.press("ControlOrMeta+a");
    await page.keyboard.insertText("invalid");
    await expect(props).toHaveText("invalid");
    await expect(host.getByRole("alert")).toContainText("Preview paused");
    await expect(frame.locator("output")).toHaveText("Session widget");
    await props.press("ControlOrMeta+a");
    await page.keyboard.insertText('{"label":"Updated"}');
    await expect(frame.locator("output")).toHaveText("Updated");
    await expect(frame.locator("button")).toHaveText("Clicked");
    expect(navigations).toBe(1);
    await checkFullscreenPreview(page, host);
    const saved = await page.evaluate(
      (blockId) =>
        (window as unknown as DemoWindow).__rivtoDemo.editor.blocks.getBlockNode(blockId),
      id,
    );
    expect(saved?.content).toBe("<p>Original</p>");
    expect(saved?.props).toEqual({ label: "Session widget" });
  });
}
