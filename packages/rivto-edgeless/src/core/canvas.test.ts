import { jest } from "@jest/globals";
import { Canvas } from "./canvas";
import type { CanvasElement } from "../types/canvas";

/**
 * Creates a projected test rectangle without a document dependency.
 * @param id - Stable test ID.
 * @param x - Horizontal world position.
 * @returns A selectable square.
 */
function node(id: string, x = 0): CanvasElement {
  return { id, frame: { x, y: 0, width: 100, height: 100 }, rotation: 0, zIndex: 1 };
}

test("virtualizes full geometry and keeps camera-only updates out of element subscribers", () => {
  const canvas = new Canvas({ overscan: 0 });
  canvas.setViewport(500, 400);
  canvas.setElements(Array.from({ length: 10000 }, (_, index) => node(String(index), index * 200)));
  expect(canvas.visible.get()).toEqual(["0", "1", "2"]);
  const listener = jest.fn();
  canvas.elementStore("0").subscribe(listener);
  const visible = canvas.visible.get();
  canvas.setCamera({ x: -10, y: 0, zoom: 1 });
  expect(canvas.visible.get()).toBe(visible);
  expect(listener).not.toHaveBeenCalled();
  canvas.setCamera({ x: -1000, y: 0, zoom: 1 });
  expect(canvas.visible.get()).toEqual(["5", "6", "7"]);
  expect(canvas.query({ x: 1800, y: 0, width: 100, height: 100 })).toEqual(["9"]);
});

test("uses painted bounds, rotation, stacking order and independently released pins", () => {
  const canvas = new Canvas({ overscan: 0 });
  canvas.setViewport(100, 100);
  canvas.setElements([
    { ...node("crossing", 2000), bounds: { x: -200, y: 30, width: 5000, height: 1 }, zIndex: 0 },
    node("far", 1000),
    node("near"),
  ]);
  expect(canvas.visible.get()).toEqual(["crossing", "near"]);
  const a = canvas.pin(["far"]),
    b = canvas.pin(["far"]);
  a();
  a();
  expect(canvas.visible.get()).toContain("far");
  b();
  expect(canvas.visible.get()).not.toContain("far");
});

test("zooms around a stable world anchor and clamps scale", () => {
  const canvas = new Canvas({ minZoom: 0.5, maxZoom: 2 });
  canvas.setCamera({ x: 40, y: -20, zoom: 1 });
  const before = canvas.toWorld({ x: 200, y: 100 });
  canvas.zoomAt(10, { x: 200, y: 100 });
  expect(canvas.camera.get().zoom).toBe(2);
  expect(canvas.toWorld({ x: 200, y: 100 })).toEqual(before);
  expect(canvas.toViewport(before)).toEqual({ x: 200, y: 100 });
});

test("previews without source writes, commits once, and restores rejected or cancelled geometry", () => {
  let commits = 0;
  const canvas = new Canvas({
    onTransformCommit: ({ changes }) => {
      commits++;
      canvas.updateElements(changes.map((change) => ({ ...node(change.id), ...change })));
    },
  });
  canvas.setElements([node("a")]);
  canvas.beginTransform("resize", ["a"]);
  canvas.previewTransform([{ id: "a", frame: { ...node("a").frame, width: 300 }, rotation: 0 }]);
  expect(canvas.getElements()[0].frame.width).toBe(100);
  expect(canvas.getElement("a")!.frame.width).toBe(300);
  canvas.commitTransform();
  expect(commits).toBe(1);
  expect(canvas.getElement("a")!.frame.width).toBe(300);
  canvas.beginTransform("move", ["a"]);
  canvas.previewTransform([{ id: "a", frame: node("a", 900).frame, rotation: 0 }]);
  canvas.cancelTransform();
  expect(canvas.getElement("a")!.frame.x).toBe(0);
  expect(commits).toBe(1);
});

test("external changes cancel an active gesture; unrelated updates do not", () => {
  const cancel = jest.fn();
  const canvas = new Canvas({ onTransformCancel: cancel });
  canvas.setElements([node("a"), node("b")]);
  canvas.beginTransform("move", ["a"]);
  canvas.updateElements([node("b", 400)]);
  expect(canvas.transform.get()).not.toBeNull();
  canvas.updateElements([node("a", 200)]);
  expect(canvas.transform.get()).toBeNull();
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(canvas.getElement("a")!.frame.x).toBe(200);
});

