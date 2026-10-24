import { BlockEditorController } from "../block-editor-controller";
import { TestBlockEditorAdapter } from "../../test-utils/test-block-editor-adapter";
import type { BlockDropDestination } from "./types";

let adapter: TestBlockEditorAdapter;
let editor: BlockEditorController;
let root: HTMLDivElement;
let outer: HTMLDivElement;
let inner: HTMLDivElement;
let hit: jest.Mock;
let previousHitTest: PropertyDescriptor | undefined;

beforeEach(() => {
  adapter = new TestBlockEditorAdapter();
  adapter.setNode("parent", { childIds: ["a", "b"] });
  editor = new BlockEditorController({ adapter });
  root = document.createElement("div");
  root.setAttribute("data-rivto-block-editor", "true");
  outer = document.createElement("div");
  inner = document.createElement("div");
  outer.append(inner);
  root.append(outer);
  document.body.append(root);
  editor.attach(root);
  hit = jest.fn(() => inner);
  previousHitTest = Object.getOwnPropertyDescriptor(document, "elementFromPoint");
  Object.defineProperty(document, "elementFromPoint", { value: hit, configurable: true });
});
afterEach(() => {
  editor.destroy();
  root.remove();
  if (previousHitTest) {
    Object.defineProperty(document, "elementFromPoint", previousHitTest);
  } else {
    Reflect.deleteProperty(document, "elementFromPoint");
  }
});

it("uses priority, nearest ancestor, and earliest duplicate registration in that order", () => {
  const inside = { kind: "inside", parentId: "parent" } as const;
  const gap = { kind: "between", parentId: "parent", previousId: "a", nextId: "b" } as const;
  editor.dropTargets.register({ element: outer, getDestination: () => inside });
  const stop = editor.dropTargets.register({ element: inner, getDestination: () => gap });
  editor.dropTargets.register({ element: inner, getDestination: () => inside });
  expect(editor.dropTargets.resolve(10, 20)).toEqual({ element: inner, destination: gap });
  const higher = editor.dropTargets.register({
    element: outer,
    priority: 1,
    getDestination: () => inside,
  });
  expect(editor.dropTargets.resolve(10, 20)?.element).toBe(outer);
  higher();
  stop();
  stop();
  expect(editor.dropTargets.resolve(10, 20)?.destination).toBe(inside);
});

it("reads updated destinations and validates neighbors against live canonical data", () => {
  let destination: BlockDropDestination = {
    kind: "between",
    parentId: "parent",
    previousId: "a",
    nextId: "b",
  };
  editor.dropTargets.register({ element: inner, getDestination: () => destination });
  expect(editor.dropTargets.resolve(0, 0)?.destination).toBe(destination);
  adapter.setNode("parent", { childIds: ["b", "a"] });
  expect(editor.dropTargets.resolve(0, 0)).toBeUndefined();
  destination = { kind: "between", parentId: "parent", previousId: null, nextId: "b" };
  expect(editor.dropTargets.resolve(0, 0)?.destination).toBe(destination);
  destination = { kind: "between", parentId: "parent", previousId: "a", nextId: null };
  expect(editor.dropTargets.resolve(0, 0)?.destination).toBe(destination);
  adapter.deleteNode("parent");
  expect(editor.dropTargets.resolve(0, 0)).toBeUndefined();
});

it("keeps explicit feedback beside a stationary strip across retained source space", () => {
  adapter.setNode("parent", { childIds: ["a", "source", "b"] });
  outer.className = "rivto-block-children";
  outer.dataset.blockDropAxis = "vertical";
  const items = ["a", "source", "b"].map((id, index) => {
    const item = document.createElement("div");
    item.dataset.blockItemId = id;
    outer.append(item);
    jest
      .spyOn(item, "getBoundingClientRect")
      .mockReturnValue({
        left: 10,
        top: index * 100,
        bottom: index * 100 + 80,
        width: 100,
        height: 80,
      } as DOMRect);
    return item;
  });
  items[0]!.append(inner);
  jest
    .spyOn(inner, "getBoundingClientRect")
    .mockReturnValue({ left: 10, top: 72, width: 100, height: 8 } as DOMRect);
  editor.dropTargets.register({
    element: inner,
    indicatorAxis: "horizontal",
    getDestination: () => ({
      kind: "between",
      parentId: "parent",
      previousId: "a",
      nextId: "source",
    }),
  });
  const target = editor.dropTargets.resolveHit(inner, new Set(["source"]));
  expect(target?.destination).toEqual({
    kind: "between",
    parentId: "parent",
    previousId: "a",
    nextId: "b",
  });
  expect(target?.indicator).toEqual({ left: 10, top: 75, width: 100, height: 2 });
});

