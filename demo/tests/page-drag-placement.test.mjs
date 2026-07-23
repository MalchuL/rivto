import assert from "node:assert/strict";
import test from "node:test";
import { resolveAfterDropPlacement } from "../../packages/react/src/plugins/page-drag-placement.ts";

const block = (id, children = []) => ({ id, children });

test("offers every available depth after a final nested leaf", () => {
  const document = [block("A", [block("B", [block("C")])])];

  assert.deepEqual(resolveAfterDropPlacement(document, "C", -2), {
    targetId: "A", position: "after", depth: 0, depthOffset: -2,
  });
  assert.deepEqual(resolveAfterDropPlacement(document, "C", -1), {
    targetId: "B", position: "after", depth: 1, depthOffset: -1,
  });
  assert.deepEqual(resolveAfterDropPlacement(document, "C", 0), {
    targetId: "C", position: "after", depth: 2, depthOffset: 0,
  });
  assert.deepEqual(resolveAfterDropPlacement(document, "C", 1), {
    targetId: "C", position: "inside", depth: 3, depthOffset: 1,
  });
});

test("does not offer an ancestor level before later siblings", () => {
  const document = [block("A", [block("B", [block("C"), block("E")])])];

  assert.deepEqual(resolveAfterDropPlacement(document, "C", -10), {
    targetId: "C", position: "after", depth: 2, depthOffset: 0,
  });
});

test("a non-empty parent gap inserts before its first child", () => {
  const document = [block("A", [block("B"), block("C")])];

  for (const offset of [-10, 0, 10]) {
    assert.deepEqual(resolveAfterDropPlacement(document, "A", offset), {
      targetId: "B", position: "before", depth: 1, depthOffset: 1,
    });
  }
});

test("an empty parent gap creates its first child", () => {
  assert.deepEqual(resolveAfterDropPlacement([block("A")], "A", 1), {
    targetId: "A", position: "inside", depth: 1, depthOffset: 1,
  });
});

test("returns undefined for a removed target", () => {
  assert.equal(resolveAfterDropPlacement([block("A")], "missing", 0), undefined);
});
