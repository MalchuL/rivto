import { expect, test, type Frame, type Locator, type Page } from "@playwright/test";
import type { DocumentEditorAPI } from "@chulane/rivto";

interface DemoWindow extends Window {
  __rivtoDemo: { editor: DocumentEditorAPI };
}

/**
 * Finds a widget's currently mounted sandbox by its accessible name.
 *
 * @param page - Page containing the demo editor.
 * @param name - Name assigned to the sandbox.
 * @returns The current frame after it is attached.
 */
async function unsafeFrame(page: Page, name: string): Promise<Frame> {
  await expect.poll(() => page.frame({ name }) != null).toBe(true);
  const frame = page.frame({ name });
  if (!frame) {
    throw new Error(`Missing unsafe frame ${name}`);
  }
  await expect
    .poll(() =>
      frame.evaluate(() => Boolean((window as { rivto?: { node?: unknown } }).rivto?.node)),
    )
    .toBe(true);
  return frame;
}

/**
 * Reads a demo root block by its original text prefix.
 *
 * @param page - Page containing the demo editor.
 * @param prefix - Unique beginning of the target's content.
 * @returns Its current text or undefined when it is missing.
 */
async function targetContent(page: Page, prefix: string): Promise<string | undefined> {
  return page.evaluate((text) => {
    const editor = (window as unknown as DemoWindow).__rivtoDemo.editor;
    return editor.blocks.getBlocks().find((block) => block.content.startsWith(text))?.content;
  }, prefix);
}

/**
 * Changes the permission through the block's edit UI.
 *
 * @param host - Unsafe block occurrence.
 * @param enabled - Permission to apply on save.
 * @returns The editor has closed with the selected permission.
 */
async function setAccess(host: Locator, enabled: boolean): Promise<void> {
  await host.getByRole("button", { name: "Edit Unsafe HTML" }).click();
  const checkbox = host.getByRole("checkbox", {
    name: "Allow this HTML to read and modify editor blocks",
  });
  if (enabled) {
    await checkbox.check();
  } else {
    await checkbox.uncheck();
  }
  await host.getByRole("button", { name: "Done" }).click();
}

/**
 * Attempts a forged write while permission is disabled.
 *
 * @param frame - Untrusted widget frame.
 * @param targetId - ID of the block to try to modify.
 * @returns The host's rejection message.
 */
async function forgeDisabledRequest(frame: Frame, targetId: string): Promise<string> {
  return frame.evaluate(
    (id) =>
      new Promise<string>((resolve) => {
        const script = document.querySelector("head script")?.textContent ?? "";
        const match = /var token = ("[^"\n]+")/.exec(script);
        if (!match) {
          throw new Error("Missing frame token");
        }
        const token = JSON.parse(match[1]!) as string;
        window.addEventListener("message", (event) => {
          if (event.data?.kind === "unsafe-result" && event.data.id === 987) {
            resolve(event.data.error);
          }
        });
        parent.postMessage(
          {
            channel: "rivto-html",
            token,
            kind: "unsafe-request",
            id: 987,
            target: "reactEditor",
            method: "setContent",
            args: [id, "Forged"],
          },
          "*",
        );
      }),
    targetId,
  );
}

/** Methods used by the test source to queue a change followed by a forged write. */
interface UnsafeTestBridge {
  /**
   * Waits for the widget's first snapshot.
   *
   * @returns The current widget content after it arrives.
   */
  ready(): Promise<{ content: string }>;
  /**
   * Changes the widget's own source.
   *
   * @param content - Replacement source.
   * @returns The source update has been posted.
   */
  setContent(content: string): void;
  /** Panel-scoped bridge operations. */
  panel: {
    blocks: {
      /**
       * Requests a content change in the current panel.
       *
       * @param id - Target block ID.
       * @param content - Replacement content.
       * @returns Resolves with the result or rejects if permission was revoked.
       */
      setContent(id: string, content: string): Promise<unknown>;
    };
  };
}

