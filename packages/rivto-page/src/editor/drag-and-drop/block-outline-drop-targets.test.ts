import { BlockEditorController } from "../block-editor-controller";
import { TestBlockEditorAdapter } from "../../test-utils/test-block-editor-adapter";
import { BlockOutlineDropTargets } from "./block-outline-drop-targets";

it("uses real parents and excludes moving roots without reading subtrees or foreign occurrences", () => {
  const data = new TestBlockEditorAdapter();
  data.setNode("hidden", { childIds: ["source", "target", "tail"] });
  for (const id of ["source", "target", "tail"]) {
    data.setNode(id);
  }
  data.setBlockIds(["source", "target", "tail"]);
  const editor = new BlockEditorController({ adapter: data });
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  root.dataset.blockRootList = "";
  root.innerHTML =
    '<div class="rivto-block" data-block-id="target"><div class="rivto-block-row"></div></div><div data-rivto-block-editor><span></span></div>';
  document.body.append(root);
  editor.attach(root);
  const row = root.querySelector<HTMLElement>(".rivto-block-row")!;
  jest
    .spyOn(row, "getBoundingClientRect")
    .mockReturnValue({ left: 100, top: 100, height: 24 } as DOMRect);
  const hit = jest.fn((): Element => row);
  Object.defineProperty(document, "elementFromPoint", { configurable: true, value: hit });
  const targets = new BlockOutlineDropTargets(editor, "hidden");
  expect(targets.resolve(100, 101, new Set(["source"]))?.destination).toEqual({
    kind: "between",
    parentId: "hidden",
    previousId: null,
    nextId: "target",
  });
  expect(hit).toHaveBeenCalledTimes(1);
  expect(targets.resolve(100, 101, new Set(["source"]), row)?.destination.parentId).toBe("hidden");
  expect(hit).toHaveBeenCalledTimes(1);
  expect(targets.resolve(130, 120)?.destination).toEqual({
    kind: "between",
    parentId: "target",
    previousId: null,
    nextId: null,
  });
  expect(targets.resolve(100, 101, new Set(["hidden"]))).toBeUndefined();
  hit.mockReturnValue(root.querySelector("span")!);
  expect(targets.resolve(100, 101)).toBeUndefined();
  editor.destroy();
  root.remove();
});

it("outdents through trailing ancestors only and retains the hidden panel boundary", () => {
  const data = new TestBlockEditorAdapter();
  data.rootIds = ["parent", "tail", "source"];
  data.setBlockIds(data.rootIds);
  data.setNode("parent", { childIds: ["branch"] });
  data.setNode("branch", { childIds: ["leaf"] });
  for (const id of ["leaf", "tail", "source", "sibling"]) {
    data.setNode(id);
  }
  const editor = new BlockEditorController({ adapter: data });
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  root.dataset.blockRootList = "";
  root.innerHTML =
    '<div class="rivto-block" data-block-id="leaf"><div class="rivto-block-row"></div></div>';
  document.body.append(root);
  editor.attach(root);
  const row = root.querySelector<HTMLElement>(".rivto-block-row")!;
  jest
    .spyOn(row, "getBoundingClientRect")
    .mockReturnValue({ left: 148, top: 100, bottom: 124, height: 24, width: 200 } as DOMRect);
  Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => row });
  const targets = new BlockOutlineDropTargets(editor, null);
  expect(targets.resolve(148, 123)?.destination).toEqual({
    kind: "between",
    parentId: "branch",
    previousId: "leaf",
    nextId: null,
  });
  expect(targets.resolve(124, 123)?.destination).toEqual({
    kind: "between",
    parentId: "parent",
    previousId: "branch",
    nextId: null,
  });
  expect(targets.resolve(100, 123)?.destination).toEqual({
    kind: "between",
    parentId: null,
    previousId: "parent",
    nextId: "tail",
  });
  for (const depth of [0, 1, 2]) {
    expect(targets.resolve(148 - depth * 24, 123)?.indicator).toEqual({
      left: 148 - depth * 24,
      top: 123,
      width: 200 + depth * 24,
      height: 2,
    });
  }
  data.setNode("parent", { childIds: ["branch", "sibling"] });
  expect(targets.resolve(100, 123)?.destination).toEqual({
    kind: "between",
    parentId: "parent",
    previousId: "branch",
    nextId: "sibling",
  });
  expect(targets.resolve(100, 123)?.indicator?.left).toBe(124);
  expect(targets.resolve(148, 101)?.indicator?.top).toBe(99);
  expect(targets.resolve(180, 112)?.indicator).toBeUndefined();
  expect(targets.resolve(180, 123)?.indicator?.left).toBe(172);
  expect(targets.resolve(100, 123, new Set(["sibling"]))?.destination.parentId).toBeNull();
  const bounded = new BlockOutlineDropTargets(editor, "parent");
  expect(bounded.resolve(0, 123, new Set(["sibling"]))?.destination.parentId).toBe("parent");
  editor.destroy();
  root.remove();
});

