import { BlockRowHover } from "./block-row-hover";

/** Owns a DOM-only fixture; no document adapter or React subscription is involved. */
class HoverFixture {
  readonly root = document.createElement("div");
  readonly hover: BlockRowHover;

  /**
   * Mounts rows with independent occurrence ownership before attaching observers.
   *
   * @param count - Mounted root count used for geometry-work comparisons.
   */
  constructor(count = 1) {
    this.root.dataset.rivtoBlockEditor = "true";
    this.root.dataset.blockRootList = "";
    for (let index = 0; index < count; index++) {
      const shell = document.createElement("div");
      shell.className = "rivto-block";
      shell.dataset.blockId = `block-${index}`;
      shell.innerHTML = '<div class="rivto-block-row"><button></button></div>';
      for (const item of [shell, shell.firstElementChild!]) {
        jest.spyOn(item, "getBoundingClientRect").mockReturnValue({
          left: 40,
          right: 240,
          top: index * 40,
          bottom: index * 40 + 24,
          width: 200,
          height: 24,
        } as DOMRect);
      }
      this.root.append(shell);
    }
    document.body.append(this.root);
    this.hover = new BlockRowHover(this.root);
  }

  /**
   * Dispatches real bubbling pointer-shaped input to an existing native target.
   *
   * @param target - Native target in this fixture, including indentation whitespace.
   * @param y - Viewport vertical coordinate in CSS pixels.
   * @param buttons - Pressed mouse buttons; defaults to none.
   * @returns Event observers have updated row feedback synchronously.
   */
  move(target: Element, y = 12, buttons = 0): void {
    target.dispatchEvent(
      new MouseEvent("pointermove", { bubbles: true, clientX: 12, clientY: y, buttons }),
    );
  }

  /**
   * Releases the fixture's observers and mounted DOM.
   *
   * @returns The root and all feedback are removed; repeated release is harmless.
   */
  destroy(): void {
    this.hover.destroy();
    this.root.remove();
  }
}

it.each([4, 2000])("bounds whitespace rectangle reads among %i mounted roots", (count) => {
  const fixture = new HoverFixture(count);
  try {
    fixture.move(fixture.root, (count - 2) * 40 + 12);
    expect(
      fixture.root.querySelector("[data-block-row-hover]")?.parentElement?.dataset.blockId,
    ).toBe(`block-${count - 2}`);
    const reads = Array.from(fixture.root.children).reduce(
      (total, child) => total + (child.getBoundingClientRect as jest.Mock).mock.calls.length,
      0,
    );
    expect(reads).toBeLessThanOrEqual(Math.ceil(Math.log2(count)) + 2);
  } finally {
    fixture.destroy();
  }
});

it("clears on exit, pressed-pointer input and destruction without removing a replacement owner's feedback", () => {
  const fixture = new HoverFixture();
  const row = fixture.root.querySelector<HTMLElement>(".rivto-block-row")!;
  try {
    fixture.move(row);
    expect(row.hasAttribute("data-block-row-hover")).toBe(true);
    row.dispatchEvent(new MouseEvent("pointerleave"));
    expect(row.hasAttribute("data-block-row-hover")).toBe(true);
    fixture.move(row, 12, 1);
    expect(row.hasAttribute("data-block-row-hover")).toBe(false);
    fixture.move(row);
    fixture.root.dispatchEvent(new MouseEvent("pointerleave"));
    expect(row.hasAttribute("data-block-row-hover")).toBe(false);
    fixture.move(row);
    fixture.hover.destroy();
    expect(row.hasAttribute("data-block-row-hover")).toBe(false);
    const next = new BlockRowHover(fixture.root);
    fixture.move(row);
    fixture.hover.destroy();
    expect(row.hasAttribute("data-block-row-hover")).toBe(true);
    next.destroy();
  } finally {
    fixture.destroy();
  }
});

it("does not borrow rows from a nested editor occurrence", () => {
  const fixture = new HoverFixture();
  const foreign = document.createElement("div");
  foreign.dataset.rivtoBlockEditor = "true";
  foreign.innerHTML = '<div class="rivto-block-row"></div>';
  fixture.root.append(foreign);
  try {
    fixture.move(fixture.root.querySelector(".rivto-block-row")!);
    fixture.move(foreign.firstElementChild!);
    expect(fixture.root.querySelector("[data-block-row-hover]")).toBeNull();
  } finally {
    fixture.destroy();
  }
});

it("ignores display-contents gap wrappers when resolving nested outline whitespace", () => {
  const fixture = new HoverFixture(4);
  const shell = fixture.root.firstElementChild!;
  const list = document.createElement("div");
  list.className = "rivto-block-children rivto-block-outline";
  jest.spyOn(list, "getBoundingClientRect").mockReturnValue({ top: 40, bottom: 144 } as DOMRect);
  while (fixture.root.children.length > 1) {
    list.append(fixture.root.children[1]!);
    const gap = document.createElement("span");
    gap.className = "rivto-block-list-gap";
    list.append(gap);
  }
  shell.append(list);
  try {
    fixture.move(list, 52);
    expect(list.querySelector("[data-block-row-hover]")?.parentElement?.dataset.blockId).toBe(
      "block-1",
    );
  } finally {
    fixture.destroy();
  }
});

