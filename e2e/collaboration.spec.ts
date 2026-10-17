import { expect, test } from "@playwright/test";

for (const mode of ["Page", "Edgeless"] as const) {
  test(`shows transient pointers and text selections in ${mode}`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`/?sync=1&room=presence-${crypto.randomUUID()}`);
    const left = page.locator('[data-editor-sync="left"]');
    const right = page.locator('[data-editor-sync="right"]');
    const content = '[data-block-type="paragraph"] [data-block-content]';
    await expect(right.locator(content)).toHaveCount(2);
    if (mode === "Edgeless") {
      await left.getByRole("button", { name: mode, exact: true }).click();
      await right.getByRole("button", { name: mode, exact: true }).click();
    }
    await left.locator(content).first().click();
    await page.keyboard.press("Home");
    await page.keyboard.press("ArrowRight");
    await expect(page.locator('[data-collaboration-kind="caret"]')).toHaveCount(1);
    await expect(page.locator('[data-collaboration-kind="caret"]')).toContainText("Vlad");
    await expect(page.locator('[data-collaboration-kind="caret"]')).toHaveCSS(
      "color",
      "rgb(124, 58, 237)",
    );
    await page.keyboard.press("Shift+ArrowRight");
    await page.keyboard.press("Shift+ArrowRight");
    await expect(page.locator('[data-collaboration-kind="selection"]').first()).toBeVisible();
    await expect(right.locator("[data-collaboration-text]")).toHaveCount(1);
    await expect(right.locator(content).first()).toHaveCSS("position", "static");
    const bounds = await left.locator(content).first().boundingBox();
    await page.mouse.move(bounds!.x + 90, bounds!.y + 10);
    await expect(page.locator('[data-collaboration-kind="pointer"]')).toHaveCount(1);
    const pointer = await page.locator('[data-collaboration-kind="pointer"]').boundingBox();
    const target = await right.locator("[data-rivto-surface]").boundingBox();
    expect(pointer!.x).toBeGreaterThanOrEqual(target!.x);
    await page.mouse.move(1, 1);
    await expect(page.locator('[data-collaboration-kind="pointer"]')).toHaveCount(0);
    await right.locator(content).first().click();
    await expect(page.locator('[data-collaboration-kind="caret"]')).toHaveCount(2);
    await expect(
      page.locator('[data-collaboration-kind="caret"]').filter({ hasText: "Olga" }),
    ).toHaveCSS("color", "rgb(234, 179, 8)");
    await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    await expect(page.locator("[data-collaboration-kind]")).toHaveCount(0);
    await expect(right.locator("[data-collaboration-text]")).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

test("shares text selections across modes but keeps pointers mode-specific", async ({ page }) => {
  await page.goto(`/?sync=1&room=cross-mode-${crypto.randomUUID()}`);
  const left = page.locator('[data-editor-sync="left"]');
  const right = page.locator('[data-editor-sync="right"]');
  const text = left.locator("[data-block-content]").first();
  await expect(right.locator("[data-block-content]")).toHaveCount(2);
  await right.getByRole("button", { name: "Edgeless", exact: true }).click();
  await text.click();
  await page.keyboard.press("Home");
  await page.keyboard.press("Shift+ArrowRight");
  await expect(page.locator('[data-collaboration-kind="selection"]').first()).toBeVisible();
  const bounds = await text.boundingBox();
  await page.mouse.move(bounds!.x + 30, bounds!.y + 10);
  await expect(page.locator('[data-collaboration-kind="pointer"]')).toHaveCount(0);
});

test("keeps an active local caret anchored through a remote insertion", async ({ page }) => {
  await page.goto(`/?sync=1&room=anchor-${crypto.randomUUID()}`);
  const text = page.locator('[data-editor-sync="left"] [data-block-content]').first();
  await expect(page.locator('[data-editor-sync="right"] [data-block-content]')).toHaveCount(2);
  await text.click();
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  const before = await page.evaluate(() => window.getSelection()!.focusOffset);
  await page.evaluate(() => {
    const { right } = (
      window as unknown as {
        __rivtoSync: { right: { editor: import("@chulane/rivto").DocumentEditorAPI } };
      }
    ).__rivtoSync;
    const doc = right.editor.getDocument();
    doc.blocks.insertText(doc.blocks.getRootIds()[0]!, 0, "REMOTE ");
  });
  await expect(text).toContainText("REMOTE ");
  await expect.poll(() => page.evaluate(() => window.getSelection()!.focusOffset)).toBe(before + 7);
  await page.keyboard.type("X");
  await expect(text).toContainText("REMOTE **XSynced");
  await expect.poll(() => page.evaluate(() => window.getSelection()!.focusOffset)).toBe(before + 8);
  await page.evaluate(() => {
    const { right } = (
      window as unknown as {
        __rivtoSync: { right: { editor: import("@chulane/rivto").DocumentEditorAPI } };
      }
    ).__rivtoSync;
    const doc = right.editor.getDocument();
    const id = doc.blocks.getRootIds()[0]!;
    doc.blocks.updateBlock(id, { content: "NEXT " + doc.blocks.getBlockNode(id)!.content });
  });
  await expect(text).toContainText("NEXT REMOTE **XSynced");
  await expect
    .poll(() => page.evaluate(() => window.getSelection()!.focusOffset))
    .toBe(before + 13);
});

test("renders structural block selections without changing local selection or snapshots", async ({
  page,
}) => {
  await page.goto(`/?sync=1&room=objects-${crypto.randomUUID()}`);
  const right = page.locator('[data-editor-sync="right"]');
  await expect(right.locator("[data-block-content]")).toHaveCount(2);
  await page.locator('[data-editor-sync="left"] [data-block-content]').first().click();
  await expect(page.locator('[data-collaboration-kind="caret"]')).toHaveCount(1);
  const baseline = await page.evaluate(() => {
    const { left, right } = (
      window as unknown as {
        __rivtoSync: {
          left: { reactEditor: import("@chulane/rivto-react").ReactEditorApi };
          right: { editor: import("@chulane/rivto").DocumentEditorAPI };
        };
      }
    ).__rivtoSync;
    const panel = left.reactEditor.panels.getActive()!;
    const id = panel.document.blocks.getRootIds()[0]!;
    panel.selection.set({
      type: "selection",
      blocks: [{ id, start: 0, end: -1 }],
      anchorBlockId: id,
      focusBlockId: id,
    });
    return { snapshot: right.editor.dump(), selection: right.editor.selection.get() };
  });
  await expect(page.locator('[data-collaboration-kind="object"]')).toHaveCount(1);
  expect(
    await page.evaluate(() => {
      const { right } = (
        window as unknown as {
          __rivtoSync: { right: { editor: import("@chulane/rivto").DocumentEditorAPI } };
        }
      ).__rivtoSync;
      return { snapshot: right.editor.dump(), selection: right.editor.selection.get() };
    }),
  ).toEqual(baseline);
});

test("shows selected canvas elements and follows viewport zoom", async ({ page }) => {
  await page.goto(`/?sync=1&room=elements-${crypto.randomUUID()}`);
  for (const side of ["left", "right"]) {
    await page
      .locator(`[data-editor-sync="${side}"]`)
      .getByRole("button", { name: "Edgeless", exact: true })
      .click();
  }
  const id = await page.evaluate(() => {
    const { left } = (
      window as unknown as {
        __rivtoSync: { left: { editor: import("@chulane/rivto").DocumentEditorAPI } };
      }
    ).__rivtoSync;
    return left.editor.elements.insertElement({
      type: "shape",
      frame: { x: 100, y: 150, width: 120, height: 80 },
      zIndex: 1,
      props: {},
    }).id;
  });
  const shape = page.locator(`[data-editor-sync="left"] [data-edgeless-object-id="${id}"]`);
  await shape.click();
  await expect(page.locator('[data-collaboration-kind="object"]')).toHaveCount(1);
  const remote = page.locator(`[data-editor-sync="right"] [data-edgeless-object-id="${id}"]`);
  const outline = page.locator('[data-collaboration-kind="object"]');
  await expect
    .poll(async () => Math.abs((await outline.boundingBox())!.x - (await remote.boundingBox())!.x))
    .toBeLessThan(2);
  const rightRoot = page.locator('[data-editor-sync="right"] [data-rivto-surface="edgeless"]');
  const zoom = await rightRoot.getAttribute("data-edgeless-zoom");
  await rightRoot.hover();
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -120);
  await page.keyboard.up("Control");
  await expect(rightRoot).not.toHaveAttribute("data-edgeless-zoom", zoom!);
  await expect
    .poll(async () => Math.abs((await outline.boundingBox())!.x - (await remote.boundingBox())!.x))
    .toBeLessThan(2);
});

