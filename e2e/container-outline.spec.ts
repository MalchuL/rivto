import { expect, test, type Page } from "@playwright/test";
import type { DocumentEditorAPI, EditorBlockInput } from "@chulane/rivto";

const containers = ["kanban", "columns", "bento", "table", "todo-storage"] as const;
type Container = (typeof containers)[number];

/** Runs the same ordinary-block gesture inside each production container. */
class ContainerOutlineFixture {
  /**
   * Borrows the test page for production pointer input.
   *
   * @param page - Browser page owned and released by Playwright.
   */
  constructor(readonly page: Page) {}

  /**
   * Prepends a container to the normal demo without changing its virtualization settings.
   *
   * Bento needs a tile root; table needs a row and cell. Those structural blocks
   * stay outside the ordinary writing list being tested.
   *
   * @param type - Native container hosting the writing list.
   * @param mode - Surface in which to exercise the same hierarchy.
   * @param repeat - Extra demo content for the large-document measurement.
   * @returns Resolves when the source block is mounted.
   */
  async load(type: Container, mode: "block" | "edgeless", repeat = 0): Promise<void> {
    await this.page.setViewportSize({ width: 1400, height: 1100 });
    await this.page.goto(repeat ? `/?repeat=${repeat}` : "/");
    await this.page.locator('[data-journal-document="today"] > .page-surface').waitFor();
    await this.page.evaluate(
      ({ container, mode }) => {
        const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
          .__rivtoDemo.editor;
        const first = editor.blocks.getRootIds()[0];
        editor.blocks.insertBlock(container, { parentId: null, beforeId: first });
        if (mode === "edgeless") {
          const root = container.id!;
          editor.load({
            ...editor.dump(),
            blocks: [editor.blocks.getBlock(root)!],
            elements: [],
            rootElementIds: [],
          });
          editor.elements.insertElement({
            type: "block",
            zIndex: 0,
            frame: { x: 20, y: 20, width: 950, height: 900 },
            props: { startBlockId: root, endBlockId: root },
          });
        }
        editor.history.clear();
      },
      { container: this.createContainer(type), mode },
    );
    if (mode === "edgeless") {
      await this.page.locator('[data-editor-mode="edgeless"]').click();
    }
    await expect(this.page.locator('[data-block-id="moving"]')).toBeVisible();
    const paragraph = this.page.locator('[data-block-id="upper"]');
    await expect(paragraph).toHaveCSS("padding", type === "kanban" ? "12px 10px" : "0px");
    await expect(paragraph).toHaveCSS("box-shadow", "none");
  }

  /**
   * Drops into the physical gap using horizontal pointer position to choose depth.
   *
   * @param nested - True requests a child of the upper block; false requests its next sibling.
   * @returns Resolves after the model order and the visible indicator agree.
   */
  async move(nested: boolean): Promise<void> {
    const source = this.page.locator('[data-block-id="moving"]');
    await source.locator(":scope > .rivto-block-row").hover();
    const handle = source.locator(":scope > .rivto-block-row .block-handle");
    const from = (await handle.boundingBox())!;
    const upper = (await this.page.locator('[data-block-id="upper"]').boundingBox())!;
    const lower = (await this.page.locator('[data-block-id="lower"]').boundingBox())!;
    await this.page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await this.page.mouse.down();
    await this.page.mouse.move(from.x + 8, from.y + 8, { steps: 3 });
    await this.page.mouse.move(
      upper.x + (nested ? 36 : 12),
      (upper.y + upper.height + lower.y) / 2,
      { steps: 12 },
    );
    const line = this.page.locator(".rivto-block-drop-line:visible");
    await expect(line).toBeVisible();
    const upperRow = (await this.page
      .locator('[data-block-id="upper"] > .rivto-block-row')
      .boundingBox())!;
    expect((await line.boundingBox())!.x).toBeCloseTo(nested ? upperRow.x + 24 : upper.x, 0);
    await this.page.mouse.up();
    await expect
      .poll(() =>
        this.page.evaluate(() => {
          const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
            .__rivtoDemo.editor;
          return {
            parent: editor.blocks.getParentId("moving"),
            children: editor.blocks.getChildIds("writing"),
          };
        }),
      )
      .toEqual({
        parent: nested ? "upper" : "writing",
        children: nested ? ["upper", "lower"] : ["upper", "moving", "lower"],
      });
    await expect(line).toHaveCount(0);
  }