it.each([4, 200])(
  "resolves an intermediate root gap with bounded rectangle reads among %i mounted roots",
  (count) => {
    const data = new TestBlockEditorAdapter();
    const ids = Array.from({ length: count }, (_, index) => `root-${index}`);
    data.rootIds = ids;
    data.setBlockIds(ids);
    for (const id of ids) {
      data.setNode(id);
    }
    const editor = new BlockEditorController({ adapter: data });
    const root = document.createElement("div");
    root.dataset.rivtoBlockEditor = "true";
    root.dataset.blockRootList = "";
    const tree = document.createElement("div");
    tree.className = "rivto-virtual-tree";
    root.append(tree);
    let rectangles = 0;
    for (let index = 0; index < count; index += 1) {
      const shell = document.createElement("div");
      shell.className = "rivto-block";
      shell.dataset.blockId = ids[index];
      const row = document.createElement("div");
      row.className = "rivto-block-row";
      shell.append(row);
      const rect = { top: index * 30, bottom: index * 30 + 24, height: 24, left: 100 } as DOMRect;
      jest.spyOn(shell, "getBoundingClientRect").mockImplementation(() => {
        rectangles += 1;
        return rect;
      });
      jest.spyOn(row, "getBoundingClientRect").mockImplementation(() => {
        rectangles += 1;
        return rect;
      });
      const padding = document.createElement("div");
      const placement = document.createElement("div");
      placement.className = "rivto-virtual-root";
      placement.append(shell);
      padding.append(placement);
      tree.append(padding);
      jest.spyOn(padding, "getBoundingClientRect").mockImplementation(() => {
        rectangles += 1;
        return rect;
      });
    }
    document.body.append(root);
    editor.attach(root);
    Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => root });
    const descendantQuery = jest.spyOn(root, "querySelectorAll");
    const targets = new BlockOutlineDropTargets(editor, null);
    const middle = Math.floor(count / 2);
    data.blocks.getRootIds.mockClear();
    expect(targets.resolve(102, middle * 30 + 26)?.destination).toEqual({
      kind: "between",
      parentId: null,
      previousId: ids[middle],
      nextId: ids[middle + 1],
    });
    expect(data.blocks.getRootIds).toHaveBeenCalledTimes(1);
    expect(rectangles).toBeLessThanOrEqual(Math.ceil(Math.log2(count)) + 2);
    expect(descendantQuery).not.toHaveBeenCalled();
    editor.destroy();
    root.remove();
  },
);