test("closing an inactive shared panel preserves the active panel's presence", async ({ page }) => {
  await page.goto(`/?embeddings=1&room=panels-${crypto.randomUUID()}`);
  await page.getByRole("button", { name: "Open source", exact: true }).click();
  const panels = page.locator('[data-document-pane="source"]');
  await expect(panels).toHaveCount(2);
  await panels.last().locator("[data-block-content]").first().click();
  await page.keyboard.press("Home");
  const state = () =>
    page.evaluate(() => {
      const runtime = (
        window as unknown as {
          __rivtoDocuments: {
            panes: Set<{ id: string; reactEditor: import("@chulane/rivto-react").ReactEditorApi }>;
          };
        }
      ).__rivtoDocuments;
      const panel = [...runtime.panes].find((panel) => panel.id === "source")!;
      const collaboration = panel.reactEditor.getDocument().collaboration;
      return collaboration.getStates().get(collaboration.clientId);
    });
  await expect.poll(state).toHaveProperty("selection");
  const before = await state();
  await panels.first().getByRole("button", { name: "Close source", exact: true }).click();
  await expect(panels).toHaveCount(1);
  expect(await state()).toEqual(before);
});

test("exchanges presence through the existing WebRTC provider across tabs", async ({
  page,
  context,
}) => {
  const room = `webrtc-${crypto.randomUUID()}`;
  await page.goto(`/?embeddings=1&provider=webrtc&signaling=ws://127.0.0.1:1&room=${room}`);
  const source = page.locator('[data-document-pane="source"] [data-block-content]').first();
  await expect(source).toHaveText("Source text");
  const peer = await context.newPage();
  await peer.goto(`/?embeddings=1&provider=webrtc&signaling=ws://127.0.0.1:1&join=1&room=${room}`);
  await peer.getByRole("button", { name: "Open source", exact: true }).click();
  await expect(
    peer.locator('[data-document-pane="source"] [data-block-content]').first(),
  ).toHaveText("Source text");
  await page.bringToFront();
  await source.click();
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowRight");
  await expect(peer.locator('[data-collaboration-kind="caret"]')).toHaveCount(1);
  await page.close();
  await expect(peer.locator('[data-collaboration-kind="caret"]')).toHaveCount(0);
  await peer.close();
});

