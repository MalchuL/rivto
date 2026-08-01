import assert from "node:assert/strict";
import test from "node:test";
import {
  counterBlockDefinition,
  sliderBlockDefinition,
} from "../src/blocks/custom-block-definitions.ts";

test("custom block definitions expose defaults and reject invalid properties", () => {
  assert.deepEqual(sliderBlockDefinition.defaultProps, { value: 50 });
  assert.deepEqual(counterBlockDefinition.defaultProps, { count: 0 });
  assert.deepEqual(sliderBlockDefinition.propSchema.parse({ value: 0 }), { value: 0 });
  assert.deepEqual(sliderBlockDefinition.propSchema.parse({ value: 100 }), { value: 100 });
  assert.throws(() => sliderBlockDefinition.propSchema.parse({ value: 101 }));
  assert.throws(() => counterBlockDefinition.propSchema.parse({ count: -1 }));
  assert.throws(() => counterBlockDefinition.propSchema.parse({ count: 1.5 }));
  assert.equal(counterBlockDefinition.toRawText({ props: { count: 7 } }), "Count: 7");
});
