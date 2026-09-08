/**
 * Regression tests for connector live-preview membership during transforms.
 *
 * Gesture start snapshots this list once; pointermove must not scan unrelated
 * connectors or treat a rigid two-end move as a path rebuild.
 */
import { attachedConnectorsForTransform } from "./edgeless-transform-connectors";

const endpoint = (elementId?: string) => ({
  elementId,
  anchor: { x: 0.5, y: 0.5 },
  position: { x: 0, y: 0 },
});

const connector = (id: string, sourceId?: string, targetId?: string) => ({
  id,
  type: "connector",
  props: { source: endpoint(sourceId), target: endpoint(targetId) },
});

const shape = (id: string) => ({ id, type: "rectangle", props: {} });

describe("attachedConnectorsForTransform", () => {
  test("returns nothing when the canvas has no connectors", () => {
    expect(attachedConnectorsForTransform(
      [shape("a"), shape("b")],
      new Set(["a"]),
      new Set(["a"]),
      "move",
    )).toEqual([]);
  });

  test("excludes connectors whose endpoints are not moving", () => {
    expect(attachedConnectorsForTransform(
      [shape("a"), shape("b"), shape("c"), connector("link", "b", "c")],
      new Set(["a"]),
      new Set(["a"]),
      "move",
    )).toEqual([]);
  });

  test("includes a path rebuild when only the source object moves", () => {
    expect(attachedConnectorsForTransform(
      [shape("a"), shape("b"), connector("link", "a", "b")],
      new Set(["a"]),
      new Set(["a"]),
      "move",
    )).toEqual([{
      id: "link",
      kind: "path",
      sourceMoves: true,
      targetMoves: false,
      connectorMoves: false,
    }]);
  });

  test("includes a path rebuild when only the target object moves", () => {
    expect(attachedConnectorsForTransform(
      [shape("a"), shape("b"), connector("link", "a", "b")],
      new Set(["b"]),
      new Set(["b"]),
      "move",
    )).toEqual([{
      id: "link",
      kind: "path",
      sourceMoves: false,
      targetMoves: true,
      connectorMoves: false,
    }]);
  });

  test("uses CSS translate when both attached endpoints move with the selection", () => {
    expect(attachedConnectorsForTransform(
      [shape("a"), shape("b"), connector("link", "a", "b")],
      new Set(["a", "b"]),
      new Set(["a", "b"]),
      "move",
    )).toEqual([{
      id: "link",
      kind: "translate",
      sourceMoves: true,
      targetMoves: true,
      connectorMoves: false,
    }]);
  });

  test("rebuilds the path when both ends move during rotate", () => {
    expect(attachedConnectorsForTransform(
      [shape("a"), shape("b"), connector("link", "a", "b")],
      new Set(["a", "b"]),
      new Set(["a"]),
      "rotate",
    )).toEqual([{
      id: "link",
      kind: "path",
      sourceMoves: true,
      targetMoves: true,
      connectorMoves: false,
    }]);
  });

  test("rebuilds the path when both ends move during resize", () => {
    expect(attachedConnectorsForTransform(
      [shape("a"), shape("b"), connector("link", "a", "b")],
      new Set(["a"]),
      new Set(["a"]),
      "resize",
    )).toEqual([{
      id: "link",
      kind: "path",
      sourceMoves: true,
      targetMoves: false,
      connectorMoves: false,
    }]);
  });

  test("ignores a selected connector whose attached anchors stay put", () => {
    expect(attachedConnectorsForTransform(
      [shape("a"), shape("b"), connector("link", "a", "b")],
      new Set(["link"]),
      new Set(["link"]),
      "move",
    )).toEqual([]);
  });

  test("translates a selected connector with two free endpoints", () => {
    expect(attachedConnectorsForTransform(
      [connector("link"), shape("a")],
      new Set(["link"]),
      new Set(["link"]),
      "move",
    )).toEqual([{
      id: "link",
      kind: "translate",
      sourceMoves: false,
      targetMoves: false,
      connectorMoves: true,
    }]);
  });
});
