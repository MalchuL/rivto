import { BlockEditorController } from "../block-editor-controller";
import { TestBlockEditorAdapter } from "../../test-utils/test-block-editor-adapter";
import type { BlockDropRegion, BlockDropTargetRegistration } from "./types";

let adapter: TestBlockEditorAdapter;
let editor: BlockEditorController;
let root: HTMLDivElement;
let host: HTMLDivElement;
let item: HTMLDivElement;
const destination = { kind: "between", parentId: "parent", previousId: "a", nextId: "b" } as const;

/**
 * Installs deterministic physical geometry while leaving the DOM and styles unchanged.
 *
 * @param element - Existing anchor to measure.
 * @param x - Viewport left coordinate.
 * @param y - Viewport top coordinate.
 * @param width - Viewport width, default 200.
 * @param height - Viewport height, default 100.
 * @returns Spy used to assert bounded reads.
 */
function rect(element: HTMLElement, x: number, y: number, width = 200, height = 100) {
  return jest.spyOn(element, "getBoundingClientRect").mockReturnValue({
    x,
    y,
    width,
    height,
    left: x,
    top: y,
    right: x + width,
    bottom: y + height,
    toJSON: () => ({}),
  });
}

/**
 * Registers one existing item with inset edges representing its real sibling boundaries.
 *
 * @param element - Mounted item.
 * @param regions - Explicit geometry, default one trailing sibling edge.
 * @returns Registration data shared by the layout's ordered snapshot.
 */
function register(
  element: HTMLElement,
  regions: readonly BlockDropRegion[] = [{ kind: "edge", side: "block-end", destination }],
): BlockDropTargetRegistration {
  const entry = { element, getRegions: () => regions };
  editor.dropTargets.register(entry);
  return entry;
}

beforeEach(() => {
  adapter = new TestBlockEditorAdapter();
  adapter.setNode("parent", { childIds: ["a", "b"] });
  editor = new BlockEditorController({ adapter });
  root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  host = document.createElement("div");
  item = document.createElement("div");
  item.dataset.blockId = "a";
  host.append(item);
  root.append(host);
  document.body.append(root);
  editor.attach(root);
  rect(item, 0, 0);
  rect(host, 0, 0, 400, 400);
});
afterEach(() => {
  editor.destroy();
  root.remove();
});

it("leaves content neutral and uses configurable edges without changing DOM or styles", () => {
  const count = root.querySelectorAll("*").length;
  register(item, [{ kind: "edge", side: "block-end", size: 12, destination }]);
  expect(editor.dropTargets.resolve(10, 50, undefined, item)).toBeUndefined();
  expect(editor.dropTargets.resolve(10, 87, undefined, item)).toBeUndefined();
  expect(editor.dropTargets.resolve(10, 88, undefined, item)?.destination).toEqual(destination);
  expect(editor.dropTargets.resolve(10, 99, undefined, item)?.indicator?.top).toBe(99);
  expect(root.querySelectorAll("*")).toHaveLength(count);
  expect(item.getAttribute("style")).toBeNull();
});

it("never falls back after rejecting the physical winner or its stale canonical neighbors", () => {
  register(item);
  register(host, [{ kind: "inside", destination: { kind: "inside", parentId: "parent" } }]);
  const accepts = jest.fn(() => false);
  expect(editor.dropTargets.resolve(10, 99, undefined, item, accepts)).toBeUndefined();
  expect(accepts).toHaveBeenCalledTimes(1);
  adapter.setNode("parent", { childIds: ["b", "a"] });
  expect(editor.dropTargets.resolve(10, 99, undefined, item)).toBeUndefined();
});

it("allows controls in background regions while excluding marked areas and nested editors", () => {
  register(host, [
    { kind: "inside", coverage: "background", destination: { kind: "inside", parentId: "parent" } },
  ]);
  expect(editor.dropTargets.resolve(10, 50, undefined, item)).toBeUndefined();
  expect(editor.dropTargets.resolve(300, 200, undefined, host)?.destination.kind).toBe("inside");
  const button = document.createElement("button");
  host.append(button);
  expect(editor.dropTargets.resolve(300, 200, undefined, button)?.destination.kind).toBe("inside");
  button.setAttribute("data-drop-inert", "");
  expect(editor.dropTargets.resolve(300, 200, undefined, button)).toBeUndefined();
  item.dataset.rivtoBlockEditor = "true";
  expect(editor.dropTargets.resolve(10, 50, undefined, item)).toBeUndefined();
});

