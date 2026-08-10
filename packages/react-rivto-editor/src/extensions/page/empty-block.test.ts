import { createIsEmptyDefaultBlock, resolveIsEmptyBlock } from "./empty-block";

describe("empty-block helpers", () => {
  test("createIsEmptyDefaultBlock matches type and empty content", () => {
    const isEmpty = createIsEmptyDefaultBlock("paragraph");
    expect(isEmpty({ type: "paragraph", content: "" })).toBe(true);
    expect(isEmpty({ type: "paragraph", content: "text" })).toBe(false);
    expect(isEmpty({ type: "heading", content: "" })).toBe(false);
  });

  test("resolveIsEmptyBlock keeps the host predicate or builds the default", () => {
    const host = () => true;
    expect(resolveIsEmptyBlock(host, "paragraph")).toBe(host);
    expect(resolveIsEmptyBlock(null, "note")({ type: "note", content: "" })).toBe(true);
    expect(resolveIsEmptyBlock(undefined, "note")({ type: "note", content: "x" })).toBe(false);
  });
});
