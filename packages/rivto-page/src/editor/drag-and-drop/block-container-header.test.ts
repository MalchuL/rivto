import { BlockEditorController } from "../block-editor-controller";
import { TestBlockEditorAdapter } from "../../test-utils/test-block-editor-adapter";
import { BlockOutlineDropTargets } from "./block-outline-drop-targets";

/** Header and child bounds deliberately separated from the container's bottom. */
class HeaderFixture {
  readonly data = new TestBlockEditorAdapter();
  readonly editor = new BlockEditorController({ adapter: this.data });
  readonly root = document.createElement("div");
  readonly targets = new BlockOutlineDropTargets(this.editor, null);
  readonly header: HTMLElement;

  /**
   * Mounts an unknown host layout with a tall body and one receiving child.
   *
   * @param childTop - Child insertion edge in viewport pixels, independent of the header.
   */
  constructor(childTop: number) {
    this.data.rootIds = ["container"];
    this.data.setBlockIds(this.data.rootIds);
    this.data.setNode("container", { type: "custom-host-layout", childIds: ["child"] });
    this.data.setNode("child");
    this.root.dataset.rivtoBlockEditor = "true";
    this.root.innerHTML =
      '<div class="rivto-block" data-block-id="container"><section><div class="rivto-block-row">Title</div></section><div class="rivto-block-children" data-block-drop-axis="vertical"><div class="rivto-block" data-block-id="child"><div class="rivto-block-row"></div></div></div></div>';
    document.body.append(this.root);
    this.editor.attach(this.root);
    this.header = this.root.querySelector<HTMLElement>(".rivto-block-row")!;
    this.measure(this.root.firstElementChild!, 100, 600);
    this.measure(this.header, 100, 150);
    this.measure(this.root.querySelector(".rivto-block-children")!, 160, 590);
    this.measure(this.root.querySelector('[data-block-id="child"]')!, childTop, childTop + 40);
    this.measure(
      this.root.querySelector('[data-block-id="child"] > div')!,
      childTop,
      childTop + 40,
    );
  }

  /**
   * Releases the occurrence and all fixture nodes.
   *
   * @returns No mounted test editor remains.
   */
  destroy(): void {
    this.editor.destroy();
    this.root.remove();
  }

  /**
   * Supplies a deterministic layout rectangle to the browser-free resolver test.
   *
   * @param element - Region to measure.
   * @param top - Top viewport coordinate.
   * @param bottom - Bottom viewport coordinate.
   * @returns Subsequent measurements use the supplied rectangle.
   */
  private measure(element: Element, top: number, bottom: number): void {
    jest.spyOn(element, "getBoundingClientRect").mockReturnValue({
      left: 100,
      right: 400,
      width: 300,
      top,
      bottom,
      height: bottom - top,
    } as DOMRect);
  }
}

it.each([180, 240])(
  "chooses the nearest insertion to a header when child padding moves to %s",
  (childTop) => {
    const fixture = new HeaderFixture(childTop);
    try {
      const target = fixture.targets.resolve(130, 145, new Set(), fixture.header);
      expect(target?.destination).toEqual(
        childTop === 180
          ? { kind: "between", parentId: "container", previousId: null, nextId: "child" }
          : { kind: "between", parentId: null, previousId: null, nextId: "container" },
      );
      expect(target?.indicator?.top).toBe(childTop === 180 ? 179 : 99);
    } finally {
      fixture.destroy();
    }
  },
);

it("filters forbidden candidates before ranking and reads permission again on the next resolution", () => {
  const fixture = new HeaderFixture(180);
  try {
    const accepts = jest.fn((destination) => destination.parentId === null);
    const target = fixture.targets.resolve(130, 145, new Set(), fixture.header, false, accepts);
    expect(target?.destination).toEqual({
      kind: "between",
      parentId: null,
      previousId: null,
      nextId: "container",
    });
    accepts.mockReturnValue(false);
    expect(
      fixture.targets.resolve(130, 145, new Set(), fixture.header, false, accepts),
    ).toBeUndefined();
  } finally {
    fixture.destroy();
  }
});

it("descends the nearest structural child when only its content list accepts the source", () => {
  const fixture = new HeaderFixture(180);
  try {
    fixture.data.setNode("child", { childIds: ["nested"] });
    fixture.data.setNode("nested");
    const child = fixture.root.querySelector('[data-block-id="child"]')!;
    child.innerHTML =
      '<div class="rivto-block-row"></div><div class="rivto-block-children" data-block-drop-axis="vertical"><div class="rivto-block" data-block-id="nested"></div></div>';
    const nested = child.querySelector<HTMLElement>('[data-block-id="nested"]')!;
    jest.spyOn(nested, "getBoundingClientRect").mockReturnValue({
      left: 100,
      right: 400,
      top: 210,
      bottom: 250,
      width: 300,
      height: 40,
    } as DOMRect);
    const target = fixture.targets.resolve(
      130,
      145,
      new Set(),
      fixture.header,
      false,
      (destination) => destination.parentId === "child",
    );
    expect(target?.destination).toEqual({
      kind: "between",
      parentId: "child",
      previousId: null,
      nextId: "nested",
    });
    expect(target?.indicator?.top).toBe(209);
  } finally {
    fixture.destroy();
  }
});

it("does not propose hidden children or a source's own subtree", () => {
  const fixture = new HeaderFixture(180);
  try {
    fixture.root.querySelector<HTMLElement>(".rivto-block-children")!.hidden = true;
    const target = fixture.targets.resolve(130, 145, new Set(), fixture.header);
    expect(target?.destination.parentId).toBeNull();
    expect(
      fixture.targets.resolve(130, 145, new Set(["container"]), fixture.header),
    ).toBeUndefined();
  } finally {
    fixture.destroy();
  }
});

it("preserves the container rim when a neutral wrapper receives the native hit", () => {
  const fixture = new HeaderFixture(560);
  try {
    const shell = fixture.root.firstElementChild!;
    const wrapper = document.createElement("div");
    fixture.root.dataset.blockRootList = "true";
    shell.replaceWith(wrapper);
    wrapper.append(shell);
    jest.spyOn(wrapper, "getBoundingClientRect").mockReturnValue(shell.getBoundingClientRect());
    const target = fixture.targets.resolve(102, 599, new Set(), wrapper, false, () => true);
    expect(target?.destination).toEqual({
      kind: "between",
      parentId: null,
      previousId: "container",
      nextId: null,
    });
    expect(target?.indicator?.top).toBe(599);
  } finally {
    fixture.destroy();
  }
});