it("accepts the empty canonical gap but rejects invented start, end, and missing neighbors", () => {
  let destination: BlockDropDestination = {
    kind: "between",
    parentId: "parent",
    previousId: null,
    nextId: null,
  };
  editor.dropTargets.register({ element: inner, getDestination: () => destination });
  expect(editor.dropTargets.resolve(0, 0)).toBeUndefined();
  adapter.setNode("parent", { childIds: [] });
  expect(editor.dropTargets.resolve(0, 0)?.destination).toBe(destination);
  destination = { kind: "between", parentId: "parent", previousId: null, nextId: "missing" };
  expect(editor.dropTargets.resolve(0, 0)).toBeUndefined();
  destination = { kind: "between", parentId: "parent", previousId: "missing", nextId: null };
  expect(editor.dropTargets.resolve(0, 0)).toBeUndefined();
});

it("ignores foreign editor hits, detached views, outside hits, and invalid coordinates", () => {
  editor.dropTargets.register({
    element: outer,
    getDestination: () => ({ kind: "inside", parentId: "parent" }),
  });
  inner.setAttribute("data-rivto-block-editor", "true");
  expect(editor.dropTargets.resolve(0, 0)).toBeUndefined();
  inner.removeAttribute("data-rivto-block-editor");
  hit.mockReturnValue(document.body);
  expect(editor.dropTargets.resolve(0, 0)).toBeUndefined();
  hit.mockReturnValue(null);
  expect(editor.dropTargets.resolve(0, 0)).toBeUndefined();
  hit.mockClear();
  expect(editor.dropTargets.resolve(NaN, 0)).toBeUndefined();
  expect(editor.dropTargets.resolve(0, Infinity)).toBeUndefined();
  expect(hit).not.toHaveBeenCalled();
  root.remove();
  expect(editor.dropTargets.resolve(0, 0)).toBeUndefined();
});

it.each([5, 2000])(
  "does not read any unrelated destination or geometry among %i regions",
  (count) => {
    const unrelated = jest.fn(() => ({ kind: "inside", parentId: "parent" }) as const);
    for (let index = 0; index < count; index++) {
      const element = document.createElement("div");
      root.append(element);
      editor.dropTargets.register({ element, getDestination: unrelated });
    }
    const measured = jest.spyOn(inner, "getBoundingClientRect");
    editor.dropTargets.register({
      element: inner,
      getDestination: () => ({ kind: "inside", parentId: "parent" }),
    });
    adapter.blocks.getBlockNode.mockClear();
    adapter.blocks.getBlockIds.mockClear();
    expect(editor.dropTargets.resolve(0, 0)?.element).toBe(inner);
    expect(adapter.blocks.getBlockNode).toHaveBeenCalledTimes(1);
    expect(adapter.blocks.getBlockIds).not.toHaveBeenCalled();
    expect(unrelated).not.toHaveBeenCalled();
    expect(measured).not.toHaveBeenCalled();
    expect(hit).toHaveBeenCalledTimes(1);
  },
);

it("captures extension ownership and rejects new work after destruction", () => {
  const remove = editor.extensions.register("targets", {
    setup: () => {
      editor.dropTargets.register({
        element: inner,
        getDestination: () => ({ kind: "inside", parentId: "parent" }),
      });
    },
  });
  expect(editor.dropTargets.resolve(0, 0)).toBeDefined();
  remove();
  expect(editor.dropTargets.resolve(0, 0)).toBeUndefined();
  expect(() =>
    editor.dropTargets.register({ element: inner, priority: NaN, getDestination: () => undefined }),
  ).toThrow("finite");
  editor.destroy();
  expect(() => editor.dropTargets.resolve(0, 0)).toThrow("destroyed");
  expect(() =>
    editor.dropTargets.register({ element: inner, getDestination: () => undefined }),
  ).toThrow("destroyed");
});

it("validates root gaps against explicit canonical roots independently of display IDs", () => {
  adapter.rootIds = ["first", "last"];
  adapter.setBlockIds(["unrelated"]);
  let destination: BlockDropDestination = {
    kind: "between",
    parentId: null,
    previousId: "first",
    nextId: "last",
  };
  editor.dropTargets.register({ element: inner, getDestination: () => destination });
  expect(editor.dropTargets.resolve(10, 20)?.destination).toEqual(destination);
  adapter.rootIds = ["first", "inserted", "last"];
  expect(editor.dropTargets.resolve(10, 20)).toBeUndefined();
  adapter.rootIds = [];
  destination = { kind: "between", parentId: null, previousId: null, nextId: null };
  expect(editor.dropTargets.resolve(10, 20)?.destination).toEqual(destination);
  destination = { kind: "inside", parentId: null };
  expect(editor.dropTargets.resolve(10, 20)?.destination).toEqual(destination);
  adapter.rootIds = undefined;
  expect(editor.dropTargets.resolve(10, 20)).toBeUndefined();
  expect(adapter.blocks.getBlockIds).not.toHaveBeenCalled();
});

