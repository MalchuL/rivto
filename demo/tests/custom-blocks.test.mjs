import assert from "node:assert/strict";
import test from "node:test";
import {
  counterBlockDefinition,
  sliderBlockDefinition,
} from "../src/blocks/custom-block-definitions.ts";
import {
  bookmarkBlockDefinition,
  calloutBlockDefinition,
  isHttpUrl,
  mathEquationBlockDefinition,
  tableOfContentsBlockDefinition,
} from "../src/blocks/host-block-definitions.ts";

test("custom block definitions expose defaults and reject invalid properties", () => {
  assert.deepEqual(sliderBlockDefinition.defaultProps, { value: 50 });
  assert.deepEqual(counterBlockDefinition.defaultProps, { count: 0 });
  assert.deepEqual(sliderBlockDefinition.propSchema.parse({ value: 0 }), { value: 0 });
  assert.deepEqual(sliderBlockDefinition.propSchema.parse({ value: 100 }), { value: 100 });
  assert.throws(() => sliderBlockDefinition.propSchema.parse({ value: 101 }));
  assert.throws(() => counterBlockDefinition.propSchema.parse({ count: -1 }));
  assert.throws(() => counterBlockDefinition.propSchema.parse({ count: 1.5 }));
});

test("host block definitions expose defaults and reject invalid callout and URL data", () => {
  assert.deepEqual(calloutBlockDefinition.defaultProps, { variant: "note", emoji: "💡" });
  assert.deepEqual(bookmarkBlockDefinition.defaultProps, { url: "", description: "" });
  assert.deepEqual(tableOfContentsBlockDefinition.defaultProps, {});
  assert.deepEqual(mathEquationBlockDefinition.defaultProps, {});
  assert.deepEqual(
    calloutBlockDefinition.propSchema.parse(calloutBlockDefinition.defaultProps),
    { variant: "note", emoji: "💡" },
  );
  assert.deepEqual(calloutBlockDefinition.propSchema.parse({ variant: "tip", emoji: "✅" }), {
    variant: "tip",
    emoji: "✅",
  });
  assert.deepEqual(calloutBlockDefinition.propSchema.parse({ variant: "warning", emoji: "⚠️" }), {
    variant: "warning",
    emoji: "⚠️",
  });
  assert.throws(() => calloutBlockDefinition.propSchema.parse({ variant: "danger", emoji: "💡" }));
  assert.throws(() => calloutBlockDefinition.propSchema.parse({ variant: "note", emoji: "" }));

  assert.equal(isHttpUrl("https://example.com/docs"), true);
  assert.equal(isHttpUrl("http://localhost:3000"), true);
  assert.equal(isHttpUrl(""), false);
  assert.equal(isHttpUrl("notaurl"), false);
  assert.equal(isHttpUrl("javascript:alert(1)"), false);
  assert.equal(isHttpUrl("ftp://example.com"), false);
  assert.deepEqual(bookmarkBlockDefinition.propSchema.parse({
    url: "https://example.com/docs",
    description: "Manual description",
  }), {
    url: "https://example.com/docs",
    description: "Manual description",
  });
  assert.deepEqual(bookmarkBlockDefinition.propSchema.parse({ url: "", description: "" }), {
    url: "",
    description: "",
  });
  assert.throws(() => bookmarkBlockDefinition.propSchema.parse({
    url: "javascript:alert(1)",
    description: "",
  }));
  assert.throws(() => bookmarkBlockDefinition.propSchema.parse({
    url: "notaurl",
    description: "",
  }));
  assert.throws(() => bookmarkBlockDefinition.propSchema.parse({
    url: "ftp://example.com",
    description: "",
  }));
});