it("resolves an explicitly routed nested boundary without admitting its interior by default", () => {
  const data = new TestBlockEditorAdapter();
  data.rootIds = ["source", "embed", "tail"];
  data.setBlockIds(data.rootIds);
  for (const id of data.rootIds) {
    data.setNode(id);
  }
  const editor = new BlockEditorController({ adapter: data });
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  root.dataset.blockRootList = "";
  root.innerHTML =
    '<div class="rivto-block" data-block-id="embed"><div class="rivto-block-row"><div data-rivto-block-editor><span></span></div></div></div>';
  document.body.append(root);
  editor.attach(root);
  const nested = root.querySelector<HTMLElement>("[data-rivto-block-editor]")!;
  const shell = root.querySelector<HTMLElement>(".rivto-block")!;
  jest
    .spyOn(nested, "getBoundingClientRect")
    .mockReturnValue({ top: 120, bottom: 200, height: 80 } as DOMRect);
  jest
    .spyOn(shell, "getBoundingClientRect")
    .mockReturnValue({ left: 10, width: 300, top: 100, bottom: 220 } as DOMRect);
  const hit = nested.querySelector("span")!;
  const targets = new BlockOutlineDropTargets(editor, null);
  try {
    expect(targets.resolve(30, 121, new Set(["source"]), hit)).toBeUndefined();
    expect(targets.resolve(30, 121, new Set(["source"]), hit, true)?.destination).toEqual({
      kind: "between",
      parentId: null,
      previousId: null,
      nextId: "embed",
    });
    expect(targets.resolve(30, 199, new Set(["source"]), hit, true)?.destination).toEqual({
      kind: "between",
      parentId: null,
      previousId: "embed",
      nextId: "tail",
    });
    expect(targets.resolve(30, 199, new Set(["embed"]), hit, true)).toBeUndefined();
    expect(nested.getBoundingClientRect).toHaveBeenCalledTimes(2);
    expect(shell.getBoundingClientRect).toHaveBeenCalledTimes(2);
  } finally {
    editor.destroy();
    root.remove();
  }
});

it.each([
  { hit: "embed-row", x: 36, y: 31, parentId: "upper", top: 26 },
  { hit: "tail-row", x: 36, y: 207, parentId: "embed", top: 202 },
  { hit: "body", x: 36, y: 199, parentId: "embed", top: 202 },
  { hit: "nested", x: 36, y: 193, parentId: "embed", top: 202 },
])("keeps indented $hit gaps in the enclosing outline", ({ hit, x, y, parentId, top }) => {
  const data = new TestBlockEditorAdapter();
  data.rootIds = ["source", "upper", "embed", "tail"];
  data.setBlockIds(data.rootIds);
  for (const id of data.rootIds) {
    data.setNode(id);
  }
  const editor = new BlockEditorController({ adapter: data });
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  root.dataset.blockRootList = "";
  root.innerHTML =
    '<div class="rivto-block" data-block-id="upper"><div class="rivto-block-row" id="upper-row"></div></div><div class="rivto-block" data-block-id="embed"><div class="rivto-block-row" id="embed-row"></div><div class="rivto-block-slot" data-slot-position="body" id="body"><div data-rivto-block-editor id="nested"></div></div></div><div class="rivto-block" data-block-id="tail"><div class="rivto-block-row" id="tail-row"></div></div>';
  document.body.append(root);
  editor.attach(root);
  for (const [selector, y, height] of [
    ['[data-block-id="upper"]', 0, 24],
    ["#upper-row", 0, 24],
    ['[data-block-id="embed"]', 30, 170],
    ["#embed-row", 30, 24],
    ["#body", 54, 146],
    ["#nested", 60, 134],
    ['[data-block-id="tail"]', 206, 24],
    ["#tail-row", 206, 24],
  ] as const) {
    jest.spyOn(root.querySelector(selector)!, "getBoundingClientRect").mockReturnValue({
      left: 0,
      right: 200,
      width: 200,
      top: y,
      bottom: y + height,
      height,
    } as DOMRect);
  }
  try {
    const targets = new BlockOutlineDropTargets(editor, null);
    const result = targets.resolve(x, y, new Set(["source"]), root.querySelector(`#${hit}`)!, true);
    expect(result?.destination).toEqual({
      kind: "between",
      parentId,
      previousId: null,
      nextId: null,
    });
    expect(result?.indicator).toMatchObject({ left: 24, top, height: 2 });
  } finally {
    editor.destroy();
    root.remove();
  }
});