test("renders multi-block text ranges and removes deleted targets", async ({ page }) => {
  await page.goto(`/?sync=1&room=range-${crypto.randomUUID()}`);
  const left = page.locator('[data-editor-sync="left"]');
  const right = page.locator('[data-editor-sync="right"]');
  await expect(right.locator("[data-block-content]")).toHaveCount(2);
  await left.locator("[data-block-content]").first().click();
  await page.keyboard.press("Home");
  const from = (await left.locator("[data-block-content]").first().boundingBox())!;
  const to = (await left.locator("[data-block-content]").last().boundingBox())!;
  await page.mouse.move(from.x + 20, from.y + 10);
  await page.keyboard.down("Shift");
  await page.keyboard.down("Alt");
  await page.mouse.down();
  await page.mouse.move(to.x + 60, to.y + 10, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.up("Alt");
  await page.keyboard.up("Shift");
  await expect(right.locator("[data-collaboration-text]")).toHaveCount(2);
  await expect(page.locator('[data-collaboration-kind="selection"]').first()).toBeVisible();
  await page.evaluate(() => {
    const { right } = (
      window as unknown as {
        __rivtoSync: { right: { editor: import("@chulane/rivto").DocumentEditorAPI } };
      }
    ).__rivtoSync;
    right.editor.history.batchUpdates(() => {
      for (const id of right.editor.blocks.getRootIds()) {
        right.editor.blocks.removeBlock(id);
      }
    });
  });
  await expect(right.locator("[data-block-content]")).toHaveCount(0);
  await expect(left.locator("[data-block-content]")).toHaveCount(0);
  await expect(page.locator('[data-collaboration-kind="selection"]')).toHaveCount(0);
  await expect(page.locator('[data-collaboration-kind="caret"]')).toHaveCount(0);
  await expect(right.locator("[data-collaboration-text]")).toHaveCount(0);
});

test("keeps page pointers in panel whitespace through scrolling and clears them on exit", async ({
  page,
}) => {
  await page.goto(`/?sync=1&room=whitespace-${crypto.randomUUID()}`);
  const left = page.locator('[data-editor-sync="left"] [data-rivto-surface="block"]');
  const right = page.locator('[data-editor-sync="right"] [data-rivto-surface="block"]');
  await expect(right.locator("[data-block-content]")).toHaveCount(2);
  await left.evaluate((root) => {
    root.style.minHeight = "1500px";
  });
  await right.evaluate((root) => {
    root.style.minHeight = "1500px";
  });
  await left.locator("[data-block-content]").first().click();
  await page.keyboard.press("Home");
  await expect(page.locator('[data-collaboration-kind="caret"]')).toHaveCount(1);
  const bounds = (await left.boundingBox())!;
  const point = {
    x: bounds.x + 5,
    y: (await left.locator("[data-block-id]").last().boundingBox())!.y + 150,
  };
  expect(
    await page.evaluate(
      ({ x, y }) => !!document.elementFromPoint(x, y)?.closest("[data-block-id]"),
      point,
    ),
  ).toBe(false);
  await page.mouse.move(point.x, point.y);
  const pointer = page.locator('[data-collaboration-kind="pointer"]');
  await expect(pointer).toHaveCount(1);
  await expect
    .poll(async () => Math.abs((await pointer.boundingBox())!.y - point.y))
    .toBeLessThan(2);
  await expect(page.locator('[data-collaboration-kind="caret"]')).toHaveCount(1);
  await page.mouse.wheel(0, 200);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await expect
    .poll(async () => Math.abs((await pointer.boundingBox())!.y - point.y))
    .toBeLessThan(2);
  await expect
    .poll(async () =>
      Math.abs((await pointer.boundingBox())!.x - (await right.boundingBox())!.x - 5),
    )
    .toBeLessThan(2);
  await page.mouse.move(1, 1);
  await expect(pointer).toHaveCount(0);
  await page.mouse.wheel(0, 100);
  await expect(pointer).toHaveCount(0);
});

for (const repeat of [0, 200]) {
  for (const mode of ["Page", "Edgeless"] as const) {
    test(`interpolates remote pointers and respects reduced motion in ${mode}, repeat=${repeat}`, async ({
      page,
    }) => {
      await page.goto(`/?sync=1&repeat=${repeat}&room=smooth-${crypto.randomUUID()}`);
      const left = page.locator('[data-editor-sync="left"]');
      const right = page.locator('[data-editor-sync="right"]');
      await expect(right.locator("[data-block-content]")).toHaveCount(2 + repeat);
      if (mode === "Edgeless") {
        await left.getByRole("button", { name: mode, exact: true }).click();
        await right.getByRole("button", { name: mode, exact: true }).click();
      }
      const text = left.locator("[data-block-content]").first();
      await text.click();
      const bounds = (await text.boundingBox())!;
      await page.mouse.move(bounds.x + 30, bounds.y + 10);
      const pointer = page.locator('[data-collaboration-kind="pointer"]');
      await expect(pointer).toHaveCount(1);
      await pointer.evaluate((element) => {
        (window as unknown as { __cursorFrames: Promise<number[]> }).__cursorFrames = new Promise(
          (resolve) => {
            const values: number[] = [element.getBoundingClientRect().x];
            const sample = () => {
              values.push(element.getBoundingClientRect().x);
              if (values.length < 35) {
                requestAnimationFrame(sample);
              } else {
                resolve(values);
              }
            };
            requestAnimationFrame(sample);
          },
        );
      });
      await page.mouse.move(bounds.x + 150, bounds.y + 10);
      const positions = await page.evaluate(
        () => (window as unknown as { __cursorFrames: Promise<number[]> }).__cursorFrames,
      );
      const first = positions[0]!;
      const last = positions.at(-1)!;
      expect(last - first).toBeGreaterThan(80);
      expect(positions.filter((x) => x > first + 2 && x < last - 2).length).toBeGreaterThanOrEqual(
        2,
      );
      const steps = positions.slice(1).map((x, index) => ({ x, delta: x - positions[index]! }));
      const maximumStep = Math.max(...steps.map(({ delta }) => delta));
      const laterSteps = steps.filter(
        ({ x, delta }) =>
          delta > 0.5 && x > first + (last - first) * 0.6 && x < first + (last - first) * 0.9,
      );
      expect(laterSteps.length).toBeGreaterThan(0);
      expect(Math.max(...laterSteps.map(({ delta }) => delta))).toBeLessThan(maximumStep * 0.8);
      const pointerNode = await pointer.elementHandle();
      await page.keyboard.press("Shift+ArrowRight");
      await expect(page.locator('[data-collaboration-kind="selection"]').first()).toBeVisible();
      expect(await pointerNode!.evaluate((element) => element.isConnected)).toBe(true);
      await page.emulateMedia({ reducedMotion: "reduce" });
      await expect(pointer).toHaveCSS("transition-duration", "0s");
      await page.mouse.move(1, 1);
      await expect(pointer).toHaveCount(0);
    });
  }
}

for (const mode of ["Page", "Edgeless"] as const) {
  test(`preserves the local caret while typing, deleting, replacing and inserting text in ${mode}`, async ({
    page,
  }) => {
    await page.goto(`/?sync=1&room=typing-${crypto.randomUUID()}`);
    const left = page.locator('[data-editor-sync="left"]');
    const right = page.locator('[data-editor-sync="right"]');
    await expect(right.locator("[data-block-content]")).toHaveCount(2);
    if (mode === "Edgeless") {
      await left.getByRole("button", { name: mode, exact: true }).click();
      await right.getByRole("button", { name: mode, exact: true }).click();
    }
    const text = left.locator("[data-block-content]").first();
    await text.click();
    await page.keyboard.press("Home");
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press("ArrowRight");
    }
    const before = (await text.textContent())!;
    for (const [index, character] of [..."hello"].entries()) {
      await page.keyboard.type(character);
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );
      await expect
        .poll(() => page.evaluate(() => window.getSelection()!.focusOffset))
        .toBe(5 + index);
    }
    await expect(text).toHaveText(before.slice(0, 4) + "hello" + before.slice(4));
    await page.keyboard.press("Backspace");
    await expect.poll(() => page.evaluate(() => window.getSelection()!.focusOffset)).toBe(8);
    await page.keyboard.press("Shift+ArrowLeft");
    await page.keyboard.press("Shift+ArrowLeft");
    await page.keyboard.type("XY");
    await expect(text).toHaveText(before.slice(0, 4) + "heXY" + before.slice(4));
    await expect(right.locator("[data-block-content]").first()).toHaveText(
      (await text.textContent()) ?? "",
    );
    await expect.poll(() => page.evaluate(() => window.getSelection()!.focusOffset)).toBe(8);
    const replaced = (await text.textContent())!;
    await page.keyboard.insertText(" pasted ");
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await expect.poll(() => page.evaluate(() => window.getSelection()!.focusOffset)).toBe(16);
    await expect(text).toHaveText(replaced.slice(0, 8) + " pasted " + replaced.slice(8));
    await expect(right.locator("[data-block-content]").first()).toHaveText(
      (await text.textContent()) ?? "",
    );
  });
}