it("keeps physical feedback fixed when moving siblings are excluded", () => {
  adapter.setNode("parent", { childIds: ["a", "moving", "b"] });
  register(item, [
    { kind: "edge", side: "block-end", destination: { ...destination, nextId: "moving" } },
  ]);
  const target = editor.dropTargets.resolve(10, 99, new Set(["moving"]), item);
  expect(target?.destination).toEqual(destination);
  expect(target?.indicator?.top).toBe(99);
  expect(editor.dropTargets.resolve(10, 99, new Set(["parent"]), item)).toBeUndefined();
});

it("partitions terminal depth explicitly and honors RTL", () => {
  item.style.setProperty("--rivto-block-indent", "20px");
  item.style.direction = "rtl";
  register(item, [
    {
      kind: "edge",
      side: "block-end",
      destination,
      depth: { ancestors: 0, destinations: [destination, { kind: "inside", parentId: "a" }] },
    },
  ]);
  adapter.setNode("a");
  expect(editor.dropTargets.resolve(195, 99, undefined, item)?.destination).toEqual(destination);
  expect(editor.dropTargets.resolve(170, 99, undefined, item)?.destination).toEqual({
    kind: "inside",
    parentId: "a",
  });
});

it("scales local target thickness with an existing transformed anchor", () => {
  Object.defineProperty(item, "offsetWidth", { value: 100 });
  Object.defineProperty(item, "offsetHeight", { value: 50 });
  register(item);
  expect(editor.dropTargets.resolve(10, 83, undefined, item)).toBeUndefined();
  expect(editor.dropTargets.resolve(10, 85, undefined, item)?.destination).toEqual(destination);
});

it("resolves real gaps, preserves hidden canonical neighbors, and can disable gap insertion", () => {
  adapter.setNode("parent", { childIds: ["a", "hidden", "b"] });
  const next = document.createElement("div");
  host.append(next);
  rect(next, 0, 120);
  const previousEntry = register(item, [
    { kind: "edge", side: "block-end", destination: { ...destination, nextId: "hidden" } },
  ]);
  const nextEntry = register(next, [
    { kind: "edge", side: "block-start", destination: { ...destination, previousId: "hidden" } },
  ]);
  const stop = editor.dropTargets.registerLayout({
    element: host,
    axis: "vertical",
    gaps: true,
    getItems: () => [previousEntry, nextEntry],
  });
  expect(editor.dropTargets.resolve(10, 105, undefined, host)?.destination).toEqual({
    ...destination,
    nextId: "hidden",
  });
  expect(editor.dropTargets.resolve(10, 115, undefined, host)?.destination).toEqual({
    ...destination,
    previousId: "hidden",
  });
  stop();
  editor.dropTargets.registerLayout({
    element: host,
    axis: "vertical",
    gaps: false,
    getItems: () => [previousEntry, nextEntry],
  });
  expect(editor.dropTargets.resolve(10, 110, undefined, host)).toBeUndefined();
});

it.each([5, 2000])("reads logarithmically many live rectangles among %i anchors", (count) => {
  adapter.setNode("parent", { childIds: Array.from({ length: count }, (_, i) => `id-${i}`) });
  const reads: jest.SpyInstance[] = [];
  const items = Array.from({ length: count }, (_, i) => {
    const element = document.createElement("div");
    host.append(element);
    reads.push(rect(element, 0, i * 20, 200, 10));
    return register(element, [
      {
        kind: "edge",
        side: "block-start",
        destination: {
          kind: "between",
          parentId: "parent",
          previousId: i ? `id-${i - 1}` : null,
          nextId: `id-${i}`,
        },
      },
      {
        kind: "edge",
        side: "block-end",
        destination: {
          kind: "between",
          parentId: "parent",
          previousId: `id-${i}`,
          nextId: i + 1 < count ? `id-${i + 1}` : null,
        },
      },
    ]);
  });
  editor.dropTargets.registerLayout({
    element: host,
    axis: "vertical",
    gaps: true,
    getItems: () => items,
  });
  expect(editor.dropTargets.resolve(10, 35, undefined, host)?.destination).toEqual({
    kind: "between",
    parentId: "parent",
    previousId: "id-1",
    nextId: "id-2",
  });
  expect(reads.reduce((total, spy) => total + spy.mock.calls.length, 0)).toBeLessThanOrEqual(
    Math.ceil(Math.log2(count)) + 2,
  );
});