it.each([false, true])(
  "keeps a container's outer lower gap outside its grid, movingNeighbor=%s",
  (movingNeighbor) => {
    const data = new TestBlockEditorAdapter();
    data.rootIds = ["board", "source", "tail"];
    data.setBlockIds(data.rootIds);
    data.setNode("board", { childIds: ["column"] });
    data.setNode("column");
    data.setNode("source");
    data.setNode("tail");
    const editor = new BlockEditorController({ adapter: data });
    const root = document.createElement("div");
    root.dataset.rivtoBlockEditor = "true";
    root.dataset.blockRootList = "";
    root.innerHTML =
      '<div class="rivto-block" data-block-id="board"><div class="rivto-block-row"></div><div class="rivto-block-children"><div class="rivto-block" data-block-id="column"><div class="rivto-block-row"></div></div></div></div><div class="rivto-block" data-block-id="source"><div class="rivto-block-row"></div></div><div class="rivto-block" data-block-id="tail"><div class="rivto-block-row"></div></div>';
    const board = root.firstElementChild!;
    const wrapper = document.createElement("div");
    board.replaceWith(wrapper);
    wrapper.append(board);
    document.body.append(root);
    editor.attach(root);
    for (const [selector, top, height] of [
      ['[data-block-id="board"]', 0, 200],
      ['[data-block-id="board"] > .rivto-block-row', 0, 24],
      ['[data-block-id="column"]', 24, 176],
      ['[data-block-id="column"] > .rivto-block-row', 24, 24],
      ['[data-block-id="source"]', 204, 24],
      ['[data-block-id="tail"]', 232, 24],
    ] as const) {
      jest
        .spyOn(root.querySelector(selector)!, "getBoundingClientRect")
        .mockReturnValue({ left: 0, width: 200, top, bottom: top + height, height } as DOMRect);
    }
    try {
      const excluded = new Set(movingNeighbor ? ["source"] : []);
      const targets = new BlockOutlineDropTargets(editor, null);
      const result = targets.resolve(12, 201, excluded, root);
      expect(result?.destination).toEqual({
        kind: "between",
        parentId: null,
        previousId: "board",
        nextId: movingNeighbor ? "tail" : "source",
      });
      expect(result?.indicator).toMatchObject({
        left: 0,
        top: movingNeighbor ? 199 : 201,
        height: 2,
      });
      const title = board.querySelector<HTMLElement>(".rivto-block-row")!;
      const grid = board.querySelector<HTMLElement>(".rivto-block-children")!;
      for (const [hit, y] of [
        [title, 12],
        [grid, 197],
      ] as const) {
        const boundary = targets.resolve(100, y, excluded, hit);
        expect(boundary?.destination).toEqual(result?.destination);
        expect(boundary?.indicator).toEqual(result?.indicator);
      }
      expect(targets.resolve(100, 100, excluded, grid)).toBeUndefined();
      expect(targets.resolve(100, 197, new Set(["board"]), grid)).toBeUndefined();
    } finally {
      editor.destroy();
      root.remove();
    }
  },
);

