import assert from "node:assert/strict";
import test from "node:test";
import { evaluateMathSource } from "../src/extensions/host-blocks/math-value.ts";

test("evaluates each line in one scope and preserves blank lines", () => {
  assert.deepEqual(evaluateMathSource("a = 2\n\na * 4\nsin(pi / 2)"), [
    { value: "2", error: null },
    { value: "", error: null },
    { value: "8", error: null },
    { value: "1", error: null },
  ]);
  assert.deepEqual(evaluateMathSource(""), [{ value: "", error: null }]);
  assert.deepEqual(evaluateMathSource("   \n"), [
    { value: "", error: null },
    { value: "", error: null },
  ]);
});

test("reports errors on their own lines and continues with the existing scope", () => {
  const results = evaluateMathSource("a = 2\n1 +\na + 3\nmissing + 1");
  assert.equal(results[0].value, "2");
  assert.ok(results[1].error);
  assert.deepEqual(results[2], { value: "5", error: null });
  assert.match(results[3].error ?? "", /Undefined symbol/);
});
