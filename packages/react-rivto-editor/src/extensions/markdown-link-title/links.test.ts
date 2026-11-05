import { findBareLinks, replaceBareLinks } from "./links";

test("finds bare URLs without touching formatted links, images, or code", () => {
  const source =
    "See https://example.com and [label](https://already.example) `https://code.example` ![image](https://image.example/a.png)";
  expect(findBareLinks(source).map((link) => link.url)).toEqual(["https://example.com"]);
});

test("writes escaped titles and preserves surrounding text", () => {
  const source = "See https://example.com now";
  expect(replaceBareLinks(source, [{ ...findBareLinks(source)[0]!, title: "A [title]" }])).toBe(
    "See [A \\[title\\]](https://example.com) now",
  );
});

test("excludes surrounding punctuation and URLs inside macros", () => {
  const source = 'Read (https://example.com/path). {{image path="https://example.com/asset"}}';
  expect(findBareLinks(source).map((link) => link.url)).toEqual(["https://example.com/path"]);
});
