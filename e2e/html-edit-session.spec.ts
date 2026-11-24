import { expect, test, type Page } from "@playwright/test";
import type { DocumentEditorAPI } from "@chulane/rivto";

interface DemoWindow extends Window {
  __rivtoDemo: { editor: DocumentEditorAPI };
}

/**
 * Inserts a widget in the current demo and brings its editor controls into view.
 *
 * @param page - Page displaying the notebook.
 * @param content - Authored markup for the block.
 * @returns The mounted host and stable block ID.
 */
async function insertWidget(page: Page, content: string) {
  const id = await page.evaluate((source) => {
    const editor = (window as unknown as DemoWindow).__rivtoDemo.editor;
    return editor.blocks.insertBlock({
      type: "html",
      content: source,
      props: { label: "Session widget" },
    }).id;
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
  await expect(host.locator("[data-rivto-embedded-drag-handle]").first()).toBeVisible();
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
  const handles = host.locator("[data-rivto-embedded-drag-handle]");
  const bounds = await box.boundingBox();
  if (!bounds) {
    throw new Error("Missing widget background");
  }
  const hit = () =>
    page.evaluate(
      ({ x, y }) =>
        document.elementFromPoint(x + 35, y + 25)?.hasAttribute("data-rivto-embedded-drag-handle"),
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
  const handles = host.locator("[data-rivto-embedded-drag-handle]");
  await expect(handles.first()).toBeVisible();
  await frame.getByRole("link", { name: "Continue" }).click();
  await expect(frame.locator("p")).toHaveText("Destination");
  await expect(handles).toHaveCount(0);
});