it("stale disposers do not remove replacement layouts and detached anchors cannot resolve", () => {
  const old = editor.dropTargets.registerLayout({
    element: host,
    axis: "vertical",
    gaps: false,
    getItems: () => [],
  });
  const entry = register(item);
  editor.dropTargets.registerLayout({
    element: host,
    axis: "vertical",
    gaps: true,
    getItems: () => [entry],
  });
  old();
  old();
  expect(editor.dropTargets.resolve(10, 99, undefined, item)).toBeDefined();
  item.remove();
  Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => null });
  expect(editor.dropTargets.resolve(10, 99, undefined, item)).toBeUndefined();
  Reflect.deleteProperty(document, "elementFromPoint");
});

it("uses block edges at corners, explicit priority within an anchor, and zero to disable edges", () => {
  register(item, [
    { kind: "inside", destination: { kind: "inside", parentId: "parent" } },
    { kind: "edge", side: "inline-end", destination },
    { kind: "edge", side: "block-end", destination },
  ]);
  expect(editor.dropTargets.resolve(199, 99, undefined, item)?.indicator?.height).toBe(2);
  const release = editor.dropTargets.register({
    element: item,
    priority: 1,
    getRegions: () => [{ kind: "inside", destination: { kind: "inside", parentId: "parent" } }],
  });
  expect(editor.dropTargets.resolve(199, 99, undefined, item)?.destination.kind).toBe("inside");
  release();
  item.style.setProperty("--rivto-drop-target-size", "0");
  expect(editor.dropTargets.resolve(199, 99, undefined, item)?.destination.kind).toBe("inside");
});

it("keeps same-row gaps distinct from inter-row grid background and virtual holes", () => {
  const next = document.createElement("div");
  host.append(next);
  rect(next, 220, 0);
  const previous = register(item, [{ kind: "edge", side: "inline-end", destination }]);
  const following = register(next, [{ kind: "edge", side: "inline-start", destination }]);
  editor.dropTargets.registerLayout({
    element: host,
    axis: "grid",
    gaps: true,
    getItems: () => [previous, following],
  });
  expect(editor.dropTargets.resolve(210, 50, undefined, host)?.region?.kind).toBe("gap");
  expect(editor.dropTargets.resolve(210, 110, undefined, host)).toBeUndefined();
  item.dataset.index = "1";
  next.dataset.index = "3";
  editor.dropTargets.registerLayout({
    element: host,
    axis: "horizontal",
    gaps: true,
    virtual: true,
    getItems: () => [previous, following],
  });
  expect(editor.dropTargets.resolve(210, 50, undefined, host)).toBeUndefined();
  next.dataset.index = "2";
  expect(editor.dropTargets.resolve(210, 50, undefined, host)?.region?.kind).toBe("gap");
});

it("keeps declared placement edges ahead of content inside within the nearest layout", () => {
  adapter.setNode("a", { childIds: [] });
  rect(host, 0, 0);
  register(item, [{ kind: "inside", destination: { kind: "inside", parentId: "a" } }]);
  register(host);
  expect(editor.dropTargets.resolve(100, 50, undefined, item)?.destination).toEqual({
    kind: "inside",
    parentId: "a",
  });
  expect(editor.dropTargets.resolve(100, 99, undefined, item)?.destination).toEqual(destination);
  editor.dropTargets.registerLayout({
    element: item,
    axis: "vertical",
    gaps: false,
    getItems: () => [],
  });
  expect(editor.dropTargets.resolve(100, 99, undefined, item)?.destination).toEqual({
    kind: "inside",
    parentId: "a",
  });
});

