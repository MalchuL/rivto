/** @jest-environment ./jest-browser-environment.mjs */
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { DocumentEditorAPI } from "@chulane/rivto";
import { BlockEditor } from "@chulane/rivto-page";
import { createTestCoreEditor, createTestReactEditor, TestPanel } from "../../test-utils";
import { bentoExtension, createBentoBlockInput } from "../../extensions/containers/bento/bento";
import { tableExtension, createTableBlockInput } from "../../extensions/containers/table/table";

/** Owns the concrete document, host occurrence and mounted Page for one container test. */
class PageContainerFixture {
  readonly container = document.createElement("div");
  readonly root = createRoot(this.container);
  readonly panel;

  /**
   * Creates the host occurrence outside React render using the real container extensions.
   *
   * @param core - Test-owned document editor released with this fixture.
   */
  constructor(readonly core: DocumentEditorAPI) {
    this.panel = createTestReactEditor({
      editor: core,
      extensions: [bentoExtension(), tableExtension()],
    });
    document.body.append(this.container);
  }

  /**
   * Attaches the existing Page controller to the fixture's single document root.
   *
   * @returns React layout effects and container controls have committed.
   */
  mount(): void {
    act(() =>
      this.root.render(
        <TestPanel panel={this.panel}>
          <BlockEditor editor={this.panel.page} ref={this.panel.setRoot} />
        </TestPanel>,
      ),
    );
  }

  /**
   * Activates the first matching resize separator with a real bubbling key event.
   *
   * @param label - Accessible name of the target separator.
   * @returns The keyboard resize and resulting model/render updates have completed.
   */
  resize(label: string): void {
    const target = this.container.querySelector(`[aria-label="${label}"]`);
    expect(target).not.toBeNull();
    act(() =>
      target!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })),
    );
  }

  /**
   * Unmounts the view before releasing its controller, host and document.
   *
   * @returns Resolves after the test document has been released.
   */
  async destroy(): Promise<void> {
    act(() => this.root.unmount());
    this.panel.editor.destroy();
    await this.core.destroy();
    this.container.remove();
  }
}

const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const previous = environment.IS_REACT_ACT_ENVIRONMENT;
beforeAll(() => {
  environment.IS_REACT_ACT_ENVIRONMENT = true;
});
afterAll(() => {
  environment.IS_REACT_ACT_ENVIRONMENT = previous;
});

it("owns Bento tile width on its Page item and restores it through undo", async () => {
  const fixture = new PageContainerFixture(await createTestCoreEditor());
  try {
    const board = fixture.panel.blocks.insertBlock({
      ...createBentoBlockInput(),
      children: [{ type: "paragraph", content: "Tile" }],
    });
    const tileId = board.children[0]!.id;
    fixture.core.history.stopCapturing();
    fixture.mount();
    expect(fixture.container.querySelectorAll("[data-block-id]")).toHaveLength(2);
    expect(fixture.container.querySelectorAll('[role="separator"]')).toHaveLength(2);
    const tile = fixture.container.querySelector<HTMLElement>(".rivto-bento-tile")!;
    expect(tile.style.getPropertyValue("--rivto-bento-width")).toBe("280px");
    fixture.resize("Resize Bento tile from the right");
    expect(fixture.panel.blocks.getBlockNode(tileId)?.props.bentoWidth).toBe(290);
    expect(tile.style.getPropertyValue("--rivto-bento-width")).toBe("290px");
    act(() => fixture.core.history.undo());
    expect(tile.style.getPropertyValue("--rivto-bento-width")).toBe("280px");
  } finally {
    await fixture.destroy();
  }
});

it("owns Table cell widths on Page items and updates a whole column in one undo step", async () => {
  const fixture = new PageContainerFixture(await createTestCoreEditor());
  try {
    const table = fixture.panel.blocks.insertBlock(createTableBlockInput(2, 2));
    fixture.core.history.stopCapturing();
    fixture.mount();
    expect(fixture.container.querySelectorAll("[data-block-id]")).toHaveLength(7);
    const cells = [...fixture.container.querySelectorAll<HTMLElement>(".rivto-table-cell-item")];
    expect(cells.map((cell) => cell.style.getPropertyValue("--rivto-table-column-width"))).toEqual([
      "180px",
      "180px",
      "180px",
      "180px",
    ]);
    expect(
      fixture.panel.page.adapter.selection.getTextLength(table.children[0]!.children[0]!.id),
    ).toBe(0);
    fixture.resize("Resize table column");
    expect(cells.map((cell) => cell.style.getPropertyValue("--rivto-table-column-width"))).toEqual([
      "190px",
      "180px",
      "190px",
      "180px",
    ]);
    act(() => fixture.core.history.undo());
    expect(cells.map((cell) => cell.style.getPropertyValue("--rivto-table-column-width"))).toEqual([
      "180px",
      "180px",
      "180px",
      "180px",
    ]);
  } finally {
    await fixture.destroy();
  }
});

it("owns an empty Bento body target only while that child list remains empty", async () => {
  const fixture = new PageContainerFixture(await createTestCoreEditor());
  const bento = fixture.panel.blocks.insertBlock(createBentoBlockInput());
  fixture.mount();
  const previous = Object.getOwnPropertyDescriptor(document, "elementFromPoint");
  try {
    const body = () =>
      fixture.container.querySelector<HTMLElement>(
        `[data-block-id="${bento.id}"] > .rivto-block-children`,
      )!;
    Object.defineProperty(document, "elementFromPoint", { configurable: true, value: body });
    expect(fixture.panel.page.dropTargets.resolve(0, 0)?.destination).toEqual({
      kind: "inside",
      parentId: bento.id,
    });
    let childId = "";
    act(() => {
      childId = fixture.panel.blocks.insertBlock({ type: "paragraph" }, { parentId: bento.id }).id;
    });
    expect(fixture.panel.page.dropTargets.resolve(0, 0)).toBeUndefined();
    act(() => fixture.panel.blocks.removeBlock(childId));
    expect(fixture.panel.page.dropTargets.resolve(0, 0)?.destination).toEqual({
      kind: "inside",
      parentId: bento.id,
    });
  } finally {
    if (previous) {
      Object.defineProperty(document, "elementFromPoint", previous);
    } else {
      Reflect.deleteProperty(document, "elementFromPoint");
    }
    await fixture.destroy();
  }
});
