import assert from "node:assert/strict";
import test from "node:test";
import { tokenizeMarkdown } from "../src/blocks/markdown-parser.ts";

test("tokenization preserves exact Markdown source and supported semantics", () => {
  const source = "**bold** *italic* ~~strike~~ `code` [link](https://example.com)\nnext";
  const tokens = tokenizeMarkdown(source);

  assert.equal(tokens.map((token) => token.raw).join(""), source);
  assert.deepEqual(
    tokens.filter((token) => token.kind !== "text").map((token) => token.kind),
    ["bold", "italic", "strike", "code", "link"],
  );
  assert.equal(tokens.find((token) => token.kind === "link")?.href, "https://example.com");
});

test("unsafe Markdown links remain plain source text", () => {
  const source = "[bad](javascript:alert(1))";
  const tokens = tokenizeMarkdown(source);

  assert.equal(tokens.map((token) => token.raw).join(""), source);
  assert.equal(tokens.some((token) => token.kind === "link"), false);
});
