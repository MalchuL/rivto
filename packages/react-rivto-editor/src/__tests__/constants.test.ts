import {
  BLOCK_CONTENT_ATTRIBUTE,
  BLOCK_CONTENT_SELECTOR,
  BLOCK_ID_ATTRIBUTE,
  BLOCK_ID_SELECTOR,
  BLOCK_ROW_CLASS,
  BLOCK_SELECTION_ANCHOR_ATTRIBUTE,
  BLOCK_SELECTION_ANCHOR_SELECTOR,
} from "../constants";

describe("React block DOM constants", () => {
  it.each([
    [BLOCK_ID_ATTRIBUTE, BLOCK_ID_SELECTOR, "data-block-id"],
    [BLOCK_CONTENT_ATTRIBUTE, BLOCK_CONTENT_SELECTOR, "data-block-content"],
    [
      BLOCK_SELECTION_ANCHOR_ATTRIBUTE,
      BLOCK_SELECTION_ANCHOR_SELECTOR,
      "data-block-selection-anchor",
    ],
  ])("keeps %s aligned with its JSX attribute and selector", (attribute, selector, expected) => {
    expect(attribute).toBe(expected);
    expect(selector).toBe(`[${attribute}]`);
  });

  it("keeps the owned-row class aligned with BlockTree shells", () => {
    expect(BLOCK_ROW_CLASS).toBe("page-block-row");
  });
});
