import assert from "node:assert/strict";
import test from "node:test";
import {
  canvasDelta,
  rootsInRect,
} from "../../packages/react-rivto-editor/src/extensions/edgeless/edgeless-geometry.ts";

test("rectangle selection intersects roots only", () => {
  const roots = [
    { id: "a", rect: { left: 10, top: 10, right: 110, bottom: 110 } },
    { id: "b", rect: { left: 150, top: 10, right: 250, bottom: 110 } },
  ];
  assert.deepEqual(rootsInRect(roots, { left: 80, top: 50, right: 180, bottom: 80 }), ["a", "b"]);
});

test("movement accounts for zoom", () => {
  assert.equal(canvasDelta(20, 2), 10);
});