/**
 * Changes source from inside the iframe and attempts an immediately following write.
 *
 * @param frame - Authorized widget frame.
 * @param targetId - ID of the block the script tries to overwrite.
 * @returns Both messages have been sent to the host.
 */
async function sendSourceChangeAndWrite(frame: Frame, targetId: string): Promise<void> {
  await frame.evaluate(async (id) => {
    const bridge = (window as unknown as { rivto: UnsafeTestBridge }).rivto;
    const node = await bridge.ready();
    bridge.setContent(`${node.content}<!-- changed -->`);
    void bridge.panel.blocks.setContent(id, "Forged after source change").catch(() => {});
  }, targetId);
}

/**
 * Confirms that a source change revokes an existing grant before a queued write.
 *
 * @param page - Demo page.
 * @param host - Unsafe block occurrence.
 * @param label - Frame and widget label.
 * @param target - Unchanged text of the preceding block.
 * @param targetId - ID of that preceding block.
 * @returns The revoked grant and unchanged target have been observed.
 */
async function verifySourceRevocation(
  page: Page,
  host: Locator,
  label: string,
  target: string,
  targetId: string,
): Promise<void> {
  await setAccess(host, true);
  await expect(host.getByRole("alert")).toContainText("access is enabled");
  let frame = await unsafeFrame(page, label);
  await sendSourceChangeAndWrite(frame, targetId);
  await expect
    .poll(() =>
      page.evaluate((widgetLabel) => {
        const editor = (window as unknown as DemoWindow).__rivtoDemo.editor;
        return editor.blocks
          .getBlocks()
          .find((item) => item.props.label === widgetLabel)
          ?.content.endsWith("<!-- changed -->");
      }, label),
    )
    .toBe(true);
  await expect(host.getByRole("alert")).toContainText("requested editor access");
  expect(await targetContent(page, target)).toBe(target);
  frame = await unsafeFrame(page, label);
  await frame.getByRole("button", { name: "Append Unsafe!!!" }).click();
  await expect(host.getByRole("alert")).toContainText("requested editor access");
  expect(await targetContent(page, target)).toBe(target);
}

for (const [label, target] of [
  ["Unsafe panel example", "Panel example target"],
  ["Unsafe editor example", "Editor example target"],
]) {
  test(`${label} requires opt-in and supports undo`, async ({ page }) => {
    await page.goto("/");
    const host = page.locator(`[data-html-surface="unsafe-block"][data-html-label="${label}"]`);
    await host.scrollIntoViewIfNeeded();
    let frame = await unsafeFrame(page, label);
    const targetId = await page.evaluate((text) => {
      const editor = (window as unknown as DemoWindow).__rivtoDemo.editor;
      return editor.blocks.getBlocks().find((block) => block.content === text)?.id;
    }, target);
    if (!targetId) {
      throw new Error("Missing target block");
    }
    expect(await forgeDisabledRequest(frame, targetId)).toBe("Editor access is disabled");
    expect(await targetContent(page, target)).toBe(target);
    await frame.getByRole("button", { name: "Append Unsafe!!!" }).click();
    await expect(host.getByRole("alert")).toContainText("requested editor access");
    expect(
      await frame.evaluate(() => (window as unknown as { rivto: { panel: unknown } }).rivto.panel),
    ).toBeNull();
    await setAccess(host, true);
    await expect(host.getByRole("alert")).toContainText("access is enabled");
    frame = await unsafeFrame(page, label);
    await frame.getByRole("button", { name: "Append Unsafe!!!" }).click();
    await expect.poll(() => targetContent(page, target)).toBe(`${target} Unsafe!!!`);
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect.poll(() => targetContent(page, target)).toBe(target);
    await setAccess(host, false);
    frame = await unsafeFrame(page, label);
    await frame.getByRole("button", { name: "Append Unsafe!!!" }).click();
    await expect(host.getByRole("alert")).toContainText("requested editor access");
    expect(await targetContent(page, target)).toBe(target);
    await verifySourceRevocation(page, host, label, target, targetId);
  });
}

