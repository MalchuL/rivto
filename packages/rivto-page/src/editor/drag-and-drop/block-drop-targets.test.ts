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

for (const axis of ["vertical", "horizontal"] as const) {
  const horizontal = axis === "horizontal";
  it.each(
    [5, 2000].flatMap((count) => [
      [count, 10, 35],
      [count, 300, 25],
    ]),
  )(`reads logarithmically many ${axis} rectangles among %i anchors at %i,%i`, (count, x, y) => {
    adapter.setNode("parent", { childIds: Array.from({ length: count }, (_, i) => `id-${i}`) });
    const reads: jest.SpyInstance[] = [];
    const items = Array.from({ length: count }, (_, i) => {
      const element = document.createElement("div");
      host.append(element);
      reads.push(
        horizontal ? rect(element, i * 20, 0, 10, 200) : rect(element, 0, i * 20, 200, 10),
      );
      return register(element, [
        {
          kind: "edge",
          side: horizontal ? "inline-start" : "block-start",
          destination: {
            kind: "between",
            parentId: "parent",
            previousId: i ? `id-${i - 1}` : null,
            nextId: `id-${i}`,
          },
        },
        {
          kind: "edge",
          side: horizontal ? "inline-end" : "block-end",
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
      axis,
      gaps: true,
      getItems: () => items,
    });
    const pointX = horizontal ? y : x;
    const pointY = horizontal ? x : y;
    expect(editor.dropTargets.resolve(pointX, pointY, undefined, host)?.destination).toEqual({
      kind: "between",
      parentId: "parent",
      previousId: "id-1",
      nextId: "id-2",
    });
    expect(reads.reduce((total, spy) => total + spy.mock.calls.length, 0)).toBeLessThanOrEqual(
      Math.ceil(Math.log2(count)) + 2,
    );
  });
}

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
  expect(editor.dropTargets.resolve(100, 99, undefined, item)?.destination).toEqual(destination);
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

it.each(["merged", "separate"] as const)(
  "keeps outer sibling rims reachable through nested lists in %s mode",
  (boundaries) => {
    adapter.setNode("a");
    const next = document.createElement("div");
    next.dataset.blockId = "b";
    host.append(next);
    rect(next, 0, 104);
    const childHost = document.createElement("div");
    item.append(childHost);
    rect(childHost, 0, 40, 200, 60);
    const previous = register(item, [
      {
        kind: "edge",
        side: "block-end",
        size: 8,
        destination,
        depth: { ancestors: 0, destinations: [destination, { kind: "inside", parentId: "a" }] },
      },
    ]);
    const following = register(next, [{ kind: "edge", side: "block-start", size: 8, destination }]);
    register(childHost, [
      { kind: "inside", coverage: "background", destination: { kind: "inside", parentId: "a" } },
    ]);
    editor.dropTargets.registerLayout({
      element: childHost,
      axis: "vertical",
      gaps: true,
      getItems: () => [],
    });
    editor.dropTargets.registerLayout({
      element: host,
      axis: "vertical",
      gaps: true,
      boundaries,
      getItems: () => [previous, following],
    });
    for (let y = 92; y < 100; y += 0.5) {
      const target = editor.dropTargets.resolve(12, y, undefined, childHost);
      expect(target?.destination).toEqual(destination);
      expect(target?.indicator?.top).toBe(boundaries === "merged" ? 101 : 99);
    }
    expect(editor.dropTargets.resolve(12, 90, undefined, childHost)?.destination).toEqual({
      kind: "inside",
      parentId: "a",
    });
    expect(editor.dropTargets.resolve(12, 95, undefined, childHost, () => false)).toBeUndefined();
    childHost.setAttribute("data-drop-inert", "");
    expect(editor.dropTargets.resolve(12, 95, undefined, childHost)).toBeUndefined();
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
      expect(target?.indicator?.width).toBe(x < 28 ? 200 : 172);
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

it.each(["merged", "separate"] as const)(
  "uses one endpoint line across an explicit trailing area in %s mode",
  (boundaries) => {
    rect(item, 20, 40, 360, 100);
    const entry = register(item);
    const trailing = document.createElement("footer");
    host.append(trailing);
    rect(trailing, 30, 160, 340, 120);
    register(trailing, [{ kind: "edge", side: "block-start", coverage: "bounds", destination }]);
    editor.dropTargets.registerLayout({
      element: host,
      axis: "vertical",
      gaps: true,
      boundaries,
      getItems: () => [entry],
    });
    for (const y of [139, 141, 159, 161, 220, 279, 300]) {
      const hit = host;
      const target = editor.dropTargets.resolve(
        100,
        y,
        undefined,
        y >= 160 && y < 280 ? trailing : hit,
      );
      expect(target?.destination).toEqual(destination);
      expect(target?.indicator).toEqual({ left: 20, top: 139, width: 360, height: 2 });
    }
  },
);

it("preserves outline depth when native background hits a mounted endpoint inset", () => {
  adapter.setNode("a");
  const entry = register(item, [
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
  expect(editor.dropTargets.resolve(12, 99, undefined, host)?.destination).toEqual(destination);
  const nested = editor.dropTargets.resolve(40, 99, undefined, host);
  expect(nested?.destination).toEqual({ kind: "inside", parentId: "a" });
  expect(nested?.indicator?.left).toBe(28);
  expect(editor.dropTargets.resolve(40, 50, undefined, host)).toBeUndefined();
});

it("retains a trailing declaration with a different canonical boundary", () => {
  const entry = register(item);
  const trailing = document.createElement("footer");
  host.append(trailing);
  rect(trailing, 20, 120, 360, 100);
  const before = { kind: "between", parentId: "parent", previousId: null, nextId: "a" } as const;
  register(trailing, [
    { kind: "edge", side: "block-start", coverage: "bounds", destination: before },
  ]);
  editor.dropTargets.registerLayout({
    element: host,
    axis: "vertical",
    gaps: true,
    getItems: () => [entry],
  });
  const target = editor.dropTargets.resolve(100, 150, undefined, trailing);
  expect(target?.destination).toEqual(before);
  expect(target?.indicator?.top).toBe(119);
});

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

it.each([false, true])("continues vertical list endpoints through free space, RTL=%s", (rtl) => {
  host.style.direction = item.style.direction = rtl ? "rtl" : "ltr";
  rect(item, 40, 80, 320, 100);
  const before = { kind: "between", parentId: "parent", previousId: null, nextId: "a" } as const;
  const after = { kind: "between", parentId: "parent", previousId: "b", nextId: null } as const;
  const last = document.createElement("div");
  last.dataset.blockId = "b";
  host.append(last);
  rect(last, 40, 200, 320, 100);
  const firstEntry = register(item, [{ kind: "edge", side: "block-start", destination: before }]);
  const lastEntry = register(last, [
    {
      kind: "edge",
      side: "block-end",
      destination: after,
      depth: { ancestors: 0, destinations: [after, { kind: "inside", parentId: "b" }] },
    },
  ]);
  register(host, [
    { kind: "inside", coverage: "background", destination: { kind: "inside", parentId: "parent" } },
  ]);
  editor.dropTargets.registerLayout({
    element: host,
    axis: "vertical",
    gaps: true,
    getItems: () => [firstEntry, lastEntry],
  });
  for (const x of [1, 200, 399]) {
    for (const y of [1, 79, 301, 399]) {
      const target = editor.dropTargets.resolve(x, y, undefined, host);
      expect(target?.destination).toEqual(y < 80 ? before : after);
      expect(target?.indicator).toEqual({
        left: 40,
        top: y < 80 ? 79 : 299,
        width: 320,
        height: 2,
      });
    }
  }
});

it.each([0, 16, 32])("keeps numeric endpoint continuation bounded at %spx", (gutterSize) => {
  rect(item, 40, 80, 320, 100);
  const entry = register(item);
  register(host, [
    { kind: "inside", coverage: "background", destination: { kind: "inside", parentId: "parent" } },
  ]);
  editor.dropTargets.registerLayout({
    element: host,
    axis: "vertical",
    gaps: true,
    gutterSize,
    getItems: () => [entry],
  });
  const target = editor.dropTargets.resolve(200, 399, undefined, host);
  expect(target?.destination).toEqual({ kind: "inside", parentId: "parent" });
  expect(target?.indicator).toBeUndefined();
});

it.each([false, true])(
  "keeps list virtual holes unavailable at both endpoints, root=%s",
  (isRoot) => {
    rect(root, 0, 0, 400, 500);
    rect(item, 20, 56, 360, 100);
    if (isRoot) {
      root.dataset.blockRootList = "true";
    }
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
  },
);

it.each([
  ["vertical", false],
  ["vertical", true],
  ["horizontal", false],
  ["horizontal", true],
] as const)("selects declared row halves through %s gutters, RTL=%s", (axis, rtl) => {
  rect(item, 100, 40, 120, 200);
  host.style.direction = item.style.direction = rtl ? "rtl" : "ltr";
  const before = { kind: "between", parentId: "parent", previousId: null, nextId: "a" } as const;
  const horizontal = axis === "horizontal";
  const entry = register(item, [
    { kind: "edge", side: horizontal ? "inline-start" : "block-start", destination: before },
    { kind: "edge", side: horizontal ? "inline-end" : "block-end", destination },
  ]);
  editor.dropTargets.registerLayout({ element: host, axis, gaps: true, getItems: () => [entry] });
  for (const end of [false, true]) {
    const x = end !== rtl ? 218 : 102;
    const y = end ? 238 : 42;
    const native = horizontal ? { x, y: 140 } : { x: 160, y };
    const expected = editor.dropTargets.resolve(native.x, native.y, undefined, item);
    expect(expected?.destination).toEqual(end ? destination : before);
    for (const cross of [1, 399]) {
      const point = horizontal ? { x, y: cross } : { x: cross, y };
      const target = editor.dropTargets.resolve(point.x, point.y, undefined, host);
      expect(target?.destination).toEqual(expected?.destination);
      expect(target?.indicator).toEqual(expected?.indicator);
      let coordinate = end ? 150 : 130;
      if (horizontal) {
        coordinate = end !== rtl ? 165 : 155;
      }
      const middle = horizontal ? { x: coordinate, y: cross } : { x: cross, y: coordinate };
      const rowTarget = editor.dropTargets.resolve(middle.x, middle.y, undefined, host);
      expect(rowTarget?.destination).toEqual(expected?.destination);
      expect(rowTarget?.indicator).toEqual(expected?.indicator);
    }
  }
});

it("keeps gutter continuation inside its declared layout and gap policy", () => {
  rect(item, 100, 40, 120, 200);
  const entry = register(item);
  const stop = editor.dropTargets.registerLayout({
    element: host,
    axis: "vertical",
    gaps: false,
    getItems: () => [entry],
  });
  expect(editor.dropTargets.resolve(300, 238, undefined, host)).toBeUndefined();
  stop();
  editor.dropTargets.registerLayout({
    element: host,
    axis: "vertical",
    gaps: true,
    getItems: () => [entry],
  });
  expect(editor.dropTargets.resolve(300, 238, undefined, host)?.destination).toEqual(destination);
  expect(editor.dropTargets.resolve(401, 238, undefined, host)).toBeUndefined();
  expect(editor.dropTargets.resolve(300, 260, undefined, host)?.destination).toEqual(destination);
  host.setAttribute("data-drop-inert", "");
  expect(editor.dropTargets.resolve(300, 238, undefined, host)).toBeUndefined();
});

it("retains a central body when a large edge size is used on a small block", () => {
  adapter.setNode("a");
  rect(item, 0, 0, 200, 24);
  item.style.setProperty("--rivto-drop-target-size", "16px");
  const before = { kind: "between", parentId: "parent", previousId: null, nextId: "a" } as const;
  register(item, [
    { kind: "edge", side: "block-start", destination: before },
    { kind: "edge", side: "block-end", destination },
    { kind: "inside", destination: { kind: "inside", parentId: "a" } },
  ]);
  expect(editor.dropTargets.resolve(100, 7, undefined, item)?.destination).toEqual(before);
  expect(editor.dropTargets.resolve(100, 12, undefined, item)?.destination).toEqual({
    kind: "inside",
    parentId: "a",
  });
  expect(editor.dropTargets.resolve(100, 17, undefined, item)?.destination).toEqual(destination);
});

it.each(["merged", "separate"] as const)(
  "continues gutters through physical seams in %s mode",
  (boundaries) => {
    rect(item, 100, 40, 200, 60);
    const next = document.createElement("div");
    next.dataset.blockId = "b";
    host.append(next);
    rect(next, 100, 110, 200, 60);
    const previous = register(item);
    const following = register(next, [{ kind: "edge", side: "block-start", destination }]);
    editor.dropTargets.registerLayout({
      element: host,
      axis: "vertical",
      gaps: true,
      boundaries,
      getItems: () => [previous, following],
    });
    for (const y of [99, 102, 105, 109, 111]) {
      const nativeHit = y < 100 ? item : next;
      const reference = editor.dropTargets.resolve(
        150,
        y,
        undefined,
        y > 100 && y < 110 ? host : nativeHit,
      );
      expect(reference?.destination).toEqual(destination);
      for (const x of [1, 399]) {
        const target = editor.dropTargets.resolve(x, y, undefined, host);
        expect(target?.destination).toEqual(reference?.destination);
        expect(target?.indicator).toEqual(reference?.indicator);
      }
    }
    expect(editor.dropTargets.resolve(1, 70, undefined, host)?.destination).toEqual(destination);
  },
);

it.each([false, true])(
  "keeps grid row gutters separate from tile seams and short-tile background, RTL=%s",
  (rtl) => {
    rect(item, rtl ? 200 : 100, 40, 80, 100);
    host.style.direction = item.style.direction = rtl ? "rtl" : "ltr";
    const next = document.createElement("div");
    next.dataset.blockId = "b";
    host.append(next);
    rect(next, rtl ? 100 : 200, 40, 80, 200);
    next.style.direction = host.style.direction;
    const before = { kind: "between", parentId: "parent", previousId: null, nextId: "a" } as const;
    const after = { kind: "between", parentId: "parent", previousId: "b", nextId: null } as const;
    const previous = register(item, [
      { kind: "edge", side: "block-start", destination: before },
      { kind: "edge", side: "block-end", destination },
      { kind: "edge", side: "inline-end", destination },
    ]);
    const following = register(next, [
      { kind: "edge", side: "block-start", destination },
      { kind: "edge", side: "block-end", destination: after },
      { kind: "edge", side: "inline-start", destination },
    ]);
    editor.dropTargets.registerLayout({
      element: host,
      axis: "grid",
      gaps: true,
      getItems: () => [previous, following],
    });
    expect(editor.dropTargets.resolve(rtl ? 399 : 1, 85, undefined, host)?.destination).toEqual(
      before,
    );
    expect(editor.dropTargets.resolve(rtl ? 399 : 1, 95, undefined, host)?.destination).toEqual(
      destination,
    );
    expect(editor.dropTargets.resolve(rtl ? 1 : 399, 130, undefined, host)?.destination).toEqual(
      destination,
    );
    expect(editor.dropTargets.resolve(rtl ? 1 : 399, 150, undefined, host)?.destination).toEqual(
      after,
    );
    expect(editor.dropTargets.resolve(190, 100, undefined, host)?.indicator?.width).toBe(2);
    expect(editor.dropTargets.resolve(rtl ? 399 : 1, 180, undefined, host)).toBeUndefined();
    expect(editor.dropTargets.resolve(rtl ? 220 : 120, 180, undefined, host)).toBeUndefined();
  },
);

it("does not invent a missing half or fall through after rejecting a row-gutter target", () => {
  rect(item, 100, 40, 120, 200);
  const entry = register(item);
  editor.dropTargets.registerLayout({
    element: host,
    axis: "vertical",
    gaps: true,
    getItems: () => [entry],
  });
  expect(editor.dropTargets.resolve(1, 130, undefined, host)).toBeUndefined();
  expect(editor.dropTargets.resolve(1, 150, undefined, host)?.destination).toEqual(destination);
  const accepts = jest.fn(() => false);
  expect(editor.dropTargets.resolve(1, 150, undefined, host, accepts)).toBeUndefined();
  expect(accepts).toHaveBeenCalledTimes(1);
  item.style.setProperty("--rivto-drop-target-size", "0px");
  expect(editor.dropTargets.resolve(1, 150, undefined, host)).toBeUndefined();
});

it.each(["vertical", "horizontal", "horizontal-rtl"] as const)(
  "keeps the populated block's registered body available across %s edges",
  (axis) => {
    adapter.setNode("a", { childIds: ["child"] });
    rect(item, 0, 0, 300, 120);
    const horizontal = axis !== "vertical";
    const rowLeft = axis === "horizontal" ? 250 : 8;
    item.style.direction = axis === "horizontal-rtl" ? "rtl" : "ltr";
    item.style.setProperty("--rivto-drop-target-size", "32px");
    const row = document.createElement("div");
    item.append(row);
    rect(row, rowLeft, 2, horizontal ? 42 : 280, 24);
    editor.regions.register("a", "shell", item);
    editor.regions.register("a", "row", row);
    const before = { kind: "between", parentId: "parent", previousId: null, nextId: "a" } as const;
    register(item, [
      {
        kind: "edge",
        side: horizontal ? "inline-start" : "block-start",
        destination: before,
      },
      { kind: "edge", side: horizontal ? "inline-end" : "block-end", destination },
      { kind: "inside", destination: { kind: "inside", parentId: "a" } },
    ]);
    const target = editor.dropTargets.resolve(horizontal ? rowLeft + 21 : 100, 14, undefined, row);
    expect(target?.destination).toEqual({ kind: "inside", parentId: "a" });
    expect(target?.indicator).toBeUndefined();
    expect(target?.outlineElement).toBe(item);
  },
);

it("keeps a padded placement's declared edge size while protecting its body", () => {
  adapter.setNode("a");
  rect(item, 0, 0, 200, 100);
  item.style.setProperty("--rivto-drop-target-size", "16px");
  const row = document.createElement("div");
  item.append(row);
  rect(row, 12, 12, 176, 24);
  editor.regions.register("a", "shell", item);
  editor.regions.register("a", "row", row);
  const before = { kind: "between", parentId: "parent", previousId: null, nextId: "a" } as const;
  register(item, [
    { kind: "edge", side: "block-start", destination: before },
    { kind: "inside", destination: { kind: "inside", parentId: "a" } },
  ]);
  expect(editor.dropTargets.resolve(100, 15, undefined, row)?.destination).toEqual(before);
  expect(editor.dropTargets.resolve(100, 24, undefined, row)?.destination).toEqual({
    kind: "inside",
    parentId: "a",
  });
});

it("retains line geometry for edge-derived child insertion", () => {
  adapter.setNode("a");
  editor.regions.register("a", "shell", item);
  register(item, [
    { kind: "edge", side: "block-end", destination: { kind: "inside", parentId: "a" } },
  ]);
  const target = editor.dropTargets.resolve(100, 99, undefined, item);
  expect(target?.destination).toEqual({ kind: "inside", parentId: "a" });
  expect(target?.indicator).toEqual({ left: 0, top: 99, width: 200, height: 2 });
  expect(target?.outlineElement).toBeUndefined();
});

it.each(["row", 0, 16, undefined] as const)(
  "keeps physical gaps while gutter continuation is %s",
  (gutterSize) => {
    rect(item, 100, 40, 200, 60);
    const next = document.createElement("div");
    next.dataset.blockId = "b";
    host.append(next);
    rect(next, 100, 110, 200, 60);
    const previous = register(item);
    const following = register(next, [{ kind: "edge", side: "block-start", destination }]);
    editor.dropTargets.register({
      element: host,
      getRegions: () => [
        {
          kind: "inside",
          coverage: "background",
          destination: { kind: "inside", parentId: "parent" },
        },
      ],
    });
    editor.dropTargets.registerLayout({
      element: host,
      axis: "vertical",
      gaps: true,
      gutterSize,
      getItems: () => [previous, following],
    });
    const target = editor.dropTargets.resolve(399, 90, undefined, host);
    expect(target?.destination).toEqual(
      gutterSize === "row" || gutterSize === undefined
        ? destination
        : { kind: "inside", parentId: "parent" },
    );
    expect(Boolean(target?.indicator)).toBe(gutterSize === "row" || gutterSize === undefined);
    expect(editor.dropTargets.resolve(150, 105, undefined, host)?.destination).toEqual(destination);
  },
);

it.each(["vertical", "horizontal", "grid"] as const)(
  "bounds numeric gutter distance in %s flow under viewport scaling",
  (axis) => {
    rect(item, 100, 40, 200, 100);
    Object.defineProperty(item, "offsetWidth", { configurable: true, value: 100 });
    Object.defineProperty(item, "offsetHeight", { configurable: true, value: 50 });
    const entry = register(item, [
      { kind: "edge", side: "inline-start", destination },
      { kind: "edge", side: "inline-end", destination },
      { kind: "edge", side: "block-end", destination },
    ]);
    editor.dropTargets.registerLayout({
      element: host,
      axis,
      gaps: true,
      gutterSize: 16,
      getItems: () => [entry],
    });
    for (const distance of [31.5, 32, 32.5]) {
      for (const leading of [true, false]) {
        const cross = leading ? 100 - distance : 300 + distance;
        const x = axis === "horizontal" ? 250 : cross;
        const crossY = leading ? 40 - distance : 140 + distance;
        const y = axis === "horizontal" ? crossY : 120;
        const target = editor.dropTargets.resolve(x, y, undefined, host);
        expect(target?.destination).toEqual(distance <= 32 ? destination : undefined);
      }
    }
  },
);

it.each([-1, Infinity, NaN])("rejects invalid gutter distance %s", (gutterSize) => {
  rect(item, 100, 40, 200, 100);
  const entry = register(item);
  editor.dropTargets.registerLayout({
    element: host,
    axis: "vertical",
    gaps: true,
    gutterSize,
    getItems: () => [entry],
  });
  expect(() => editor.dropTargets.resolve(320, 120, undefined, host)).toThrow(
    "Gutter size must be finite and nonnegative",
  );
});

it.each(["vertical", "horizontal", "grid"] as const)(
  "expands numeric gutters on all four sides and corners in %s flow",
  (axis) => {
    rect(item, 100, 80, 200, 100);
    Object.defineProperty(item, "offsetWidth", { configurable: true, value: 100 });
    Object.defineProperty(item, "offsetHeight", { configurable: true, value: 50 });
    const before = { kind: "between", parentId: "parent", previousId: null, nextId: "a" } as const;
    const entry = register(item, [
      { kind: "edge", side: "block-start", destination: before },
      { kind: "edge", side: "block-end", destination },
      { kind: "edge", side: "inline-start", destination: before },
      { kind: "edge", side: "inline-end", destination },
    ]);
    editor.dropTargets.registerLayout({
      element: host,
      axis,
      gaps: true,
      gutterSize: 32,
      getItems: () => [entry],
    });
    for (const distance of [63.5, 64, 64.5]) {
      const points = [
        { x: 100 - distance, y: 150, before: axis !== "vertical" },
        { x: 300 + distance, y: 150, before: false },
        { x: 250, y: 80 - distance, before: axis !== "horizontal" },
        { x: 250, y: 180 + distance, before: false },
        { x: 100 - distance, y: 80 - distance, before: true },
      ];
      for (const point of points) {
        const target = editor.dropTargets.resolve(point.x, point.y, undefined, host);
        let expected;
        if (distance <= 64) {
          expected = point.before ? before : destination;
        }
        expect(target?.destination).toEqual(expected);
      }
    }
  },
);

it("finds a tile's exposed top/bottom using adjacent grid rows", () => {
  rect(item, 100, 80, 80, 40);
  const first = register(item, [{ kind: "edge", side: "block-end", destination }]);
  const second = document.createElement("div");
  const third = document.createElement("div");
  const fourth = document.createElement("div");
  host.append(second, third, fourth);
  rect(second, 200, 80, 80, 60);
  rect(third, 100, 170, 80, 40);
  rect(fourth, 200, 170, 80, 40);
  const next = { kind: "between", parentId: "parent", previousId: null, nextId: "a" } as const;
  const items = [
    first,
    register(second),
    register(third),
    register(fourth, [{ kind: "edge", side: "block-start", destination: next }]),
  ];
  editor.dropTargets.registerLayout({
    element: host,
    axis: "grid",
    gaps: true,
    gutterSize: 32,
    getItems: () => items,
  });
  expect(editor.dropTargets.resolve(140, 125, undefined, host)?.destination).toEqual(destination);
  expect(editor.dropTargets.resolve(240, 160, undefined, host)?.destination).toEqual(next);
});

it("bounds numeric gutter measurement to nearby rows in a large grid", () => {
  rect(host, 0, 0, 400, 10000);
  const measurements: Array<ReturnType<typeof rect>> = [];
  const items = Array.from({ length: 1000 }, (_, index) => {
    const element = document.createElement("div");
    host.append(element);
    measurements.push(
      rect(element, 100 + (index % 10) * 20, 100 + Math.floor(index / 10) * 40, 20, 20),
    );
    return register(element);
  });
  editor.dropTargets.registerLayout({
    element: host,
    axis: "grid",
    gaps: true,
    gutterSize: 16,
    getItems: () => items,
  });
  expect(editor.dropTargets.resolve(110, 3725, undefined, host)?.destination).toEqual(destination);
  const reads = measurements.reduce(
    (count, measurement) => count + measurement.mock.calls.length,
    0,
  );
  expect(reads).toBeLessThan(100);
});

it("keeps an inline grid seam ahead of numeric background expansion", () => {
  rect(item, 100, 80, 80, 100);
  const next = document.createElement("div");
  host.append(next);
  rect(next, 200, 80, 80, 100);
  const a = register(item, [
    { kind: "edge", side: "block-end", destination: { kind: "inside", parentId: "parent" } },
    { kind: "edge", side: "inline-end", destination },
  ]);
  const b = register(next, [
    { kind: "edge", side: "block-end", destination: { kind: "inside", parentId: "parent" } },
    { kind: "edge", side: "inline-start", destination },
  ]);
  editor.dropTargets.registerLayout({
    element: host,
    axis: "grid",
    gaps: true,
    gutterSize: 32,
    getItems: () => [a, b],
  });
  for (const x of [179.75, 180, 190, 200, 200.25]) {
    const target = editor.dropTargets.resolve(x, 150, undefined, host);
    expect(target?.destination).toEqual(destination);
    expect(target?.indicator?.width).toBe(2);
    expect(target?.indicator?.left).toBe(189);
  }
});

it.each([false, true])("uses exposed grid side orientation in numeric gutters, RTL=%s", (rtl) => {
  rect(item, 100, 80, 200, 100);
  host.style.direction = item.style.direction = rtl ? "rtl" : "ltr";
  const entry = register(item, [
    { kind: "edge", side: "block-start", destination },
    { kind: "edge", side: "block-end", destination },
    { kind: "edge", side: "inline-start", destination },
    { kind: "edge", side: "inline-end", destination },
  ]);
  editor.dropTargets.registerLayout({
    element: host,
    axis: "grid",
    gaps: true,
    gutterSize: 32,
    getItems: () => [entry],
  });
  for (const x of [80, 320]) {
    const target = editor.dropTargets.resolve(x, 130, undefined, host);
    expect(target?.indicator?.width).toBe(2);
    expect(target?.indicator?.height).toBe(100);
  }
  for (const point of [
    { x: 200, y: 60 },
    { x: 200, y: 200 },
    { x: 80, y: 60 },
    { x: 320, y: 200 },
  ]) {
    expect(editor.dropTargets.resolve(point.x, point.y, undefined, host)?.indicator?.height).toBe(
      2,
    );
  }
});

it.each([undefined, "row", 0, 16] as const)(
  "uses owned vertical background only with row continuation, size=%s",
  (gutterSize) => {
    adapter.setNode("a", { childIds: ["child"] });
    adapter.setNode("child");
    const children = document.createElement("div");
    const child = document.createElement("div");
    child.dataset.blockId = "child";
    item.append(children);
    children.append(child);
    rect(children, 20, 20, 160, 40);
    rect(child, 20, 30, 160, 20);
    register(item, [{ kind: "inside", destination: { kind: "inside", parentId: "a" } }]);
    editor.regions.register("a", "children", children);
    const after = { kind: "between", parentId: "a", previousId: "child", nextId: null } as const;
    const before = { kind: "between", parentId: "a", previousId: null, nextId: "child" } as const;
    const entry = register(child, [
      { kind: "edge", side: "block-start", destination: before },
      { kind: "edge", side: "block-end", destination: after },
    ]);
    const release = editor.dropTargets.registerLayout({
      element: children,
      axis: "vertical",
      gaps: true,
      gutterSize,
      getItems: () => [entry],
    });
    expect(editor.dropTargets.resolve(100, 15, undefined, item)?.destination).toEqual(
      gutterSize === 0 || gutterSize === 16 ? { kind: "inside", parentId: "a" } : before,
    );
    const content = document.createElement("div");
    content.dataset.blockContent = "";
    item.append(content);
    rect(content, 0, 0, 200, 10);
    expect(editor.dropTargets.resolve(100, 5, undefined, content)?.destination).toEqual({
      kind: "inside",
      parentId: "a",
    });
    const target = editor.dropTargets.resolve(100, 90, undefined, item);
    expect(target?.destination).toEqual(
      gutterSize === 0 || gutterSize === 16 ? { kind: "inside", parentId: "a" } : after,
    );
    if (gutterSize === undefined || gutterSize === "row") {
      expect(target?.indicator?.top).toBe(49);
    }
    release();
    expect(editor.dropTargets.resolve(100, 90, undefined, item)?.destination).toEqual({
      kind: "inside",
      parentId: "a",
    });
  },
);

it("keeps a nearer declared child edge ahead of a coincident outer rim", () => {
  adapter.setNode("a", { childIds: ["child"] });
  adapter.setNode("child");
  const children = document.createElement("div");
  const child = document.createElement("div");
  child.dataset.blockId = "child";
  item.append(children);
  children.append(child);
  rect(children, 20, 0, 180, 100);
  rect(child, 20, 0, 180, 30);
  editor.regions.register("a", "children", children);
  const outer = { kind: "between", parentId: "parent", previousId: null, nextId: "a" } as const;
  const inner = { kind: "between", parentId: "a", previousId: null, nextId: "child" } as const;
  const parent = register(item, [{ kind: "edge", side: "block-start", destination: outer }]);
  const entry = register(child, [{ kind: "edge", side: "block-start", destination: inner }]);
  editor.dropTargets.registerLayout({
    element: children,
    axis: "vertical",
    gaps: true,
    getItems: () => [entry],
  });
  editor.dropTargets.registerLayout({
    element: host,
    axis: "vertical",
    gaps: true,
    getItems: () => [parent],
  });
  expect(editor.dropTargets.resolve(100, 2, undefined, child)?.destination).toEqual(inner);
  expect(editor.dropTargets.resolve(1, 2, undefined, item)?.destination).toEqual(outer);
});

it("normalizes a terminal child outdent band to its ancestor sibling gap", () => {
  adapter.setNode("a", { childIds: ["nested"] });
  adapter.setNode("nested");
  const next = document.createElement("div");
  next.dataset.blockId = "b";
  host.append(next);
  rect(next, 0, 104);
  const children = document.createElement("div");
  const child = document.createElement("div");
  child.dataset.blockId = "nested";
  item.append(children);
  children.append(child);
  rect(children, 28, 40, 172, 60);
  rect(child, 28, 40, 172, 60);
  editor.regions.register("a", "children", children);
  const parent = register(item);
  const following = register(next, [{ kind: "edge", side: "block-start", destination }]);
  const local = { kind: "between", parentId: "a", previousId: "nested", nextId: null } as const;
  const nested = register(child, [
    {
      kind: "edge",
      side: "block-end",
      destination: local,
      depth: {
        ancestors: 1,
        destinations: [destination, local, { kind: "inside", parentId: "nested" }],
      },
    },
  ]);
  editor.dropTargets.registerLayout({
    element: children,
    axis: "vertical",
    gaps: true,
    getItems: () => [nested],
  });
  editor.dropTargets.registerLayout({
    element: host,
    axis: "vertical",
    gaps: true,
    getItems: () => [parent, following],
  });
  const target = editor.dropTargets.resolve(12, 99, undefined, child);
  expect(target?.destination).toEqual(destination);
  expect(target?.indicator?.top).toBe(101);
});

it.each(["block-start", "block-end"] as const)(
  "keeps %s list padding ahead of a coincident ancestor rim",
  (side) => {
    adapter.setNode("a", { childIds: ["child"] });
    adapter.setNode("child");
    const children = document.createElement("div");
    const child = document.createElement("div");
    child.dataset.blockId = "child";
    item.append(children);
    children.append(child);
    rect(children, 0, 0, 200, 100);
    rect(child, 28, 16, 172, 68);
    const before = { kind: "between", parentId: "parent", previousId: null, nextId: "a" } as const;
    const first = side === "block-start";
    adapter.setNode("parent", { childIds: ["a"] });
    const after = { kind: "between", parentId: "parent", previousId: "a", nextId: null } as const;
    const outer = first ? before : after;
    const inner = {
      kind: "between",
      parentId: "a",
      previousId: first ? null : "child",
      nextId: first ? "child" : null,
    } as const;
    const parent = register(item, [{ kind: "edge", side, destination: outer }]);
    const entry = register(child, [{ kind: "edge", side, destination: inner }]);
    editor.dropTargets.registerLayout({
      element: children,
      axis: "vertical",
      gaps: true,
      getItems: () => [entry],
    });
    editor.dropTargets.registerLayout({
      element: host,
      axis: "vertical",
      gaps: true,
      getItems: () => [parent],
    });
    const y = first ? 2 : 98;
    const target = editor.dropTargets.resolve(100, y, undefined, children);
    expect(target?.destination).toEqual(inner);
    expect(target?.indicator?.top).toBe(first ? 15 : 83);
    expect(editor.dropTargets.resolve(4, y, undefined, children)?.destination).toEqual(outer);
  },
);

it.each(["vertical", "horizontal"] as const)(
  "keeps %s list padding across a perpendicular containing layout",
  (axis) => {
    const horizontal = axis === "horizontal";
    adapter.rootIds = ["parent"];
    adapter.setNode("a", { childIds: ["child"] });
    adapter.setNode("child");
    host.dataset.blockId = "parent";
    const children = document.createElement("div");
    const child = document.createElement("div");
    child.dataset.blockId = "child";
    item.append(children);
    children.append(child);
    if (horizontal) {
      rect(item, 0, 0, 100, 200);
      rect(children, 0, 0, 100, 200);
      rect(child, 16, 28, 68, 172);
    } else {
      rect(children, 0, 0, 200, 100);
      rect(child, 28, 16, 172, 68);
    }
    const outer = { kind: "between", parentId: null, previousId: null, nextId: "parent" } as const;
    const inner = { kind: "between", parentId: "a", previousId: null, nextId: "child" } as const;
    const parent = register(host, [
      { kind: "edge", side: horizontal ? "inline-start" : "block-start", destination: outer },
    ]);
    const lane = register(item, [
      { kind: "inside", destination: { kind: "inside", parentId: "a" } },
    ]);
    const entry = register(child, [
      { kind: "edge", side: horizontal ? "inline-start" : "block-start", destination: inner },
    ]);
    for (const [element, flow, anchor] of [
      [children, axis, entry],
      [host, horizontal ? "vertical" : "horizontal", lane],
      [root, axis, parent],
    ] as const) {
      editor.dropTargets.registerLayout({
        element,
        axis: flow,
        gaps: true,
        getItems: () => [anchor],
      });
    }
    for (const cross of [12, 100, 198]) {
      const x = horizontal ? 2 : cross;
      const y = horizontal ? cross : 2;
      expect(editor.dropTargets.resolve(x, y, undefined, children)?.destination).toEqual(inner);
    }
  },
);

it.each([false, true])("extends horizontal endpoints through existing padding, RTL=%s", (rtl) => {
  host.style.direction = item.style.direction = rtl ? "rtl" : "ltr";
  rect(item, 40, 20, 120, 160);
  const before = { kind: "between", parentId: "parent", previousId: null, nextId: "a" } as const;
  const entry = register(item, [
    { kind: "edge", side: "inline-start", destination: before },
    { kind: "edge", side: "inline-end", destination },
  ]);
  editor.dropTargets.registerLayout({
    element: host,
    axis: "horizontal",
    gaps: true,
    getItems: () => [entry],
  });
  for (const x of [1, 39, 161, 399]) {
    const leading = rtl ? x > 160 : x < 40;
    const target = editor.dropTargets.resolve(x, 100, undefined, host);
    expect(target?.destination).toEqual(leading ? before : destination);
    expect(target?.indicator).toEqual({ left: x < 40 ? 39 : 159, top: 20, width: 2, height: 160 });
  }
});

it.each([false, true])(
  "keeps a horizontal inner list ahead of vertical ancestor rims, RTL=%s",
  (rtl) => {
    host.style.direction = item.style.direction = rtl ? "rtl" : "ltr";
    rect(item, 0, 0, 200, 200);
    adapter.setNode("a", { childIds: ["child"] });
    adapter.setNode("child");
    const children = document.createElement("div");
    const child = document.createElement("div");
    child.dataset.blockId = "child";
    children.style.direction = child.style.direction = rtl ? "rtl" : "ltr";
    item.append(children);
    children.append(child);
    rect(children, 0, 0, 200, 200);
    rect(child, 16, 0, 168, 200);
    const outer = { kind: "between", parentId: "parent", previousId: null, nextId: "a" } as const;
    const inner = { kind: "between", parentId: "a", previousId: null, nextId: "child" } as const;
    const parent = register(item, [{ kind: "edge", side: "block-start", destination: outer }]);
    const entry = register(child, [{ kind: "edge", side: "inline-start", destination: inner }]);
    editor.dropTargets.registerLayout({
      element: children,
      axis: "horizontal",
      gaps: true,
      getItems: () => [entry],
    });
    editor.dropTargets.registerLayout({
      element: host,
      axis: "vertical",
      gaps: true,
      getItems: () => [parent],
    });
    const target = editor.dropTargets.resolve(rtl ? 198 : 2, 2, undefined, children);
    expect(target?.destination).toEqual(inner);
    expect(target?.indicator).toEqual({ left: rtl ? 183 : 15, top: 0, width: 2, height: 200 });
  },
);

it.each([undefined, "row", 0, 16] as const)(
  "uses owned horizontal background only with row continuation, size=%s",
  (gutterSize) => {
    rect(item, 0, 0, 100, 200);
    adapter.setNode("a", { childIds: ["child"] });
    adapter.setNode("child");
    const children = document.createElement("div");
    const child = document.createElement("div");
    child.dataset.blockId = "child";
    item.append(children);
    children.append(child);
    rect(children, 20, 20, 40, 160);
    rect(child, 30, 20, 20, 160);
    register(item, [{ kind: "inside", destination: { kind: "inside", parentId: "a" } }]);
    editor.regions.register("a", "children", children);
    const after = { kind: "between", parentId: "a", previousId: "child", nextId: null } as const;
    const before = { kind: "between", parentId: "a", previousId: null, nextId: "child" } as const;
    const entry = register(child, [
      { kind: "edge", side: "inline-start", destination: before },
      { kind: "edge", side: "inline-end", destination: after },
    ]);
    const release = editor.dropTargets.registerLayout({
      element: children,
      axis: "horizontal",
      gaps: true,
      gutterSize,
      getItems: () => [entry],
    });
    expect(editor.dropTargets.resolve(15, 100, undefined, item)?.destination).toEqual(
      gutterSize === 0 || gutterSize === 16 ? { kind: "inside", parentId: "a" } : before,
    );
    const content = document.createElement("div");
    content.dataset.blockContent = "";
    item.append(content);
    rect(content, 0, 0, 10, 200);
    expect(editor.dropTargets.resolve(5, 100, undefined, content)?.destination).toEqual({
      kind: "inside",
      parentId: "a",
    });
    const target = editor.dropTargets.resolve(90, 100, undefined, item);
    expect(target?.destination).toEqual(
      gutterSize === 0 || gutterSize === 16 ? { kind: "inside", parentId: "a" } : after,
    );
    if (gutterSize === undefined || gutterSize === "row") {
      expect(target?.indicator?.left).toBe(49);
    }
    release();
    expect(editor.dropTargets.resolve(90, 100, undefined, item)?.destination).toEqual({
      kind: "inside",
      parentId: "a",
    });
  },
);

it.each([false, true])("keeps horizontal virtual endpoint holes inert, RTL=%s", (rtl) => {
  host.style.direction = item.style.direction = rtl ? "rtl" : "ltr";
  rect(item, 100, 20, 100, 160);
  const before = { kind: "between", parentId: "parent", previousId: null, nextId: "a" } as const;
  const entry = register(item, [
    { kind: "edge", side: "inline-start", destination: before },
    { kind: "edge", side: "inline-end", destination },
  ]);
  editor.dropTargets.registerLayout({
    element: host,
    axis: "horizontal",
    gaps: true,
    virtual: true,
    getItems: () => [entry],
  });
  const leadingX = rtl ? 350 : 10;
  const trailingX = rtl ? 10 : 350;
  item.dataset.index = "4";
  expect(editor.dropTargets.resolve(leadingX, 100, undefined, host)).toBeUndefined();
  expect(editor.dropTargets.resolve(trailingX, 100, undefined, host)).toBeUndefined();
  item.dataset.index = "0";
  expect(editor.dropTargets.resolve(leadingX, 100, undefined, host)?.destination).toEqual(before);
  expect(editor.dropTargets.resolve(trailingX, 100, undefined, host)).toBeUndefined();
  item.dataset.virtualLast = "true";
  expect(editor.dropTargets.resolve(trailingX, 100, undefined, host)?.destination).toEqual(
    destination,
  );
});

it.each(["local", "outline"] as const)(
  "uses declared %s child scope for outer boundary depth",
  (scope) => {
    adapter.setNode("a");
    const children = document.createElement("div");
    children.dataset.blockDropScope = scope;
    item.append(children);
    editor.regions.register("a", "shell", item);
    editor.regions.register("a", "children", children);
    const inside = { kind: "inside", parentId: "a" } as const;
    const entry = register(item, [
      {
        kind: "edge",
        side: "block-end",
        destination,
        depth: { ancestors: 0, destinations: [destination, inside] },
      },
      { kind: "inside", destination: inside },
    ]);
    editor.dropTargets.registerLayout({
      element: host,
      axis: "vertical",
      gaps: true,
      getItems: () => [entry],
    });
    const target = editor.dropTargets.resolve(180, 99, undefined, item);
    expect(target?.destination).toEqual(scope === "local" ? destination : inside);
    expect(target?.indicator?.left).toBe(scope === "local" ? 0 : 28);
    expect(editor.dropTargets.resolve(100, 50, undefined, item)?.destination).toEqual(inside);
    expect(editor.dropTargets.resolve(100, 50, undefined, item)?.indicator).toBeUndefined();
  },
);

it("does not infer a child scope from unregistered descendants", () => {
  adapter.setNode("a");
  const children = document.createElement("div");
  children.dataset.blockDropScope = "local";
  item.append(children);
  const inside = { kind: "inside", parentId: "a" } as const;
  register(item, [
    {
      kind: "edge",
      side: "block-end",
      destination,
      depth: { ancestors: 0, destinations: [destination, inside] },
    },
  ]);
  expect(editor.dropTargets.resolve(180, 99, undefined, item)?.destination).toEqual(inside);
});

it.each(["content", "row"] as const)(
  "keeps registered own %s out of child-list background",
  (role) => {
    adapter.setNode("a", { childIds: ["child"] });
    adapter.setNode("child");
    const content = document.createElement("div");
    const children = document.createElement("div");
    const child = document.createElement("div");
    item.append(content, children);
    children.append(child);
    rect(item, 0, 0, 200, 200);
    rect(content, 0, 0, 200, 30);
    rect(children, 0, 40, 200, 160);
    rect(child, 0, 50, 200, 100);
    editor.regions.register("a", "shell", item);
    editor.regions.register("a", role, content);
    editor.regions.register("a", "children", children);
    const inside = { kind: "inside", parentId: "a" } as const;
    register(item, [{ kind: "inside", destination: inside }]);
    const before = { kind: "between", parentId: "a", previousId: null, nextId: "child" } as const;
    const entry = register(child, [{ kind: "edge", side: "block-start", destination: before }]);
    editor.dropTargets.registerLayout({
      element: children,
      axis: "vertical",
      gaps: true,
      getItems: () => [entry],
    });
    const target = editor.dropTargets.resolve(100, 20, undefined, content);
    expect(target?.destination).toEqual(inside);
    expect(target?.indicator).toBeUndefined();
  },
);

it("keeps a declared local block rim above its horizontal child background", () => {
  adapter.setNode("a", { childIds: ["child"] });
  adapter.setNode("child");
  rect(item, 0, 0, 200, 200);
  const children = document.createElement("div");
  const child = document.createElement("div");
  children.dataset.blockDropScope = "local";
  item.append(children);
  children.append(child);
  rect(children, 0, 0, 200, 200);
  rect(child, 20, 0, 160, 200);
  editor.regions.register("a", "shell", item);
  editor.regions.register("a", "children", children);
  const outer = { kind: "between", parentId: "parent", previousId: null, nextId: "a" } as const;
  const inner = { kind: "between", parentId: "a", previousId: null, nextId: "child" } as const;
  const parent = register(item, [{ kind: "edge", side: "block-start", destination: outer }]);
  const entry = register(child, [{ kind: "edge", side: "inline-start", destination: inner }]);
  editor.dropTargets.registerLayout({
    element: children,
    axis: "horizontal",
    gaps: true,
    getItems: () => [entry],
  });
  editor.dropTargets.registerLayout({
    element: host,
    axis: "vertical",
    gaps: true,
    getItems: () => [parent],
  });
  expect(editor.dropTargets.resolve(2, 2, undefined, children)?.destination).toEqual(outer);
});

it.each(["merged", "separate"] as const)(
  "keeps a stationary %s sibling seam above nested endpoint padding",
  (boundaries) => {
    adapter.setNode("b", { childIds: ["lane"] });
    adapter.setNode("lane", { childIds: ["child"] });
    adapter.setNode("child");
    rect(item, 0, 0, 200, 200);
    const next = document.createElement("div");
    next.dataset.blockId = "b";
    const group = document.createElement("div");
    const lane = document.createElement("div");
    const children = document.createElement("div");
    const child = document.createElement("div");
    host.append(next);
    next.append(group);
    group.append(lane);
    lane.append(children);
    children.append(child);
    for (const element of [next, group, lane, children]) {
      rect(element, 0, 204, 200, 200);
    }
    rect(child, 28, 220, 172, 160);
    const previous = register(item);
    const following = register(next, [{ kind: "edge", side: "block-start", destination }]);
    const column = register(lane, [
      { kind: "inside", destination: { kind: "inside", parentId: "lane" } },
    ]);
    const inner = { kind: "between", parentId: "lane", previousId: null, nextId: "child" } as const;
    const entry = register(child, [{ kind: "edge", side: "block-start", destination: inner }]);
    for (const [element, axis, anchors] of [
      [children, "vertical", [entry]],
      [group, "horizontal", [column]],
      [host, "vertical", [previous, following]],
    ] as const) {
      editor.dropTargets.registerLayout({
        element,
        axis,
        boundaries,
        gaps: true,
        getItems: () => anchors,
      });
    }
    for (const y of [205, 208, 211]) {
      const target = editor.dropTargets.resolve(100, y, undefined, children);
      expect(target?.destination).toEqual(destination);
      expect(target?.indicator?.top).toBe(boundaries === "merged" ? 201 : 203);
    }
    expect(editor.dropTargets.resolve(100, 205, new Set(["a"]), children)?.destination).toEqual(
      inner,
    );
  },
);

it("keeps a nested block edge above a stationary inline seam at their corner", () => {
  adapter.setNode("b", { childIds: ["child"] });
  adapter.setNode("child");
  rect(item, 0, 0, 200, 200);
  const next = document.createElement("div");
  next.dataset.blockId = "b";
  const children = document.createElement("div");
  const child = document.createElement("div");
  children.dataset.blockDropScope = "local";
  host.append(next);
  next.append(children);
  children.append(child);
  rect(next, 204, 0, 200, 200);
  rect(children, 204, 0, 200, 200);
  rect(child, 204, 16, 200, 180);
  editor.regions.register("b", "shell", next);
  editor.regions.register("b", "children", children);
  const previous = register(item, [{ kind: "edge", side: "inline-end", destination }]);
  const following = register(next, [{ kind: "edge", side: "inline-start", destination }]);
  const inner = { kind: "between", parentId: "b", previousId: null, nextId: "child" } as const;
  const entry = register(child, [{ kind: "edge", side: "block-start", destination: inner }]);
  editor.dropTargets.registerLayout({
    element: children,
    axis: "vertical",
    gaps: true,
    getItems: () => [entry],
  });
  editor.dropTargets.registerLayout({
    element: host,
    axis: "horizontal",
    gaps: true,
    getItems: () => [previous, following],
  });
  const target = editor.dropTargets.resolve(205, 2, undefined, children);
  expect(target?.destination).toEqual(inner);
  expect(target?.indicator?.top).toBe(15);
});

it("keeps a local shared sibling rim when child edges coincide without padding", () => {
  adapter.setNode("a");
  adapter.setNode("b", { childIds: ["child"] });
  adapter.setNode("child");
  rect(item, 0, 0, 200, 200);
  const next = document.createElement("div");
  next.dataset.blockId = "b";
  const children = document.createElement("div");
  const child = document.createElement("div");
  child.dataset.blockId = "child";
  children.dataset.blockDropScope = "local";
  host.append(next);
  next.append(children);
  children.append(child);
  for (const element of [next, children, child]) {
    rect(element, 0, 204, 200, 200);
  }
  editor.regions.register("b", "shell", next);
  editor.regions.register("b", "children", children);
  const previous = register(item);
  const following = register(next, [{ kind: "edge", side: "block-start", destination }]);
  const inner = { kind: "between", parentId: "b", previousId: null, nextId: "child" } as const;
  const entry = register(child, [{ kind: "edge", side: "block-start", destination: inner }]);
  editor.dropTargets.registerLayout({
    element: children,
    axis: "vertical",
    gaps: true,
    getItems: () => [entry],
  });
  editor.dropTargets.registerLayout({
    element: host,
    axis: "vertical",
    gaps: true,
    getItems: () => [previous, following],
  });
  const target = editor.dropTargets.resolve(100, 206, undefined, child);
  expect(target?.destination).toEqual(destination);
  expect(target?.indicator?.top).toBe(201);
  expect(editor.dropTargets.resolve(100, 206, new Set(["a"]), child)?.destination).toEqual(inner);
});
