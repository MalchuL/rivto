import assert from "node:assert/strict";
import test from "node:test";
import { evaluateMathSource } from "../src/extensions/host-blocks/math-value.ts";

test("mathjs evaluates a multiline scope and reports invalid lines", () => {
  assert.deepEqual(evaluateMathSource("1 + 1"), { value: "2", error: null });
  assert.deepEqual(evaluateMathSource("2 ^ 8"), { value: "256", error: null });
  assert.deepEqual(evaluateMathSource("sin(pi / 2)"), { value: "1", error: null });
  assert.deepEqual(evaluateMathSource("a = 2\na + 3"), { value: "5", error: null });
  assert.deepEqual(evaluateMathSource("a = 2\n\na * 4"), { value: "8", error: null });
  assert.deepEqual(evaluateMathSource(""), { value: "", error: null });
  assert.deepEqual(evaluateMathSource("   \n"), { value: "", error: null });

  const invalid = evaluateMathSource("1 +");
  assert.equal(invalid.value, "");
  assert.equal(typeof invalid.error, "string");
  assert.ok(invalid.error.length > 0);

  const undefinedSymbol = evaluateMathSource("missing + 1");
  assert.equal(undefinedSymbol.value, "");
  assert.match(undefinedSymbol.error ?? "", /Undefined symbol/);
});