it.each(["button", "input", "select", "textarea", "div"])(
  "accepts %s controls in a nested target while honoring its own exclusion",
  (tag) => {
    adapter.setNode("a", { childIds: [] });
    const control = document.createElement(tag);
    control.setAttribute("data-editor-control", "");
    control.setAttribute("role", "separator");
    item.append(control);
    register(item, [{ kind: "inside", destination: { kind: "inside", parentId: "a" } }]);
    register(host, [{ kind: "inside", destination: { kind: "inside", parentId: "parent" } }]);
    expect(editor.dropTargets.resolve(50, 50, undefined, control)?.destination.parentId).toBe("a");
    host.setAttribute("data-drop-inert", "");
    expect(editor.dropTargets.resolve(50, 50, undefined, control)?.destination.parentId).toBe("a");
    item.setAttribute("data-drop-inert", "");
    expect(editor.dropTargets.resolve(50, 50, undefined, control)).toBeUndefined();
    item.removeAttribute("data-drop-inert");
    expect(editor.dropTargets.resolve(50, 50, undefined, control)?.destination.parentId).toBe("a");
  },
);

it.each([1, 3, 8])("resolves alternating drop/exclude declarations across %i levels", (depth) => {
  adapter.setNode("a", { childIds: [] });
  register(host, [{ kind: "inside", destination: { kind: "inside", parentId: "parent" } }]);
  let parent = host;
  let innermost = item;
  let release: () => void = () => {};
  for (let level = 0; level < depth; level += 1) {
    const excluded = document.createElement("div");
    excluded.setAttribute("data-drop-inert", "");
    const neutral = document.createElement("div");
    innermost = document.createElement("div");
    parent.append(excluded);
    excluded.append(neutral);
    neutral.append(innermost);
    rect(innermost, 0, 0);
    release = editor.dropTargets.register({
      element: innermost,
      getRegions: () => [{ kind: "inside", destination: { kind: "inside", parentId: "a" } }],
    });
    expect(editor.dropTargets.resolve(50, 50, undefined, neutral)).toBeUndefined();
    expect(editor.dropTargets.resolve(50, 50, undefined, innermost)?.element).toBe(innermost);
    parent = innermost;
  }
  expect(editor.dropTargets.resolve(50, 50, undefined, innermost, () => false)).toBeUndefined();
  innermost.setAttribute("data-drop-inert", "");
  expect(editor.dropTargets.resolve(50, 50, undefined, innermost)).toBeUndefined();
  innermost.removeAttribute("data-drop-inert");
  expect(editor.dropTargets.resolve(50, 50, undefined, innermost)?.element).toBe(innermost);
  release();
  expect(editor.dropTargets.resolve(50, 50, undefined, innermost)).toBeUndefined();
});

it.each(["merged", "separate"] as const)(
  "covers fractional gaps and both edges in %s mode",
  (boundaries) => {
    const next = document.createElement("div");
    next.dataset.blockId = "b";
    host.append(next);
    rect(next, 0, 104);
    const previous = register(item);
    const following = register(next, [{ kind: "edge", side: "block-start", destination }]);
    editor.dropTargets.registerLayout({
      element: host,
      axis: "vertical",
      gaps: true,
      boundaries,
      getItems: () => [previous, following],
    });
    for (let y = 98; y <= 106; y += 0.25) {
      // Chromium may report the following anchor before its precise viewport top.
      let hit: Element = host;
      if (y < 100) {
        hit = item;
      } else if (y >= 103.25) {
        hit = next;
      }
      const target = editor.dropTargets.resolve(12, y, undefined, hit);
      expect(target?.destination).toEqual(destination);
      let top = 101;
      if (boundaries === "separate") {
        top = y <= 102 ? 99 : 103;
      }
      expect(target?.indicator?.top).toBe(top);
    }
  },
);

