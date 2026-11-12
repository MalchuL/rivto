import { expect, test, type Frame, type Page } from "@playwright/test";
import type { DocumentEditorAPI } from "@chulane/rivto";

interface DemoWindow extends Window {
  __rivtoDemo: { editor: DocumentEditorAPI };
  resizeDocumentUpdates: number;
  resizeTiming: { sync: number; frames: number } | null;
  stopResizeObservation: () => void;
}

/**
 * Waits until a named sandbox has published its node snapshot.
 *
 * @param page - Demo page that owns the iframe.
 * @param name - Iframe name, matching the widget sample id.
 * @returns The sandbox frame after `rivto.node` is available.
 */
async function widgetFrame(page: Page, name: string): Promise<Frame> {
  await expect.poll(() => page.frame({ name }) != null).toBe(true);
  const frame = page.frame({ name });
  if (!frame) {
    throw new Error(`Missing HTML frame ${name}`);
  }
  await expect
    .poll(() =>
      frame.evaluate(() => Boolean((window as { rivto?: { node?: unknown } }).rivto?.node)),
    )
    .toBe(true);
  return frame;
}

/**
 * Reads one block property from the live document.
 *
 * @param page - Demo page.
 * @param sample - Seeded sample id stored on the block.
 * @param key - Property name to read.
 * @returns The current property value.
 */
async function blockProp(page: Page, sample: string, key: string): Promise<unknown> {
  return page.evaluate(
    ({ sample, key }) => {
      const editor = (window as unknown as DemoWindow).__rivtoDemo.editor;
      const block = editor.blocks.getBlocks().find((item) => item.props.sample === sample);
      return block?.props[key];
    },
    { sample, key },
  );
}

test("html blocks expose the node and render pasted markup", async ({ page }) => {
  await page.goto("/");
  const pomodoroHost = page.locator('[data-html-label="Pomodoro"]');
  await pomodoroHost.scrollIntoViewIfNeeded();
  const pomodoro = await widgetFrame(page, "Pomodoro");
  await expect(pomodoro.getByText("25:00")).toBeVisible();
  const node = await pomodoro.evaluate(
    () => (window as { rivto: { node: Record<string, unknown> } }).rivto.node,
  );
  expect(node.kind).toBe("block");
  expect(node).toMatchObject({
    props: { start: false, timer: 25, label: "Pomodoro" },
    listProps: {},
  });
  expect(Array.isArray(node.childIds)).toBe(true);
  expect(typeof node.content).toBe("string");
  expect(node.pluginData).toEqual({});

  const started = Date.now();
  await pomodoro.getByRole("button", { name: "Start" }).click();
  await expect(pomodoro.getByRole("button", { name: "Pause" })).toBeVisible();
  const elapsed = Date.now() - started;
  console.log(JSON.stringify({ interaction: "pomodoro-start", repeat: 0, elapsed }));
  expect(elapsed).toBeLessThan(1500);
  expect(await blockProp(page, "pomodoro", "start")).toBe(true);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(pomodoro.getByRole("button", { name: "Start" })).toBeVisible();
  expect(await blockProp(page, "pomodoro", "start")).toBe(false);

  const pomodoroBlock = page.locator('[data-block-type="html"]').filter({ has: pomodoroHost });
  await pomodoroBlock.hover();
  await pomodoroBlock.getByRole("button", { name: "Edit HTML", exact: true }).click();
  await expect(pomodoroBlock.getByRole("button", { name: "Edit HTML" })).toHaveCount(0);
  await pomodoroBlock.getByRole("button", { name: "Expand HTML editor", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "HTML source" })).toBeVisible();
  const props = page.getByRole("textbox", { name: "Widget props" });
  await props.click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.insertText(
    JSON.stringify({ sample: "pomodoro", label: "Pomodoro", start: false, timer: 5 }, null, 2),
  );
  await page.getByRole("button", { name: "Done", exact: true }).click();
  const edited = await widgetFrame(page, "Pomodoro");
  await expect(edited.getByText("05:00")).toBeVisible();
  await expect(pomodoroHost.getByRole("textbox", { name: "List props" })).toHaveCount(0);
  expect(await blockProp(page, "pomodoro", "timer")).toBe(5);

  const goal = await widgetFrame(page, "Reading goal");
  await expect(goal.getByText("36 / 80")).toBeVisible();
  await goal.getByRole("button", { name: "Increase pages" }).click();
  await expect.poll(() => blockProp(page, "goal", "value")).toBe(37);

  const quote = await widgetFrame(page, "Field note");
  await expect(quote.getByText("Watching for a while is enough.")).toBeVisible();

  const mood = await widgetFrame(page, "Mood");
  const moodNode = await mood.evaluate(
    () =>
      (
        window as {
          rivto: {
            node: { listProps: { tone?: string }; childIds: unknown[]; props: { mood?: string } };
          };
        }
      ).rivto.node,
  );
  expect(moodNode.listProps.tone).toBe("soft");
  expect(moodNode.props.mood).toBe("calm");
  expect(moodNode.childIds).toEqual([]);
  await mood.getByRole("button", { name: "Bright" }).click();
  await expect.poll(() => blockProp(page, "mood", "mood")).toBe("bright");

  await page.evaluate(() => {
    (window as unknown as DemoWindow).__rivtoDemo.editor.blocks.insertBlock({
      type: "html",
      content: "",
      props: { label: "Scratch", sample: "scratch" },
    });
  });
  const scratch = page.locator('[data-html-label="Scratch"]');
  await scratch.scrollIntoViewIfNeeded();
  const source = scratch.getByRole("textbox", { name: "HTML source" });
  const delivered = await source.evaluate((element, html) => {
    const data = new DataTransfer();
    data.setData("text/plain", html);
    const event = new ClipboardEvent("paste", {
      bubbles: true,
      cancelable: true,
      clipboardData: data,
    });
    if (!event.clipboardData?.getData("text/plain")) {
      return false;
    }
    element.dispatchEvent(event);
    return true;
  }, "<p>Pasted widget</p>");
  if (!delivered) {
    await source.fill("<p>Pasted widget</p>");
    await scratch.getByRole("button", { name: "Render", exact: true }).click();
  }
  await expect(scratch.getByRole("textbox", { name: "HTML source" })).toHaveCount(0);
  const pasted = await widgetFrame(page, "Scratch");
  await expect(pasted.getByText("Pasted widget")).toBeVisible();
});