/**
 * Pans the canvas until the seeded HTML card is mounted.
 *
 * @param viewport - Edgeless viewport receiving the wheel input.
 * @returns The card's initial pan has been applied.
 */
async function panToHtmlCard(viewport: Locator): Promise<void> {
  const expectedPan = await viewport.evaluate((root) => {
    const editor = (window as unknown as DemoWindow).__rivtoDemo.editor;
    const card = editor.elements.getElementNodes().find((item) => {
      const id = item.props.startBlockId;
      return (
        item.type === "block" &&
        typeof id === "string" &&
        editor.blocks.getBlockNode(id)?.content === "## HTML widgets"
      );
    });
    if (!card) {
      throw new Error("Missing HTML card");
    }
    const zoom = Number(root.getAttribute("data-edgeless-zoom")) || 1;
    const x = Number(root.getAttribute("data-edgeless-pan-x")) || 0;
    const y = Number(root.getAttribute("data-edgeless-pan-y")) || 0;
    const destination = { x: 100 - card.frame.x * zoom, y: 100 - card.frame.y * zoom };
    root.dispatchEvent(
      new WheelEvent("wheel", {
        deltaX: x - destination.x,
        deltaY: y - destination.y,
        bubbles: true,
        cancelable: true,
      }),
    );
    return destination;
  });
  await expect
    .poll(async () => Number(await viewport.getAttribute("data-edgeless-pan-y")))
    .toBeCloseTo(expectedPan.y);
}

/**
 * Pans a mounted widget into view, accounting for asynchronous card height changes.
 *
 * @param viewport - Canvas viewport receiving wheel input.
 * @param host - Mounted unsafe block occurrence.
 * @returns The widget is within the viewport.
 */
async function panToWidget(viewport: Locator, host: Locator): Promise<void> {
  await expect(host).toBeAttached();
  await expect
    .poll(
      async () => {
        const box = await host.boundingBox();
        const canvas = await viewport.boundingBox();
        if (!box || !canvas) {
          return false;
        }
        if (box.x > canvas.x && box.y > canvas.y && box.y < canvas.y + canvas.height - 150) {
          return true;
        }
        await viewport.evaluate(
          (root, delta) =>
            root.dispatchEvent(
              new WheelEvent("wheel", {
                deltaX: delta.x,
                deltaY: delta.y,
                bubbles: true,
                cancelable: true,
              }),
            ),
          { x: box.x - canvas.x - 140, y: box.y - canvas.y - 100 },
        );
        return false;
      },
      { timeout: 15000 },
    )
    .toBe(true);
}

test("unsafe block works inside an edgeless card", async ({ page }) => {
  await page.goto("/");
  await page.locator('[data-editor-mode="edgeless"]').click();
  const host = page.locator(
    '[data-html-surface="unsafe-block"][data-html-label="Unsafe panel example"]',
  );
  const viewport = page.locator(".edgeless-viewport");
  await panToHtmlCard(viewport);
  await panToWidget(viewport, host);
  await setAccess(host, true);
  const frame = await unsafeFrame(page, "Unsafe panel example");
  await frame.getByRole("button", { name: "Append Unsafe!!!" }).click();
  await expect
    .poll(() => targetContent(page, "Panel example target"))
    .toBe("Panel example target Unsafe!!!");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(() => targetContent(page, "Panel example target")).toBe("Panel example target");
});

test("an access attempt during initial script execution shows a warning", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    const editor = (window as unknown as DemoWindow).__rivtoDemo.editor;
    editor.blocks.insertBlock({
      type: "unsafe-html",
      content: "<p>Startup access</p><script>window.attempt = rivto.reactEditor;</script>",
      props: { label: "Startup access" },
    });
  });
  const host = page.locator('[data-html-surface="unsafe-block"][data-html-label="Startup access"]');
  await host.scrollIntoViewIfNeeded();
  await expect(host.getByRole("alert")).toContainText("requested editor access");
  const frame = await unsafeFrame(page, "Startup access");
  expect(
    await frame.evaluate(() => (window as unknown as { attempt: unknown }).attempt),
  ).toBeNull();
});