for (const repeat of [0, 200]) {
  for (const side of ["left", "right"] as const) {
    test(`retains remote selection highlights when ${side} switches surface modes, repeat=${repeat}`, async ({
      page,
    }) => {
      await page.goto(`/?sync=1&repeat=${repeat}&room=mode-presence-${crypto.randomUUID()}`);
      const left = page.locator('[data-editor-sync="left"]');
      const right = page.locator('[data-editor-sync="right"]');
      await expect(right.locator("[data-block-content]")).toHaveCount(2 + repeat);
      await left.locator("[data-block-content]").first().click();
      await page.keyboard.press("Home");
      await page.keyboard.press("Shift+ArrowRight");
      await page.keyboard.press("Shift+ArrowRight");
      const highlight = page.locator('[data-collaboration-kind="selection"]');
      await expect(highlight).toHaveCount(1);
      const selected = await page.evaluate(() => {
        const { left } = (
          window as unknown as {
            __rivtoSync: { left: { editor: import("@chulane/rivto").DocumentEditorAPI } };
          }
        ).__rivtoSync;
        const channel = left.editor.getDocument().collaboration;
        return channel.getStates().get(channel.clientId)?.selection;
      });
      await page.evaluate((side) => {
        const inspected = window as unknown as {
          __rivtoSync: Record<
            string,
            { reactEditor: import("@chulane/rivto-react").ReactEditorApi }
          >;
          __modeTiming: { started: number; synchronous: number[]; missing: number };
        };
        const metrics = { started: 0, synchronous: [] as number[], missing: 0 };
        inspected.__modeTiming = metrics;
        const channel = inspected.__rivtoSync.left.reactEditor.getDocument().collaboration;
        channel.subscribe(() => {
          if (!channel.getStates().get(channel.clientId)?.selection) {
            metrics.missing++;
          }
        });
        const mode = inspected.__rivtoSync[side].reactEditor.panels.getDefault()!.mode;
        const set = mode.set.bind(mode);
        mode.set = (next) => {
          metrics.started = performance.now();
          set(next);
          metrics.synchronous.push(performance.now() - metrics.started);
        };
      }, side);
      const samples: number[] = [];
      const switching = page.locator(`[data-editor-sync="${side}"]`);
      for (const mode of [
        "Edgeless",
        "Page",
        "Edgeless",
        "Page",
        "Edgeless",
        "Page",
        "Edgeless",
        "Page",
      ]) {
        await switching.getByRole("button", { name: mode, exact: true }).click();
        samples.push(
          await page.evaluate(
            () =>
              new Promise<number>((resolve) => {
                requestAnimationFrame(() =>
                  requestAnimationFrame(() =>
                    resolve(
                      performance.now() -
                        (window as unknown as { __modeTiming: { started: number } }).__modeTiming
                          .started,
                    ),
                  ),
                );
              }),
          ),
        );
        await expect(highlight).toHaveCount(1);
        await expect(highlight).toBeVisible();
        await expect(right.locator("[data-collaboration-text]")).toHaveCount(1);
        expect(
          await page.evaluate(() => {
            const { left } = (
              window as unknown as {
                __rivtoSync: { left: { editor: import("@chulane/rivto").DocumentEditorAPI } };
              }
            ).__rivtoSync;
            const channel = left.editor.getDocument().collaboration;
            return channel.getStates().get(channel.clientId)?.selection;
          }),
        ).toEqual(selected);
      }
      const metrics = await page.evaluate(
        () =>
          (
            window as unknown as {
              __modeTiming: { synchronous: number[]; missing: number };
            }
          ).__modeTiming,
      );
      expect(metrics.missing).toBe(0);
      console.log(JSON.stringify({ side, repeat, samples, ...metrics }));
      await page.evaluate(() => window.dispatchEvent(new Event("blur")));
      await expect(highlight).toHaveCount(0);
    });
  }
}

