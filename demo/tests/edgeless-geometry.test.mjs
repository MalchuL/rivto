import assert from "node:assert/strict";
import test from "node:test";
import {
  canvasDelta,
  owningRootIds,
  rootOwnerId,
  rootsInRect,
  translatedLayouts,
} from "../../packages/react/src/extensions/edgeless-geometry.ts";

const block = (id, children = [], x = 0, y = 0) => ({
  id, type: "paragraph", content: id, props: {}, pluginData: {}, children,
  layout: { x, y, width: 320, height: 120, zIndex: 0 },
});

test("resolves nested selections to unique document-ordered roots", () => {
  const blocks = [block("a", [block("b", [block("c")])]), block("d")];
  assert.equal(rootOwnerId(blocks, "c"), "a");
  assert.equal(rootOwnerId(blocks, "missing"), undefined);
  assert.deepEqual(owningRootIds(blocks, ["d", "b", "c"]), ["a", "d"]);
});

test("rectangle selection intersects roots only", () => {
  const roots = [
    { id: "a", rect: { left: 10, top: 10, right: 110, bottom: 110 } },
    { id: "b", rect: { left: 150, top: 10, right: 250, bottom: 110 } },
  ];
  assert.deepEqual(rootsInRect(roots, { left: 80, top: 50, right: 180, bottom: 80 }), ["a", "b"]);
});

test("movement accounts for zoom and preserves selected order", () => {
  const blocks = [block("a", [], 10, 20), block("b", [], 50, 60)];
  assert.equal(canvasDelta(20, 2), 10);
  assert.deepEqual(translatedLayouts(blocks, ["b", "a"], 5, -3), [
    { id: "b", layout: { x: 55, y: 57 } },
    { id: "a", layout: { x: 15, y: 17 } },
  ]);
});