it.each([false, true])("merges horizontal sibling boundaries with RTL=%s", (rtl) => {
  host.style.direction = rtl ? "rtl" : "ltr";
  item.style.direction = host.style.direction;
  rect(item, rtl ? 204 : 0, 0);
  const next = document.createElement("div");
  next.style.direction = host.style.direction;
  host.append(next);
  rect(next, rtl ? 0 : 204, 0);
  const previous = register(item, [{ kind: "edge", side: "inline-end", destination }]);
  const following = register(next, [{ kind: "edge", side: "inline-start", destination }]);
  editor.dropTargets.registerLayout({
    element: host,
    axis: "horizontal",
    gaps: true,
    getItems: () => [previous, following],
  });
  for (let x = 198; x <= 206; x += 0.25) {
    let hit: Element = host;
    if (x < 200) {
      hit = rtl ? next : item;
    }
    if (x > 204) {
      hit = rtl ? item : next;
    }
    const target = editor.dropTargets.resolve(x, 20, undefined, hit);
    expect(target?.destination).toEqual(destination);
    expect(target?.indicator?.left).toBe(201);
  }
});

it("does not search sibling geometry for a contained inside target", () => {
  const entry = register(item, [
    { kind: "inside", destination: { kind: "inside", parentId: "parent" } },
  ]);
  const getItems = jest.fn(() => [entry]);
  editor.dropTargets.registerLayout({ element: host, axis: "vertical", gaps: true, getItems });
  expect(editor.dropTargets.resolve(12, 50, undefined, item)?.destination.kind).toBe("inside");
  expect(getItems).not.toHaveBeenCalled();
});

it("keeps a shared gap ahead of a custom inside wrapper spanning both anchors", () => {
  const wrapper = document.createElement("div");
  host.append(wrapper);
  wrapper.append(item);
  rect(wrapper, 0, 0, 200, 220);
  register(wrapper, [{ kind: "inside", destination: { kind: "inside", parentId: "parent" } }]);
  const next = document.createElement("div");
  wrapper.append(next);
  rect(next, 0, 120);
  const previous = register(item);
  const following = register(next, [{ kind: "edge", side: "block-start", destination }]);
  editor.dropTargets.registerLayout({
    element: host,
    axis: "vertical",
    gaps: true,
    getItems: () => [previous, following],
  });
  expect(editor.dropTargets.resolve(12, 110, undefined, wrapper)?.destination).toEqual(destination);
});

it("retains single edges across nonconsecutive virtual roots", () => {
  item.dataset.index = "1";
  const next = document.createElement("div");
  next.dataset.index = "10";
  host.append(next);
  rect(next, 0, 120);
  const previous = register(item);
  const following = register(next, [{ kind: "edge", side: "block-start", destination }]);
  editor.dropTargets.registerLayout({
    element: host,
    axis: "vertical",
    gaps: true,
    virtual: true,
    getItems: () => [previous, following],
  });
  expect(editor.dropTargets.resolve(12, 99, undefined, item)?.indicator?.top).toBe(99);
  expect(editor.dropTargets.resolve(12, 121, undefined, next)?.indicator?.top).toBe(119);
  expect(editor.dropTargets.resolve(12, 110, undefined, host)).toBeUndefined();
});

it.each(["merged", "separate"] as const)(
  "covers a zero-gap tile seam with a rounded native hit in %s mode",
  (boundaries) => {
    const next = document.createElement("div");
    next.dataset.blockId = "b";
    host.append(next);
    rect(next, 200, 0);
    const previous = register(item, [{ kind: "edge", side: "inline-end", destination }]);
    const following = register(next, [{ kind: "edge", side: "inline-start", destination }]);
    editor.dropTargets.registerLayout({
      element: host,
      axis: "grid",
      gaps: true,
      boundaries,
      getItems: () => [previous, following],
    });
    for (let x = 199; x <= 201; x += 0.25) {
      const hit = x >= 199.25 ? next : item;
      const target = editor.dropTargets.resolve(x, 50, undefined, hit);
      expect(target?.destination).toEqual(destination);
      expect(target?.indicator?.left).toBe(199);
    }
  },
);