test("withdraws presence when a panel closes during a mode change", async ({ page }) => {
  await page.goto(`/?embeddings=1&room=mode-close-${crypto.randomUUID()}`);
  const source = page.locator('[data-document-pane="source"]');
  await source.locator("[data-block-content]").first().click();
  await page.keyboard.press("Home");
  await page.keyboard.press("Shift+ArrowRight");
  await page.evaluate(() => {
    const runtime = (
      window as unknown as {
        __rivtoDocuments: {
          panes: Set<{ id: string; reactEditor: import("@chulane/rivto-react").ReactEditorApi }>;
        };
      }
    ).__rivtoDocuments;
    const editor = [...runtime.panes].find((pane) => pane.id === "source")!.reactEditor;
    const channel = editor.getDocument().collaboration;
    (window as unknown as { __readClosedPresence: () => unknown }).__readClosedPresence = () =>
      channel.getStates().get(channel.clientId);
    editor.panels.getActive()!.mode.set("edgeless");
    document.querySelector<HTMLButtonElement>('[data-document-pane="source"] > button')!.click();
  });
  await expect(source).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(() =>
        (
          window as unknown as {
            __readClosedPresence: () => unknown;
          }
        ).__readClosedPresence(),
      ),
    )
    .toBeUndefined();
});

