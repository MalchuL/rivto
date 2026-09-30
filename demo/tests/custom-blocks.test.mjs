import assert from "node:assert/strict";
import test from "node:test";
import {
  counterBlockDefinition,
  sliderBlockDefinition,
} from "../src/blocks/custom-block-definitions.ts";
import {
  bookmarkBlockDefinition,
  isHttpUrl,
  mathBlockDefinition,
  noteBlockDefinition,
  tableOfContentsBlockDefinition,
  tipBlockDefinition,
  warningBlockDefinition,
} from "../src/extensions/host-blocks/definitions.ts";

test("custom block definitions expose defaults and reject invalid properties", () => {
  assert.deepEqual(sliderBlockDefinition.defaultProps, { value: 50 });
  assert.deepEqual(counterBlockDefinition.defaultProps, { count: 0 });
  assert.deepEqual(sliderBlockDefinition.propSchema.parse({ value: 0 }), { value: 0 });
  assert.deepEqual(sliderBlockDefinition.propSchema.parse({ value: 100 }), { value: 100 });
  assert.throws(() => sliderBlockDefinition.propSchema.parse({ value: 101 }));
  assert.throws(() => counterBlockDefinition.propSchema.parse({ count: -1 }));
  assert.throws(() => counterBlockDefinition.propSchema.parse({ count: 1.5 }));
});

test("host block definitions expose defaults and reject invalid admonition and URL data", () => {
  assert.deepEqual(noteBlockDefinition.defaultProps, { emoji: "💡" });
  assert.deepEqual(tipBlockDefinition.defaultProps, { emoji: "✅" });
  assert.deepEqual(warningBlockDefinition.defaultProps, { emoji: "⚠️" });
  assert.notEqual(noteBlockDefinition.type, tipBlockDefinition.type);
  assert.notEqual(tipBlockDefinition.type, warningBlockDefinition.type);
  assert.equal(noteBlockDefinition.type, "demo.note");
  assert.equal(tipBlockDefinition.type, "demo.tip");
  assert.equal(warningBlockDefinition.type, "demo.warning");
  assert.deepEqual(bookmarkBlockDefinition.defaultProps, { url: "", description: "" });
  assert.deepEqual(tableOfContentsBlockDefinition.defaultProps, {});
  assert.deepEqual(mathBlockDefinition.defaultProps, {});
  assert.deepEqual(noteBlockDefinition.propSchema.parse({ emoji: "🔥" }), { emoji: "🔥" });
  assert.throws(() => noteBlockDefinition.propSchema.parse({ emoji: "" }));
  assert.throws(() => tipBlockDefinition.propSchema.parse({ emoji: "💡", variant: "tip" }));
  assert.throws(() => warningBlockDefinition.propSchema.parse({ variant: "warning", emoji: "⚠️" }));

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
