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