for (const repeat of [0, 200]) {
  for (const mode of ["Page", "Edgeless"] as const) {
    test(`keeps both collaborators' highlights when focus moves between editors in ${mode}, repeat=${repeat}`, async ({
      page,
    }) => {
      await page.goto(`/?sync=1&repeat=${repeat}&room=two-selections-${crypto.randomUUID()}`);
      const left = page.locator('[data-editor-sync="left"]');
      const right = page.locator('[data-editor-sync="right"]');
      await expect(right.locator("[data-block-content]")).toHaveCount(2 + repeat);
      if (mode === "Edgeless") {
        await left.getByRole("button", { name: mode, exact: true }).click();
        await right.getByRole("button", { name: mode, exact: true }).click();
      }
      await left.locator("[data-block-content]").first().click();
      await page.keyboard.press("Home");
      await page.keyboard.press("Shift+ArrowRight");
      await page.keyboard.press("Shift+ArrowRight");
      await expect(right.locator("[data-block-content]").first()).toHaveAttribute(
        "data-collaboration-text",
        "",
      );
      await right.locator("[data-block-content]").nth(1).click();
      await page.keyboard.press("Home");
      await page.keyboard.press("Shift+ArrowRight");
      await page.keyboard.press("Shift+ArrowRight");
      await expect(left.locator("[data-block-content]").nth(1)).toHaveAttribute(
        "data-collaboration-text",
        "",
      );
      await expect(right.locator("[data-block-content]").first()).toHaveAttribute(
        "data-collaboration-text",
        "",
      );
      await expect(page.locator('[data-collaboration-kind="selection"]')).toHaveCount(2);
      await expect(page.locator('[data-collaboration-kind="caret"]')).toHaveCount(2);
      await page.evaluate(() => {
        const { right } = (
          window as unknown as {
            __rivtoSync: { right: { editor: import("@chulane/rivto").DocumentEditorAPI } };
          }
        ).__rivtoSync;
        const doc = right.editor.getDocument();
        doc.blocks.insertText(doc.blocks.getRootIds()[0]!, 0, "REMOTE ");
      });
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );
      expect(
        await page.evaluate(
          () =>
            window
              .getSelection()
              ?.focusNode?.parentElement?.closest<HTMLElement>("[data-editor-sync]")?.dataset
              .editorSync,
        ),
      ).toBe("right");
      await expect(page.locator('[data-collaboration-kind="selection"]')).toHaveCount(2);
      await page.evaluate(() => {
        const inspected = window as unknown as {
          __rivtoSync: Record<
            string,
            { reactEditor: import("@chulane/rivto-react").ReactEditorApi }
          >;
          __focusTiming: { started: number; synchronous: number[]; updates: number };
        };
        const metrics = { started: 0, synchronous: [] as number[], updates: 0 };
        inspected.__focusTiming = metrics;
        document.addEventListener(
          "pointerdown",
          () => {
            metrics.started = performance.now();
          },
          true,
        );
        for (const peer of Object.values(inspected.__rivtoSync)) {
          const editor = peer.reactEditor;
          editor.getDocument().subscribe(() => metrics.updates++);
          const selection = editor.panels.getDefault()!.selection;
          const set = selection.set.bind(selection);
          selection.set = (value) => {
            const start = performance.now();
            set(value);
            metrics.synchronous.push(performance.now() - start);
          };
        }
      });
      const samples: number[] = [];
      for (let index = 0; index < 6; index++) {
        const text =
          index % 2 === 0
            ? left.locator("[data-block-content]").first()
            : right.locator("[data-block-content]").nth(1);
        await text.click();
        samples.push(
          await page.evaluate(
            () =>
              new Promise<number>((resolve) => {
                requestAnimationFrame(() =>
                  requestAnimationFrame(() =>
                    resolve(
                      performance.now() -
                        (window as unknown as { __focusTiming: { started: number } }).__focusTiming
                          .started,
                    ),
                  ),
                );
              }),
          ),
        );
        await expect(left.locator("[data-block-content]").nth(1)).toHaveAttribute(
          "data-collaboration-text",
          "",
        );
        await expect(right.locator("[data-block-content]").first()).toHaveAttribute(
          "data-collaboration-text",
          "",
        );
        await expect(page.locator('[data-collaboration-kind="caret"]')).toHaveCount(2);
      }
      const metrics = await page.evaluate(
        () =>
          (
            window as unknown as {
              __focusTiming: { synchronous: number[]; updates: number };
            }
          ).__focusTiming,
      );
      expect(metrics.updates).toBe(0);
      console.log(JSON.stringify({ mode, repeat, samples: samples.slice(1), ...metrics }));
      await page.evaluate(() => {
        // Synthetic blur must also model focus loss so pending pointer timers cannot republish.
        Object.defineProperty(document, "hasFocus", { value: () => false });
        window.dispatchEvent(new Event("blur"));
      });
      await expect(page.locator("[data-collaboration-kind]")).toHaveCount(0);
    });
  }
}