it("selects one outline depth across a merged gap and both inset edges", () => {
  adapter.setNode("a");
  const next = document.createElement("div");
  next.dataset.blockId = "b";
  host.append(next);
  rect(next, 0, 104);
  const inside = { kind: "inside", parentId: "a" } as const;
  const previous = register(item, [
    {
      kind: "edge",
      side: "block-end",
      destination,
      depth: { ancestors: 0, destinations: [destination, inside] },
    },
  ]);
  const following = register(next, [{ kind: "edge", side: "block-start", destination }]);
  editor.dropTargets.registerLayout({
    element: host,
    axis: "vertical",
    gaps: true,
    getItems: () => [previous, following],
  });
  for (const x of [12, 40]) {
    for (let y = 98; y <= 106; y += 0.25) {
      let hit: Element = host;
      if (y < 100) {
        hit = item;
      }
      if (y >= 103.25) {
        hit = next;
      }
      const target = editor.dropTargets.resolve(x, y, undefined, hit);
      expect(target?.destination).toEqual(x < 28 ? destination : inside);
      expect(target?.indicator?.top).toBe(101);
      expect(target?.indicator?.left).toBe(x < 28 ? 0 : 28);
    }
  }
});

it("keeps one full-height boundary beside unequal neighboring tiles", () => {
  const next = document.createElement("div");
  host.append(next);
  rect(next, 200, 0, 200, 240);
  const previous = register(item, [{ kind: "edge", side: "inline-end", destination }]);
  const following = register(next, [{ kind: "edge", side: "inline-start", destination }]);
  editor.dropTargets.registerLayout({
    element: host,
    axis: "grid",
    gaps: true,
    getItems: () => [previous, following],
  });
  for (const y of [50, 150]) {
    expect(editor.dropTargets.resolve(202, y, undefined, next)?.indicator).toEqual({
      left: 199,
      top: 0,
      width: 2,
      height: 240,
    });
  }
});

it.each(["merged", "separate"] as const)(
  "covers wrapped row seams in %s mode without diagonal gaps",
  (boundaries) => {
    const next = document.createElement("div");
    next.dataset.blockId = "b";
    host.append(next);
    rect(next, 0, 100, 300, 100);
    const previous = register(item);
    const following = register(next, [{ kind: "edge", side: "block-start", destination }]);
    editor.dropTargets.registerLayout({
      element: host,
      axis: "grid",
      gaps: true,
      boundaries,
      getItems: () => [previous, following],
    });
    for (let y = 99; y <= 101; y += 0.25) {
      expect(editor.dropTargets.resolve(40, y, undefined, next)?.destination).toEqual(destination);
    }
    rect(next, 220, 120);
    expect(editor.dropTargets.resolve(210, 110, undefined, host)).toBeUndefined();
  },
);

it("keeps fractional background below a short tile active despite a rounded neighbor hit", () => {
  const next = document.createElement("div");
  next.dataset.blockItemId = "b";
  host.append(next);
  rect(next, 200, 0, 200, 240);
  register(host, [
    { kind: "inside", coverage: "background", destination: { kind: "inside", parentId: "parent" } },
  ]);
  expect(editor.dropTargets.resolve(199.75, 150, undefined, next)?.destination).toEqual({
    kind: "inside",
    parentId: "parent",
  });
  next.setAttribute("data-drop-inert", "");
  expect(editor.dropTargets.resolve(199.75, 150, undefined, next)).toBeUndefined();
});

it("accepts the whole declared ending area while keeping its indicator at the top", () => {
  register(item, [{ kind: "edge", side: "block-start", coverage: "bounds", destination }]);
  for (const y of [1, 50, 99]) {
    const target = editor.dropTargets.resolve(10, y, undefined, item);
    expect(target?.destination).toEqual(destination);
    expect(target?.indicator?.top).toBe(-1);
  }
});

