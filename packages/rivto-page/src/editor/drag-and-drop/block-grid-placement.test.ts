import { BlockEditorController } from "../block-editor-controller";
import { TestBlockEditorAdapter } from "../../test-utils/test-block-editor-adapter";
import { BlockOutlineDropTargets } from "./block-outline-drop-targets";

/** Unknown host type exercising only the current registered layout-region contract. */
class GridFixture {
  readonly data = new TestBlockEditorAdapter();
  readonly editor = new BlockEditorController({ adapter: this.data });
  readonly root = document.createElement("div");
  readonly targets = new BlockOutlineDropTargets(this.editor, null);
  readonly first: HTMLElement;
  readonly chrome: HTMLElement;

  /**
   * Mounts two padded grid items with chrome outside their canonical shells.
   *
   * The fixture registers the same item/shell roles supplied by Page primitives;
   * the resolver must not depend on a native Bento type or direct-child row markup.
   */
  constructor() {
    this.data.rootIds = ["board"];
    this.data.setBlockIds(this.data.rootIds);
    this.data.setNode("board", { type: "custom-grid", childIds: ["first", "last"] });
    this.data.setNode("first");
    this.data.setNode("last");
    this.root.dataset.rivtoBlockEditor = "true";
    this.root.innerHTML =
      '<div class="rivto-block" data-block-id="board"><div class="rivto-block-row"></div><div class="rivto-block-children" data-block-drop-axis="grid" data-block-drop-placement="siblings"></div></div>';
    document.body.append(this.root);
    this.editor.attach(this.root);
    const board = this.root.firstElementChild as HTMLElement;
    const list = board.lastElementChild as HTMLElement;
    this.editor.regions.register("board", "shell", board);
    this.editor.regions.register("board", "children", list);
    this.measure(board, 80, 50, 440, 400);
    this.measure(list, 90, 90, 420, 300);
    this.first = this.addItem(list, "first", 100);
    this.addItem(list, "last", 300);
    this.chrome = list.querySelector("button")!;
  }

  /**
   * Releases all fixture-owned region registrations and mounted DOM.
   *
   * @returns No fixture references remain registered with the editor.
   */
  destroy(): void {
    this.editor.destroy();
    this.root.remove();
  }

  /**
   * Mounts an identified placement and its padded shell through a neutral wrapper.
   *
   * @param list - Registered grid host owning this direct child.
   * @param id - Canonical child identity.
   * @param left - Viewport left edge of the placement in CSS pixels.
   * @returns The mounted canonical shell, excluding surrounding insertion space.
   */
  private addItem(list: HTMLElement, id: string, left: number): HTMLElement {
    const item = document.createElement("div");
    item.dataset.blockItemId = id;
    item.innerHTML = `<section><div class="rivto-block" data-block-id="${id}"><header><div class="rivto-block-row"></div></header></div><button>Resize</button></section>`;
    list.append(item);
    const shell = item.querySelector<HTMLElement>("[data-block-id]")!;
    const row = shell.querySelector<HTMLElement>(".rivto-block-row")!;
    this.editor.regions.register(id, "item", item);
    this.editor.regions.register(id, "shell", shell);
    this.editor.regions.register(id, "row", row);
    this.measure(item, left, 100, 200, 100);
    this.measure(shell, left + 8, 108, 184, 84);
    this.measure(row, left + 20, 120, 160, 24);
    return shell;
  }

  /**
   * Supplies stable geometry without browser layout in the resolver regression.
   *
   * @param element - Mounted region whose rectangle is measured by placement.
   * @param left - Viewport X in CSS pixels.
   * @param top - Viewport Y in CSS pixels.
   * @param width - Full border-box width in CSS pixels.
   * @param height - Full border-box height in CSS pixels.
   * @returns Subsequent rectangle reads use the supplied bounds.
   */
  private measure(
    element: HTMLElement,
    left: number,
    top: number,
    width: number,
    height: number,
  ): void {
    jest.spyOn(element, "getBoundingClientRect").mockReturnValue({
      left,
      top,
      width,
      height,
      right: left + width,
      bottom: top + height,
    } as DOMRect);
  }
}

it.each([
  { edge: "left", x: 109, y: 150, before: true },
  { edge: "right", x: 291, y: 150, before: false },
  { edge: "top", x: 200, y: 109, before: true },
  { edge: "bottom", x: 200, y: 191, before: false },
])("keeps the padded grid $edge rim in its actual sibling list", ({ x, y, before }) => {
  const fixture = new GridFixture();
  try {
    const target = fixture.targets.resolve(x, y, new Set(), fixture.first);
    expect(target?.destination).toEqual({
      kind: "between",
      parentId: "board",
      previousId: before ? null : "first",
      nextId: before ? "first" : "last",
    });
    if (!before) {
      expect(target?.indicator).toEqual({ left: 299, top: 100, width: 2, height: 100 });
    }
  } finally {
    fixture.destroy();
  }
});

it("retains center nesting below the title row without applying outline depth to a grid item", () => {
  const fixture = new GridFixture();
  try {
    expect(fixture.targets.resolve(200, 150, new Set(), fixture.first)?.destination).toEqual({
      kind: "inside",
      parentId: "first",
    });
  } finally {
    fixture.destroy();
  }
});

it("uses registered item ownership for resize or slot chrome outside its shell", () => {
  const fixture = new GridFixture();
  try {
    expect(fixture.targets.resolve(112, 150, new Set(), fixture.chrome)?.destination).toEqual({
      kind: "between",
      parentId: "board",
      previousId: null,
      nextId: "first",
    });
    expect(fixture.targets.resolve(112, 150, new Set(["first"]), fixture.chrome)).toBeUndefined();
  } finally {
    fixture.destroy();
  }
});

it("uses reading direction for inline rims without changing vertical order", () => {
  const fixture = new GridFixture();
  try {
    fixture.first.style.direction = "rtl";
    expect(fixture.targets.resolve(109, 150, new Set(), fixture.first)?.destination).toEqual({
      kind: "between",
      parentId: "board",
      previousId: "first",
      nextId: "last",
    });
    expect(fixture.targets.resolve(200, 109, new Set(), fixture.first)?.destination).toEqual({
      kind: "between",
      parentId: "board",
      previousId: null,
      nextId: "first",
    });
  } finally {
    fixture.destroy();
  }
});

it("retains sibling placement in a grid center when child insertion is disabled", () => {
  const fixture = new GridFixture();
  try {
    const targets = new BlockOutlineDropTargets(fixture.editor, null, 24, false);
    expect(targets.resolve(220, 150, new Set(), fixture.first)?.destination).toEqual({
      kind: "between",
      parentId: "board",
      previousId: "first",
      nextId: "last",
    });
  } finally {
    fixture.destroy();
  }
});