test("failed commits restore source geometry and validation rejects a batch before mutation", () => {
  const canvas = new Canvas({
    onTransformCommit: () => {
      throw new Error("rejected");
    },
  });
  canvas.setElements([node("a")]);
  canvas.beginTransform("move", ["a"]);
  canvas.previewTransform([{ id: "a", frame: node("a", 500).frame, rotation: 0 }]);
  expect(() => canvas.commitTransform()).toThrow("rejected");
  expect(canvas.getElement("a")!.frame.x).toBe(0);
  expect(canvas.transform.get()).toBeNull();
  expect(() => canvas.updateElements([node("a", 30), node("invalid", NaN)])).toThrow();
  expect(canvas.getElement("a")!.frame.x).toBe(0);
});

test("unchanged clicks do not commit and non-geometric source updates preserve a live preview", () => {
  const commit = jest.fn<() => void>();
  const canvas = new Canvas({ onTransformCommit: commit });
  canvas.setElements([node("a")]);
  canvas.beginTransform("move", ["a"]);
  canvas.commitTransform();
  expect(commit).not.toHaveBeenCalled();
  canvas.beginTransform("move", ["a"]);
  canvas.previewTransform([{ id: "a", frame: node("a", 450).frame, rotation: 0 }]);
  canvas.updateElements([{ ...node("a"), zIndex: 10 }]);
  expect(canvas.getElement("a")!.frame.x).toBe(450);
  expect(canvas.getElement("a")!.zIndex).toBe(10);
  canvas.cancelTransform();
  expect(canvas.getElement("a")!.frame.x).toBe(0);
});

test("preview callback failures release temporary geometry and participant pins", () => {
  const canvas = new Canvas({
    overscan: 0,
    onTransformPreview: () => {
      throw new Error("preview failed");
    },
  });
  canvas.setViewport(100, 100);
  canvas.setElements([node("a", 1000)]);
  canvas.beginTransform("move", ["a"]);
  expect(canvas.visible.get()).toContain("a");
  expect(() =>
    canvas.previewTransform([{ id: "a", frame: node("a", 200).frame, rotation: 0 }]),
  ).toThrow("preview failed");
  expect(canvas.transform.get()).toBeNull();
  expect(canvas.visible.get()).toEqual([]);
  expect(canvas.getElement("a")!.frame.x).toBe(1000);
});

test("disposal releases observers even when consumer cancellation throws", () => {
  const canvas = new Canvas({
    onTransformCancel: () => {
      throw new Error("cancel failed");
    },
  });
  canvas.setElements([node("a")]);
  canvas.beginTransform("move", ["a"]);
  const listener = jest.fn();
  canvas.camera.subscribe(listener);
  expect(() => canvas.dispose()).toThrow("cancel failed");
  expect(canvas.transform.get()).toBeNull();
  canvas.setCamera({ x: 100, y: 100, zoom: 1 });
  expect(listener).not.toHaveBeenCalled();
});

test("transform capabilities are independent and require the entire requested selection", () => {
  const canvas = new Canvas();
  canvas.setElements([
    { ...node("rotate"), movable: false, resizable: false },
    { ...node("resize"), movable: false, rotatable: false },
    { ...node("move"), resizable: false, rotatable: false },
    node("all"),
  ]);
  for (const kind of ["move", "resize", "rotate"] as const) {
    expect(canvas.canTransform(kind, [kind])).toBe(true);
    expect(canvas.canTransform(kind, [kind, "all"])).toBe(true);
    expect(canvas.canTransform(kind, ["move", "resize", "rotate"])).toBe(false);
    expect(canvas.canTransform(kind, [])).toBe(false);
    expect(canvas.canTransform(kind, ["missing"])).toBe(false);
    canvas.setSelection([kind]);
    expect(canvas.canTransform(kind)).toBe(true);
  }
});

test("camera movement reuses stacking order and updates preserve stable ties", () => {
  const canvas = new Canvas({ overscan: 0 });
  canvas.setViewport(500, 500);
  let stackingReads = 0;
  const back: CanvasElement = {
    ...node("back"),
    /**
     * Counts stacking reads independently of bounds scans.
     *
     * @returns Fixed background stacking order.
     */
    get zIndex() {
      stackingReads++;
      return 0;
    },
  };
  canvas.setElements([node("first"), back, node("second")]);
  expect(canvas.visible.get()).toEqual(["back", "first", "second"]);
  stackingReads = 0;
  canvas.setCamera({ x: 1, y: 0, zoom: 1 });
  canvas.setCamera({ x: 2, y: 0, zoom: 1 });
  expect(stackingReads).toBe(0);
  canvas.updateElements([{ ...node("second"), zIndex: -1 }]);
  expect(canvas.visible.get()).toEqual(["second", "back", "first"]);
  canvas.updateElements([node("first")], ["first"]);
  canvas.updateElements([node("second")]);
  expect(canvas.visible.get()).toEqual(["back", "second", "first"]);
  canvas.dispose();
});