  /**
   * Drops above the first card by pointing at the board's padded title.
   *
   * This exercises nearest-position selection through a structural lane while
   * retaining the normal demo and all of its subscribers for performance runs.
   *
   * @returns Resolves after native release inserts the source before the first card.
   */
  async moveFromHeader(): Promise<void> {
    const header = this.page.locator('[data-block-id="container"] > .rivto-block-row');
    await header.evaluate((element) => {
      element.style.paddingTop = "100px";
    });
    const row = (await header.boundingBox())!;
    const first = (await this.page.locator('[data-block-id="upper"]').boundingBox())!;
    const source = this.page.locator('[data-block-id="moving"] > .rivto-block-row');
    await source.hover();
    const handle = source.locator(".block-handle");
    await handle.hover();
    const from = (await handle.boundingBox())!;
    await this.page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await this.page.mouse.down();
    await this.page.mouse.move(from.x + 8, from.y + 8, { steps: 3 });
    await this.page.mouse.move(first.x + 16, row.y + row.height - 3, { steps: 12 });
    const line = this.page.locator(".rivto-block-drop-line:visible");
    await expect(line).toBeVisible();
    const feedback = (await line.boundingBox())!;
    expect(feedback.y + feedback.height / 2).toBeCloseTo(first.y, 0);
    await this.page.mouse.up();
    await expect
      .poll(() =>
        this.page.evaluate(() =>
          (
            window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
          ).__rivtoDemo.editor.blocks.getChildIds("writing"),
        ),
      )
      .toEqual(["moving", "upper", "lower"]);
  }

  /**
   * Records move-command time and two-frame rendering time for subsequent pointer releases.
   *
   * Instrumentation lasts until Playwright releases the test-owned page.
   *
   * @returns Resolves after installing the command wrapper and pointer observer.
   */
  async measure(): Promise<void> {
    await this.page.evaluate(() => {
      const samples: { sync: number; rendered: number }[] = [];
      Object.assign(window, { __containerSamples: samples });
      const editor = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
        .__rivtoDemo.editor;
      const move = editor.blocks.moveBlocks.bind(editor.blocks);
      /**
       * Measures the grouped move including its synchronous subscribers.
       *
       * @param args - Unmodified public move command arguments.
       * @returns Completes the original command and records its duration.
       */
      editor.blocks.moveBlocks = (...args) => {
        const start = performance.now();
        try {
          move(...args);
        } finally {
          samples.at(-1)!.sync = performance.now() - start;
        }
      };
      window.addEventListener(
        "pointerup",
        () => {
          const start = performance.now();
          const sample = { sync: 0, rendered: 0 };
          samples.push(sample);
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              sample.rendered = performance.now() - start;
            }),
          );
        },
        true,
      );
    });
  }

  /**
   * Builds native structural shells around the same three ordinary paragraphs.
   *
   * @param type - Container whose real content-list owner is named writing.
   * @returns Portable hierarchy with stable test IDs and ordinary default renderers.
   */
  private createContainer(type: Container): EditorBlockInput {
    const children: EditorBlockInput[] = [
      { id: "upper", type: "paragraph", content: "Upper paragraph" },
      { id: "lower", type: "paragraph", content: "Lower paragraph" },
      { id: "moving", type: "paragraph", content: "Moving paragraph" },
    ];
    let content: EditorBlockInput = {
      id: "writing",
      type: "paragraph",
      content: "Tile",
      children,
    };
    if (type === "kanban" || type === "columns") {
      content = {
        id: "writing",
        type: `${type}-column`,
        content: type === "kanban" ? "Lane" : "",
        children,
      };
    } else if (type === "table") {
      content = {
        type: "table-row",
        children: [{ id: "writing", type: "table-cell", content: "Cell", children }],
      };
    }
    const container: EditorBlockInput =
      type === "todo-storage"
        ? { id: "writing", type, children }
        : { id: "container", type, children: [content] };
    return container;
  }
}

for (const type of containers) {
  for (const mode of ["block", "edgeless"] as const) {
    test(`default outline placement inside ${type} in ${mode}`, async ({ page }) => {
      const fixture = new ContainerOutlineFixture(page);
      await fixture.load(type, mode);
      await fixture.move(false);
      await page.keyboard.press("ControlOrMeta+z");
      await expect
        .poll(() =>
          page.evaluate(() =>
            (
              window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
            ).__rivtoDemo.editor.blocks.getChildIds("writing"),
          ),
        )
        .toEqual(["upper", "lower", "moving"]);
      await fixture.move(true);
    });
  }
}

for (const repeat of [0, 200]) {
  for (const { type, header } of [
    { type: "kanban", header: false },
    { type: "kanban", header: true },
    { type: "bento", header: false },
  ] as const) {
    test(`@performance ${type} container outline repeat=${repeat} header=${header}`, async ({
      page,
    }) => {
      const fixture = new ContainerOutlineFixture(page);
      await fixture.load(type, "block", repeat);
      if (header) {
        await fixture.moveFromHeader();
      } else {
        await fixture.move(false);
      }
      await page.keyboard.press("ControlOrMeta+z");
      await fixture.measure();
      for (let index = 0; index < 3; index++) {
        if (header) {
          await fixture.moveFromHeader();
        } else {
          await fixture.move(false);
        }
        await page.evaluate(
          () =>
            new Promise<void>((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
            ),
        );
        await page.keyboard.press("ControlOrMeta+z");
        await expect
          .poll(() =>
            page.evaluate(() =>
              (
                window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } }
              ).__rivtoDemo.editor.blocks.getChildIds("writing"),
            ),
          )
          .toEqual(["upper", "lower", "moving"]);
      }
      console.log(
        JSON.stringify({
          repeat,
          header,
          samples: await page.evaluate(
            () => (window as unknown as { __containerSamples: unknown }).__containerSamples,
          ),
        }),
      );
    });
  }
}