it.each([4, 200])(
  "reads only the excluded suffix and last stationary child among %i children",
  (count) => {
    const data = new TestBlockEditorAdapter();
    const ids = Array.from({ length: count }, (_, index) => `child-${index}`);
    const children = new Set(ids);
    let reads = 0;
    const childIds = new Proxy(ids, {
      /**
       * Counts addressed child reads while leaving normal array operations intact.
       *
       * @param target - Canonical fixture child list.
       * @param key - Requested array property.
       * @param receiver - Proxy receiving the property access.
       * @returns The original array property value.
       */
      get(target, key, receiver) {
        if (typeof key === "string" && /^\d+$/.test(key)) {
          reads += 1;
        }
        return Reflect.get(target, key, receiver);
      },
    });
    data.rootIds = ["parent", "tail"];
    data.setBlockIds(data.rootIds);
    data.setNode("parent", { childIds });
    data.setNode("tail");
    data.blocks.getParentId = (id) => (children.has(id) ? "parent" : undefined);
    const editor = new BlockEditorController({ adapter: data });
    const root = document.createElement("div");
    root.dataset.rivtoBlockEditor = "true";
    root.dataset.blockRootList = "";
    root.innerHTML =
      '<div class="rivto-block" data-block-id="parent"><div class="rivto-block-row"></div></div><div class="rivto-block" data-block-id="tail"><div class="rivto-block-row"></div></div>';
    document.body.append(root);
    editor.attach(root);
    const parent = root.firstElementChild!;
    const tail = root.lastElementChild!.firstElementChild!;
    jest
      .spyOn(parent, "getBoundingClientRect")
      .mockReturnValue({ left: 0, width: 200, top: 0, bottom: 24, height: 24 } as DOMRect);
    jest
      .spyOn(tail, "getBoundingClientRect")
      .mockReturnValue({ left: 0, width: 200, top: 30, bottom: 54, height: 24 } as DOMRect);
    try {
      reads = 0;
      const target = new BlockOutlineDropTargets(editor, null).resolve(
        36,
        31,
        new Set(ids.slice(-2)),
        tail,
      );
      expect(target?.destination).toEqual({
        kind: "between",
        parentId: "parent",
        previousId: ids[count - 3],
        nextId: null,
      });
      expect(target?.indicator).toMatchObject({ left: 24, top: 26, height: 2 });
      expect(reads).toBe(3);
    } finally {
      editor.destroy();
      root.remove();
    }
  },
);

it("keeps a parent's row boundary above the space retained by its moving child", () => {
  const data = new TestBlockEditorAdapter();
  data.rootIds = ["parent", "next"];
  data.setBlockIds(data.rootIds);
  data.setNode("parent", { childIds: ["source"] });
  data.setNode("source");
  data.setNode("next");
  const editor = new BlockEditorController({ adapter: data });
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  root.dataset.blockRootList = "";
  root.innerHTML =
    '<div class="rivto-block" data-block-id="parent"><div class="rivto-block-row"></div><div class="rivto-block-children rivto-block-outline"><div class="rivto-block" data-block-id="source"></div></div></div><div class="rivto-block" data-block-id="next"></div>';
  document.body.append(root);
  editor.attach(root);
  for (const [selector, top, bottom] of [
    ['[data-block-id="parent"]', 100, 268],
    [".rivto-block-row", 100, 124],
    ['[data-block-id="next"]', 268, 292],
  ] as const) {
    jest.spyOn(root.querySelector(selector)!, "getBoundingClientRect").mockReturnValue({
      left: 0,
      right: 200,
      width: 200,
      top,
      bottom,
      height: bottom - top,
    } as DOMRect);
  }
  try {
    const targets = new BlockOutlineDropTargets(editor, null);
    const target = targets.resolve(
      12,
      122,
      new Set(["source"]),
      root.querySelector(".rivto-block-row")!,
    );
    expect(target?.destination).toEqual({
      kind: "between",
      parentId: null,
      previousId: "parent",
      nextId: "next",
    });
    expect(target?.indicator).toMatchObject({ top: 123, height: 2 });
    data.setNode("fixed");
    data.setNode("parent", { childIds: ["fixed", "source"] });
    const source = root.querySelector('[data-block-id="source"]')!;
    const outer = targets.resolve(100, 265, new Set(["source"]), source);
    expect(outer?.destination).toEqual(target?.destination);
    expect(outer?.indicator).toMatchObject({ top: 267, height: 2 });
    expect(targets.resolve(100, 200, new Set(["source"]), source)).toBeUndefined();
  } finally {
    editor.destroy();
    root.remove();
  }
});