it.each([false, true])(
  "offsets block-edge feedback without expanding its hit area, RTL=%s",
  (rtl) => {
    item.style.direction = rtl ? "rtl" : "ltr";
    register(item, [{ kind: "edge", side: "block-end", indicatorInset: -8, destination }]);
    const target = editor.dropTargets.resolve(10, 99, undefined, item);
    expect(target?.indicator).toEqual({ left: rtl ? 0 : -8, top: 99, width: 208, height: 2 });
    expect(editor.dropTargets.resolve(-4, 99, undefined, item)).toBeUndefined();
  },
);

it("supplies the registered hierarchy outline independently of DOM ancestry", () => {
  const shell = document.createElement("section");
  root.append(shell);
  const release = editor.regions.register("parent", "shell", shell);
  register(host, [{ kind: "inside", destination: { kind: "inside", parentId: "parent" } }]);
  const resolved = editor.dropTargets.resolve(300, 200, undefined, host);
  expect(resolved?.element).toBe(host);
  expect(resolved?.outlineElement).toBe(shell);
  release();
  const detached = editor.dropTargets.resolve(300, 200, undefined, host);
  expect(detached?.element).toBe(host);
  expect(detached?.outlineElement).toBeUndefined();
});

it("does not borrow the same parent's hierarchy from another occurrence", () => {
  const foreign = new BlockEditorController({ adapter });
  const shell = document.createElement("section");
  shell.dataset.blockId = "parent";
  root.append(shell);
  foreign.regions.register("parent", "shell", shell);
  register(host, [{ kind: "inside", destination: { kind: "inside", parentId: "parent" } }]);
  try {
    expect(editor.dropTargets.resolve(300, 200, undefined, host)?.outlineElement).toBeUndefined();
  } finally {
    foreign.destroy();
  }
});

it.each([1, 55.75, 157, 499])("uses existing root-list free space at y=%s", (y) => {
  rect(root, 0, 0, 400, 500);
  rect(host, 20, 56, 360, 400);
  rect(item, 20, 56, 360, 100);
  root.dataset.blockRootList = "true";
  const before = { kind: "between", parentId: "parent", previousId: null, nextId: "a" } as const;
  const entry = register(item, [
    { kind: "edge", side: "block-start", destination: before },
    {
      kind: "edge",
      side: "block-end",
      destination,
      depth: { ancestors: 0, destinations: [destination, { kind: "inside", parentId: "a" }] },
    },
  ]);
  editor.dropTargets.registerLayout({
    element: host,
    axis: "vertical",
    gaps: true,
    getItems: () => [entry],
  });
  editor.dropTargets.registerLayout({
    element: root,
    axis: "vertical",
    gaps: true,
    getItems: () => [entry],
  });
  const hit = y === 55.75 ? item : root;
  const target = editor.dropTargets.resolve(300, y, undefined, hit);
  expect(target?.destination).toEqual(y < 56 ? before : destination);
  expect(target?.indicator).toEqual({ left: 20, top: y < 56 ? 55 : 155, width: 360, height: 2 });
});

it("keeps root-list virtual holes unavailable at both endpoints", () => {
  rect(root, 0, 0, 400, 500);
  rect(item, 20, 56, 360, 100);
  root.dataset.blockRootList = "true";
  item.dataset.index = "4";
  // An enclosing last-item marker does not mark this indexed item as last.
  host.dataset.virtualLast = "true";
  const before = { kind: "between", parentId: "parent", previousId: null, nextId: "a" } as const;
  const entry = register(item, [
    { kind: "edge", side: "block-start", destination: before },
    { kind: "edge", side: "block-end", destination },
  ]);
  editor.dropTargets.registerLayout({
    element: root,
    axis: "vertical",
    gaps: true,
    virtual: true,
    getItems: () => [entry],
  });
  expect(editor.dropTargets.resolve(100, 10, undefined, root)).toBeUndefined();
  expect(editor.dropTargets.resolve(100, 400, undefined, root)).toBeUndefined();
  item.dataset.index = "0";
  expect(editor.dropTargets.resolve(100, 10, undefined, root)?.destination).toEqual(before);
  expect(editor.dropTargets.resolve(100, 400, undefined, root)).toBeUndefined();
  item.dataset.virtualLast = "true";
  expect(editor.dropTargets.resolve(100, 400, undefined, root)?.destination).toEqual(destination);
});