test("pomodoro still answers in a repeated notebook", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/?repeat=200");
  await page.locator('[data-html-label="Pomodoro"]').scrollIntoViewIfNeeded();
  const pomodoro = await widgetFrame(page, "Pomodoro");
  const started = Date.now();
  await pomodoro.getByRole("button", { name: "Start" }).click();
  await expect(pomodoro.getByRole("button", { name: "Pause" })).toBeVisible();
  const elapsed = Date.now() - started;
  console.log(JSON.stringify({ interaction: "pomodoro-start", repeat: 200, elapsed }));
  expect(elapsed).toBeLessThan(1500);
  expect(await blockProp(page, "pomodoro", "start")).toBe(true);
});

for (const repeat of [0, 200]) {
  test(`rotating circle scales during resize, repeat=${repeat}`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto(`/?repeat=${repeat}`);
    await page.locator('[data-editor-mode="edgeless"]').click();
    const circle = page
      .locator('[data-edgeless-visual-kind="html"]')
      .filter({ has: page.locator('[data-html-label="Focus"]') });
    const viewport = page.locator(".edgeless-viewport");
    await viewport.evaluate((root) => {
      const editor = (window as unknown as DemoWindow).__rivtoDemo.editor;
      const element = editor.elements
        .getElementNodes()
        .find((item) => item.type === "html" && item.props.sample === "circle");
      if (!element) {
        throw new Error("Missing rotating circle");
      }
      const zoom = Number(root.getAttribute("data-edgeless-zoom")) || 1;
      const cameraX = Number(root.getAttribute("data-edgeless-pan-x")) || 0;
      const cameraY = Number(root.getAttribute("data-edgeless-pan-y")) || 0;
      const desiredX = 120 - element.frame.x * zoom;
      const desiredY = 80 - element.frame.y * zoom;
      root.dispatchEvent(
        new WheelEvent("wheel", {
          deltaX: cameraX - desiredX,
          deltaY: cameraY - desiredY,
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    const viewportBox = (await viewport.boundingBox())!;
    await expect
      .poll(async () => {
        const box = await circle.boundingBox();
        return Boolean(
          box &&
          box.x >= viewportBox.x + 40 &&
          box.x + 40 <= viewportBox.x + viewportBox.width &&
          box.y >= viewportBox.y &&
          box.y <= viewportBox.y + viewportBox.height,
        );
      })
      .toBe(true);
    const frame = await widgetFrame(page, "Focus");
    expect(
      await frame.evaluate(
        () =>
          (
            window as {
              rivto: {
                node: {
                  kind: string;
                  props: { speed: number };
                  frame: { width: number };
                  childIds: unknown[];
                };
              };
            }
          ).rivto.node,
      ),
    ).toMatchObject({
      kind: "element",
      props: { speed: 6, color: "#6d5efc" },
      frame: { width: 250 },
      childIds: [],
    });
    const ring = frame.locator("[data-ring]");
    const ringWidth = () => ring.evaluate((element) => (element as HTMLElement).offsetWidth);
    const id = (await circle.getAttribute("data-edgeless-object-id"))!;
    const stored = () =>
      page.evaluate((elementId) => {
        const editor = (window as unknown as DemoWindow).__rivtoDemo.editor;
        return editor.elements.getElementNode(elementId);
      }, id);
    const original = await stored();
    const originalHost = (await circle.boundingBox())!;
    const originalRing = await ringWidth();
    await page.evaluate((elementId) => {
      (window as unknown as DemoWindow).__rivtoDemo.editor.commands.execute(
        "edgeless.selection.set",
        [elementId],
      );
    }, id);
    const handle = page.locator('[data-edgeless-controls-for] [data-edgeless-resize-handle="se"]');
    const start = (await handle.boundingBox())!;
    const x = start.x + start.width / 2;
    const y = start.y + start.height / 2;
    await page.keyboard.down("Alt");
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.evaluate(() => {
      const state = window as unknown as DemoWindow;
      state.resizeDocumentUpdates = 0;
      state.stopResizeObservation = state.__rivtoDemo.editor.subscribe(() => {
        state.resizeDocumentUpdates += 1;
      });
    });
    await page.mouse.move(x + 80, y + 70);
    await expect
      .poll(async () => (await circle.boundingBox())?.width ?? 0)
      .toBeGreaterThan(originalHost.width + 40);
    expect(await stored()).toEqual(original);
    expect(await page.evaluate(() => (window as unknown as DemoWindow).resizeDocumentUpdates)).toBe(
      0,
    );
    const previewHost = (await circle.boundingBox())!;
    const previewRing = await ringWidth();
    expect(previewRing / originalRing).toBeCloseTo(previewHost.width / originalHost.width, 1);
    await page.mouse.up();
    await page.keyboard.up("Alt");
    const updates = await page.evaluate(() => {
      const state = window as unknown as DemoWindow;
      state.stopResizeObservation();
      return state.resizeDocumentUpdates;
    });
    expect(updates).toBeGreaterThan(0);
    expect((await stored())!.frame.width).toBeGreaterThan(original!.frame.width);
    expect(await ringWidth()).toBeCloseTo(previewRing, 0);
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect
      .poll(async () => (await stored())?.frame.width)
      .toBeCloseTo(original!.frame.width, 0);
  });
}

test("animated weekly board persists clicks and undo", async ({ page }) => {
  await page.goto("/");
  const host = page.locator('[data-html-label="Weekly progress"]');
  await host.scrollIntoViewIfNeeded();
  const frame = await widgetFrame(page, "Weekly progress");
  await expect(frame.getByText("12 sessions")).toBeVisible();
  await frame.getByRole("button", { name: "Add session" }).click();
  await expect(frame.getByText("13 sessions")).toBeVisible();
  await expect
    .poll(() => blockProp(page, "weekly-progress", "sessions"))
    .toEqual([2, 3, 1, 4, 3, 0, 0]);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(frame.getByText("12 sessions")).toBeVisible();
});

test("animated orbit persists its paused state", async ({ page }) => {
  await page.goto("/");
  await page.locator('[data-editor-mode="edgeless"]').click();
  const viewport = page.locator(".edgeless-viewport");
  await viewport.evaluate((root) => {
    const editor = (window as unknown as DemoWindow).__rivtoDemo.editor;
    const element = editor.elements.getElementNodes().find((item) => item.props.sample === "orbit");
    if (!element) {
      throw new Error("Missing orbit");
    }
    const zoom = Number(root.getAttribute("data-edgeless-zoom")) || 1;
    const cameraX = Number(root.getAttribute("data-edgeless-pan-x")) || 0;
    const cameraY = Number(root.getAttribute("data-edgeless-pan-y")) || 0;
    root.dispatchEvent(
      new WheelEvent("wheel", {
        deltaX: cameraX - (120 - element.frame.x * zoom),
        deltaY: cameraY - (80 - element.frame.y * zoom),
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  const frame = await widgetFrame(page, "Orbit");
  await frame.getByRole("button", { name: "Pause orbit" }).click();
  await expect(frame.getByRole("button", { name: "Resume orbit" })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const editor = (window as unknown as DemoWindow).__rivtoDemo.editor;
        return editor.elements.getElementNodes().find((item) => item.props.sample === "orbit")
          ?.props.running;
      }),
    )
    .toBe(false);
});
