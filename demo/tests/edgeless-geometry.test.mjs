import assert from "node:assert/strict";
import test from "node:test";
import { Canvas } from "@chulane/rivto-edgeless";

test("rectangle selection intersects roots only", () => {
  const canvas = new Canvas();
  canvas.setElements([
    { id: "a", frame: { x: 10, y: 10, width: 100, height: 100 }, rotation: 0, zIndex: 0 },
    { id: "b", frame: { x: 150, y: 10, width: 100, height: 100 }, rotation: 0, zIndex: 0 },
  ]);
  assert.deepEqual(canvas.query({ x: 80, y: 50, width: 100, height: 30 }), ["a", "b"]);
});

test("movement accounts for zoom", () => {
  const canvas = new Canvas();
  canvas.setCamera({ x: 0, y: 0, zoom: 2 });
  assert.equal(canvas.toWorld({ x: 20, y: 0 }).x, 10);
});