it("validates the registered gap before excluding captured roots from both neighbors", () => {
  adapter.setNode("parent", { childIds: ["before", "a", "b", "after"] });
  const destination = {
    kind: "between",
    parentId: "parent",
    previousId: "a",
    nextId: "b",
  } as const;
  editor.dropTargets.register({ element: inner, getDestination: () => destination });
  expect(editor.dropTargets.resolve(10, 20, new Set(["a", "b"]))?.destination).toEqual({
    kind: "between",
    parentId: "parent",
    previousId: "before",
    nextId: "after",
  });
  adapter.setNode("parent", { childIds: ["before", "a", "inserted", "b", "after"] });
  expect(editor.dropTargets.resolve(10, 20, new Set(["a", "b"]))).toBeUndefined();
});

it.each(["horizontal", "vertical"] as const)(
  "measures only the winning between region for a %s insertion line",
  (indicatorAxis) => {
    const outerRead = jest.spyOn(outer, "getBoundingClientRect");
    const innerRead = jest.spyOn(inner, "getBoundingClientRect").mockReturnValue({
      left: 10,
      top: 20,
      width: 100,
      height: 40,
    } as DOMRect);
    const destination = {
      kind: "between",
      parentId: "parent",
      previousId: "a",
      nextId: "b",
    } as const;
    editor.dropTargets.register({
      element: outer,
      indicatorAxis,
      getDestination: () => destination,
    });
    editor.dropTargets.register({
      element: inner,
      indicatorAxis,
      getDestination: () => destination,
    });
    expect(editor.dropTargets.resolve(15, 25)?.indicator).toEqual(
      indicatorAxis === "horizontal"
        ? { left: 10, top: 39, width: 100, height: 2 }
        : { left: 59, top: 20, width: 2, height: 40 },
    );
    expect(innerRead).toHaveBeenCalledTimes(1);
    expect(outerRead).not.toHaveBeenCalled();
    editor.dropTargets.register({
      element: inner,
      indicatorAxis,
      priority: 1,
      getDestination: () => ({ kind: "inside", parentId: "parent" }),
    });
    expect(editor.dropTargets.resolve(15, 25)?.indicator).toBeUndefined();
    expect(innerRead).toHaveBeenCalledTimes(1);
  },
);

it("uses the current native hit without another lookup and still validates live hierarchy", () => {
  const destination = {
    kind: "between",
    parentId: "parent",
    previousId: "a",
    nextId: "b",
  } as const;
  editor.dropTargets.register({ element: inner, getDestination: () => destination });
  expect(editor.dropTargets.resolve(10, 20, undefined, inner)?.destination).toEqual(destination);
  expect(hit).not.toHaveBeenCalled();
  adapter.setNode("parent", { childIds: ["b", "a"] });
  expect(editor.dropTargets.resolve(10, 20, undefined, inner)).toBeUndefined();
  expect(hit).not.toHaveBeenCalled();
  expect(
    editor.dropTargets.resolve(10, 20, undefined, document.createElement("div")),
  ).toBeUndefined();
  expect(hit).toHaveBeenCalledTimes(1);
  editor.dropTargets.resolve(10, 20);
  expect(hit).toHaveBeenCalledTimes(2);
});

it.each([
  ["horizontal", true, { left: 10, top: 19, width: 100, height: 2 }],
  ["horizontal", false, { left: 10, top: 99, width: 100, height: 2 }],
  ["vertical", true, { left: 9, top: 20, width: 2, height: 80 }],
  ["vertical", false, { left: 109, top: 20, width: 2, height: 80 }],
] as const)(
  "places %s list-end feedback on the item edge, before=%s",
  (indicatorAxis, before, expected) => {
    outer.dataset.blockItemId = before ? "a" : "b";
    jest.spyOn(outer, "getBoundingClientRect").mockReturnValue({
      left: 10,
      top: 20,
      right: 110,
      bottom: 100,
      width: 100,
      height: 80,
    } as DOMRect);
    const regionRead = jest.spyOn(inner, "getBoundingClientRect");
    editor.dropTargets.register({
      element: inner,
      indicatorAxis,
      getDestination: () => ({
        kind: "between",
        parentId: "parent",
        previousId: before ? null : "b",
        nextId: before ? "a" : null,
      }),
    });
    expect(editor.dropTargets.resolve(15, 25)?.indicator).toEqual(expected);
    expect(regionRead).not.toHaveBeenCalled();
  },
);