it("does not invent an empty root destination when all display roots are unmounted", () => {
  const data = new TestBlockEditorAdapter();
  data.rootIds = ["offscreen"];
  data.setBlockIds(data.rootIds);
  data.setNode("offscreen");
  const editor = new BlockEditorController({ adapter: data });
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  root.dataset.blockRootList = "";
  root.innerHTML = '<div class="rivto-virtual-tree"></div>';
  document.body.append(root);
  editor.attach(root);
  const targets = new BlockOutlineDropTargets(editor, null);
  expect(targets.resolve(10, 10, new Set(), root)).toBeUndefined();
  editor.destroy();
  root.remove();
});

it("resolves only declared card root lists inside a shared canvas occurrence", () => {
  const data = new TestBlockEditorAdapter();
  const editor = new BlockEditorController({ adapter: data });
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  root.innerHTML = "<section><div data-block-root-list></div></section>";
  document.body.append(root);
  editor.attach(root);
  const targets = new BlockOutlineDropTargets(editor, null);
  expect(targets.resolve(20, 20, new Set(), root)).toBeUndefined();
  expect(targets.resolve(20, 20, new Set(), root.firstElementChild!)).toBeUndefined();
  expect(
    targets.resolve(20, 20, new Set(), root.querySelector("[data-block-root-list]")!)?.destination,
  ).toEqual({
    kind: "inside",
    parentId: null,
  });
  editor.destroy();
  root.remove();
});

it("uses live host zoom for depth projection and its boundary indicator", () => {
  const data = new TestBlockEditorAdapter();
  data.setNode("target");
  data.setBlockIds(["target"]);
  data.rootIds = ["target"];
  const editor = new BlockEditorController({ adapter: data });
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  root.dataset.blockRootList = "";
  root.innerHTML =
    '<div class="rivto-block" data-block-id="target"><div class="rivto-block-row"></div></div>';
  document.body.append(root);
  editor.attach(root);
  const row = root.querySelector<HTMLElement>(".rivto-block-row")!;
  jest
    .spyOn(row, "getBoundingClientRect")
    .mockReturnValue({ left: 100, top: 100, bottom: 124, height: 24, width: 200 } as DOMRect);
  let scale = 0.5;
  const targets = new BlockOutlineDropTargets(editor, null, 24, true, 8, () => scale);
  expect(targets.resolve(112, 123, new Set(), row)?.destination.parentId).toBe("target");
  expect(targets.resolve(112, 123, new Set(), row)?.indicator?.left).toBe(112);
  scale = 2;
  expect(targets.resolve(112, 123, new Set(), row)?.destination.parentId).toBeNull();
  expect(targets.resolve(148, 123, new Set(), row)?.indicator?.left).toBe(148);
  editor.destroy();
  root.remove();
});

