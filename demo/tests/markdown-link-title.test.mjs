import { test } from "node:test";
import assert from "node:assert/strict";
import { findBareLinks, replaceBareLinks } from "../src/extensions/markdown/links.ts";

test("finds bare URLs without touching formatted links, images, or code", () => {
  const source =
    "See https://example.com and [label](https://already.example) `https://code.example` ![image](https://image.example/a.png)";
  assert.deepEqual(
    findBareLinks(source).map((link) => link.url),
    ["https://example.com"],
  );
});

test("writes escaped titles and preserves surrounding text", () => {
  const source = "See https://example.com now";
  assert.equal(
    replaceBareLinks(source, [{ ...findBareLinks(source)[0], title: "A [title]" }]),
    "See [A \\[title\\]](https://example.com) now",
  );
});

test("excludes surrounding punctuation and URLs inside macros", () => {
  const source = 'Read (https://example.com/path). {{image path="https://example.com/asset"}}';
  assert.deepEqual(
    findBareLinks(source).map((link) => link.url),
    ["https://example.com/path"],
  );
});
