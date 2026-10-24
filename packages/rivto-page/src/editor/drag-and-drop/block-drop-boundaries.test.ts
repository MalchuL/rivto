import { BlockEditorController } from "../block-editor-controller";
import { TestBlockEditorAdapter } from "../../test-utils/test-block-editor-adapter";
import { BlockOutlineDropTargets } from "./block-outline-drop-targets";

/** Mounted parent/child geometry shared by canonical-gap and region-priority checks. */
class BoundaryFixture {
  readonly data = new TestBlockEditorAdapter();
  readonly editor = new BlockEditorController({ adapter: this.data });
  readonly root = document.createElement("div");
  readonly targets = new BlockOutlineDropTargets(this.editor, null);

  /**
   * Creates a parent row, one indented child and a following root with distinct edges.
   */
  constructor() {
    this.data.rootIds = ["parent", "tail"];
    this.data.setBlockIds(this.data.rootIds);
    this.data.setNode("parent", { childIds: ["child"] });
    this.data.setNode("child");
    this.data.setNode("tail");
    this.root.dataset.rivtoBlockEditor = "true";
    this.root.innerHTML =
      '<div class="rivto-block" data-block-id="parent"><div class="rivto-block-row" id="parent-row"></div><div class="rivto-block-children rivto-block-outline"><div class="rivto-block" data-block-id="child"><div class="rivto-block-row" id="child-row"></div></div></div></div><div class="rivto-block" data-block-id="tail"><div class="rivto-block-row" id="tail-row"></div></div>';
    document.body.append(this.root);
    this.editor.attach(this.root);
    for (const [selector, left, top, bottom] of [
      ['[data-block-id="parent"]', 100, 100, 174],
      ["#parent-row", 100, 100, 124],
      ['[data-block-id="child"]', 124, 150, 174],
      ["#child-row", 124, 150, 174],
      ['[data-block-id="tail"]', 100, 200, 224],
      ["#tail-row", 100, 200, 224],
    ] as const) {
      jest.spyOn(this.root.querySelector(selector)!, "getBoundingClientRect").mockReturnValue({
        left,
        right: 400,
        top,
        bottom,
        width: 400 - left,
        height: bottom - top,
      } as DOMRect);
    }
  }

  /**
   * Releases controller-owned resources and the fixture's DOM.
   *
   * @returns The mounted occurrence is removed.
   */
  destroy(): void {
    this.editor.destroy();
    this.root.remove();
  }
}

it("draws the same first-child gap from the parent and child edges", () => {
  const fixture = new BoundaryFixture();
  try {
    const after = fixture.targets.resolve(
      140,
      123,
      new Set(),
      fixture.root.querySelector("#parent-row")!,
    );
    const before = fixture.targets.resolve(
      140,
      151,
      new Set(),
      fixture.root.querySelector("#child-row")!,
    );
    expect(after?.destination).toEqual({
      kind: "between",
      parentId: "parent",
      previousId: null,
      nextId: "child",
    });
    expect(before?.destination).toEqual(after?.destination);
    expect(after?.indicator).toEqual(before?.indicator);
  } finally {
    fixture.destroy();
  }
});

it("keeps an explicit child destination when it overlaps the container rim", () => {
  const fixture = new BoundaryFixture();
  try {
    fixture.root.querySelector(".rivto-block-children")!.classList.remove("rivto-block-outline");
    const row = fixture.root.querySelector<HTMLElement>("#child-row")!;
    const destination = {
      kind: "between" as const,
      parentId: "parent",
      previousId: "child",
      nextId: null,
    };
    fixture.editor.dropTargets.register({ element: row, getDestination: () => destination });
    expect(fixture.targets.resolve(180, 172, new Set(), row)?.destination).toEqual(destination);
  } finally {
    fixture.destroy();
  }
});

it("retains an outer gap at the container's own registered header", () => {
  const fixture = new BoundaryFixture();
  try {
    fixture.root.querySelector(".rivto-block-children")!.classList.remove("rivto-block-outline");
    const row = fixture.root.querySelector<HTMLElement>("#parent-row")!;
    fixture.editor.dropTargets.register({
      element: row,
      getDestination: () => ({ kind: "inside", parentId: "parent" }),
    });
    expect(fixture.targets.resolve(180, 101, new Set(), row)?.destination).toEqual({
      kind: "between",
      parentId: null,
      previousId: null,
      nextId: "parent",
    });
  } finally {
    fixture.destroy();
  }
});

it.each([false, true])("shares the final child gap from either side, nested=%s", (nested) => {
  const fixture = new BoundaryFixture();
  try {
    const x = nested ? 126 : 102;
    const after = fixture.targets.resolve(
      x,
      173,
      new Set(),
      fixture.root.querySelector("#child-row")!,
    );
    const before = fixture.targets.resolve(
      x,
      201,
      new Set(),
      fixture.root.querySelector("#tail-row")!,
    );
    expect(after?.destination.parentId).toBe(nested ? "parent" : null);
    expect(before?.destination).toEqual(after?.destination);
    expect(before?.indicator).toEqual(after?.indicator);
  } finally {
    fixture.destroy();
  }
});

it.each([1, 3])("keeps both physical gaps around %i moving siblings", (count) => {
  const data = new TestBlockEditorAdapter();
  const moving = Array.from({ length: count }, (_, index) => `moving-${index}`);
  data.rootIds = ["upper", ...moving, "lower"];
  data.setBlockIds(data.rootIds);
  const editor = new BlockEditorController({ adapter: data });
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  root.dataset.blockRootList = "";
  data.rootIds.forEach((id, index) => {
    data.setNode(id);
    const shell = document.createElement("div");
    shell.className = "rivto-block";
    shell.dataset.blockId = id;
    root.append(shell);
    jest.spyOn(shell, "getBoundingClientRect").mockReturnValue({
      left: 100,
      right: 400,
      width: 300,
      height: 28,
      top: index * 32,
      bottom: index * 32 + 28,
    } as DOMRect);
  });
  document.body.append(root);
  editor.attach(root);
  try {
    const targets = new BlockOutlineDropTargets(editor, null);
    const excluded = new Set(moving);
    const above = targets.resolve(100, 30, excluded, root);
    const below = targets.resolve(100, (count + 1) * 32 - 2, excluded, root);
    expect(above?.destination).toEqual({
      kind: "between",
      parentId: null,
      previousId: "upper",
      nextId: "lower",
    });
    expect(below?.destination).toEqual(above?.destination);
    expect(above?.indicator?.top).toBe(27);
    expect(below?.indicator?.top).toBe((count + 1) * 32 - 1);
  } finally {
    editor.destroy();
    root.remove();
  }
});