it("preserves an outline end gap that shares the surrounding container bottom", () => {
  const data = new TestBlockEditorAdapter();
  data.setNode("columns", { childIds: ["lane"] });
  data.setNode("lane", { childIds: ["parent"] });
  data.setNode("parent", { childIds: ["leaf"] });
  data.setNode("leaf");
  data.setBlockIds(["columns"]);
  data.rootIds = ["columns"];
  const editor = new BlockEditorController({ adapter: data });
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  root.dataset.blockRootList = "";
  root.innerHTML =
    '<div class="rivto-block" data-block-id="columns"><div class="rivto-block-children"><div class="rivto-block" data-block-id="lane"><div class="rivto-block-children"><div class="rivto-block" data-block-id="parent"><div class="rivto-block-children rivto-block-outline"><div class="rivto-block" data-block-id="leaf"><div class="rivto-block-row"></div></div></div></div></div></div></div></div>';
  document.body.append(root);
  editor.attach(root);
  for (const id of ["columns", "lane"]) {
    jest
      .spyOn(root.querySelector<HTMLElement>(`[data-block-id="${id}"]`)!, "getBoundingClientRect")
      .mockReturnValue({
        left: 100,
        right: 400,
        top: 0,
        bottom: 124,
        width: 300,
        height: 124,
      } as DOMRect);
  }
  jest
    .spyOn(root.querySelector<HTMLElement>('[data-block-id="leaf"]')!, "getBoundingClientRect")
    .mockReturnValue({ left: 148 } as DOMRect);
  const row = root.querySelector<HTMLElement>(".rivto-block-row")!;
  jest.spyOn(row, "getBoundingClientRect").mockReturnValue({
    left: 148,
    right: 400,
    top: 100,
    bottom: 124,
    width: 252,
    height: 24,
  } as DOMRect);
  expect(
    new BlockOutlineDropTargets(editor, null).resolve(136, 122, new Set(), row)?.destination
      .parentId,
  ).toBe("lane");
  editor.destroy();
  root.remove();
});

it.each([4, 200])("uses outline depth in vertical container gaps among %i blocks", (count) => {
  const data = new TestBlockEditorAdapter();
  const ids = Array.from({ length: count }, (_, index) => `entry-${index}`);
  data.rootIds = ["container"];
  data.setBlockIds(data.rootIds);
  data.setNode("container", { childIds: ids });
  for (const id of ids) {
    data.setNode(id);
  }
  const editor = new BlockEditorController({ adapter: data });
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  root.innerHTML = `<div class="rivto-block" data-block-id="container"><div class="rivto-block-children" data-block-drop-axis="vertical">${ids.map((id) => `<div class="rivto-block" data-block-id="${id}"><div class="rivto-block-row"></div></div>`).join("")}</div></div>`;
  document.body.append(root);
  editor.attach(root);
  const list = root.querySelector<HTMLElement>(".rivto-block-children")!;
  const reads = mockVerticalRectangles(list);
  jest.spyOn(root.firstElementChild!, "getBoundingClientRect").mockReturnValue({
    left: 80,
    right: 320,
    top: 50,
    bottom: count * 40 + 150,
    width: 240,
    height: count * 40 + 100,
  } as DOMRect);
  try {
    const targets = new BlockOutlineDropTargets(editor, null);
    const previous = ids[count - 2]!;
    const y = 132 + (count - 2) * 40;
    expect(targets.resolve(112, y, new Set(), list)?.destination).toEqual({
      kind: "between",
      parentId: "container",
      previousId: previous,
      nextId: ids[count - 1],
    });
    reads.mockClear();
    const nested = targets.resolve(136, y, new Set(), list);
    expect(nested?.destination).toEqual({
      kind: "between",
      parentId: previous,
      previousId: null,
      nextId: null,
    });
    expect(nested?.indicator).toMatchObject({ left: 124, height: 2 });
    expect(reads.mock.calls.length).toBeLessThanOrEqual(Math.ceil(Math.log2(count)) + 4);
  } finally {
    editor.destroy();
    root.remove();
  }
});

/**
 * Supplies spaced child rows and counts only their layout measurements.
 *
 * @param list - Mounted fixture child host containing one row per block shell.
 * @returns Spy called once for each measured shell or row rectangle.
 */
function mockVerticalRectangles(list: HTMLElement): jest.Mock {
  const reads = jest.fn();
  for (const [index, shell] of Array.from(list.children).entries()) {
    const rect = {
      left: 100,
      right: 300,
      width: 200,
      top: 100 + index * 40,
      bottom: 124 + index * 40,
      height: 24,
    } as DOMRect;
    for (const element of [shell, shell.firstElementChild!]) {
      jest.spyOn(element, "getBoundingClientRect").mockImplementation(() => {
        reads();
        return rect;
      });
    }
  }
  return reads;
}
