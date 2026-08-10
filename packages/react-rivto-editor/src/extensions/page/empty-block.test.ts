import { DEFAULT_BLOCK_TYPE } from "@chulane/rivto";
import {
  isEmptyDefaultBlock,
  resolveIsEmptyBlock,
} from "./empty-block";

describe("isEmptyDefaultBlock", () => {
  test("accepts an empty paragraph", () => {
    expect(isEmptyDefaultBlock({ type: DEFAULT_BLOCK_TYPE, content: "" })).toBe(true);
  });

  test("rejects non-empty or non-default blocks", () => {
    expect(isEmptyDefaultBlock({ type: DEFAULT_BLOCK_TYPE, content: "text" })).toBe(false);
    expect(isEmptyDefaultBlock({ type: "markdown", content: "" })).toBe(false);
    expect(isEmptyDefaultBlock({ type: "separator", content: "" })).toBe(false);
  });
});

describe("resolveIsEmptyBlock", () => {
  test("falls back to isEmptyDefaultBlock when omitted or null", () => {
    expect(resolveIsEmptyBlock()).toBe(isEmptyDefaultBlock);
    expect(resolveIsEmptyBlock(undefined)).toBe(isEmptyDefaultBlock);
    expect(resolveIsEmptyBlock(null)).toBe(isEmptyDefaultBlock);
  });

  test("keeps a host-provided predicate", () => {
    const custom = (block: { type: string; content: string }) => block.content === "";
    expect(resolveIsEmptyBlock(custom)).toBe(custom);
    expect(resolveIsEmptyBlock(custom)({ type: "markdown", content: "" })).toBe(true);
  });
});