it("keeps the handle hit target through pointerdown until the gesture moves", () => {
  const fixture = new HoverFixture();
  const row = fixture.root.querySelector<HTMLElement>(".rivto-block-row")!;
  try {
    fixture.move(row);
    row
      .querySelector("button")!
      .dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, buttons: 2 }));
    expect(row.hasAttribute("data-block-row-hover")).toBe(true);
    fixture.move(row, 12, 2);
    expect(row.hasAttribute("data-block-row-hover")).toBe(false);
  } finally {
    fixture.destroy();
  }
});

it("resolves an embedded root's whitespace without revealing the enclosing editor's row", () => {
  const outer = new HoverFixture();
  const inner = new HoverFixture();
  outer.root.firstElementChild!.append(inner.root);
  try {
    inner.move(inner.root);
    expect(inner.root.querySelector("[data-block-row-hover]")).not.toBeNull();
    expect(
      outer.root.firstElementChild!.querySelector(":scope > [data-block-row-hover]"),
    ).toBeNull();
  } finally {
    inner.destroy();
    outer.destroy();
  }
});

it("reconciles a stationary pointer after scroll and cancels a queued frame on detach", () => {
  jest.useFakeTimers();
  const fixture = new HoverFixture();
  const row = fixture.root.querySelector<HTMLElement>(".rivto-block-row")!;
  const hit = jest.fn(() => row as Element | null);
  Object.defineProperty(document, "elementFromPoint", { configurable: true, value: hit });
  try {
    fixture.move(row);
    hit.mockReturnValue(null);
    document.dispatchEvent(new Event("scroll"));
    document.dispatchEvent(new Event("scroll"));
    jest.advanceTimersByTime(20);
    expect(hit).toHaveBeenCalledTimes(1);
    expect(row.hasAttribute("data-block-row-hover")).toBe(false);
    fixture.move(row);
    document.dispatchEvent(new Event("scroll"));
    fixture.destroy();
    jest.advanceTimersByTime(20);
    expect(hit).toHaveBeenCalledTimes(1);
  } finally {
    fixture.destroy();
    jest.useRealTimers();
  }
});

it("rolls back already-attached observers when native attachment fails", () => {
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  root.innerHTML = '<div class="rivto-block-row"></div>';
  const attach = root.addEventListener.bind(root);
  const registration = jest.spyOn(root, "addEventListener");
  registration.mockImplementationOnce(attach).mockImplementationOnce(() => {
    throw new Error("Cannot attach hover listener");
  });
  document.body.append(root);
  try {
    expect(() => new BlockRowHover(root)).toThrow("Cannot attach hover listener");
    root.firstElementChild!.dispatchEvent(new MouseEvent("pointermove", { bubbles: true }));
    expect(root.querySelector("[data-block-row-hover]")).toBeNull();
  } finally {
    registration.mockRestore();
    root.remove();
  }
});

it("resolves native item chrome without borrowing its enclosing block's row", () => {
  const fixture = new HoverFixture(2);
  const parent = fixture.root.children[0]!;
  const child = fixture.root.children[1]!;
  const item = document.createElement("div");
  item.dataset.blockItemId = "block-1";
  item.innerHTML = '<button aria-label="Resize"></button>';
  item.append(child);
  parent.append(item);
  jest.spyOn(item, "getBoundingClientRect").mockReturnValue({
    left: 0,
    right: 264,
    top: 32,
    bottom: 80,
    width: 264,
    height: 48,
  } as DOMRect);
  try {
    fixture.move(item, 76);
    expect(child.firstElementChild!.hasAttribute("data-block-row-hover")).toBe(true);
    expect(parent.firstElementChild!.hasAttribute("data-block-row-hover")).toBe(false);
    fixture.move(item.firstElementChild!, 76);
    expect(child.firstElementChild!.hasAttribute("data-block-row-hover")).toBe(true);
    fixture.move(parent.firstElementChild!, 12);
    expect(child.firstElementChild!.hasAttribute("data-block-row-hover")).toBe(false);
  } finally {
    fixture.destroy();
  }
});

it("keeps the hovered handle target across window activation without pointer movement", () => {
  const fixture = new HoverFixture();
  const row = fixture.root.querySelector(".rivto-block-row")!;
  try {
    fixture.move(row);
    window.dispatchEvent(new Event("blur"));
    window.dispatchEvent(new Event("focus"));
    expect(row.hasAttribute("data-block-row-hover")).toBe(true);
    fixture.root.dispatchEvent(new MouseEvent("pointerleave"));
    expect(row.hasAttribute("data-block-row-hover")).toBe(false);
  } finally {
    fixture.destroy();
  }
});
