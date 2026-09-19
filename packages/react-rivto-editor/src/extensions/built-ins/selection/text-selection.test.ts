/** Cross-block pointer-head tests for text-started selection gestures. */
import { hasCrossedBlock } from "./text-selection";

describe("hasCrossedBlock", () => {
  test("treats a contentless BlockView hit as leaving the origin writing block", () => {
    expect(hasCrossedBlock("counter", "origin-writing", "origin-writing", "origin-writing")).toBe(true);
  });

  test("keeps an in-block text drag on the origin host", () => {
    expect(hasCrossedBlock("origin-writing", "origin-writing", "origin-writing", "origin-writing")).toBe(false);
  });

  test("detects a caret that already landed in another writing block", () => {
    expect(hasCrossedBlock("next-writing", "next-writing", "next-writing", "origin-writing")).toBe(true);
  });

  test("uses the pointed BlockView when no caret host exists", () => {
    expect(hasCrossedBlock("counter", undefined, undefined, "origin-writing")).toBe(true);
    expect(hasCrossedBlock("counter", undefined, undefined, "counter")).toBe(false);
  });
});
