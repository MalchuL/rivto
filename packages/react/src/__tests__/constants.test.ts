import {
  BLOCK_CONTENT_ATTRIBUTE,
  BLOCK_CONTENT_SELECTOR,
  BLOCK_ID_ATTRIBUTE,
  BLOCK_ID_SELECTOR,
  BLOCK_SELECTION_ANCHOR_ATTRIBUTE,
  BLOCK_SELECTION_ANCHOR_SELECTOR,
  BLOCK_SELECTED_ATTRIBUTE,
  BLOCK_SELECTED_SELECTOR,
  BLOCK_TYPE_ATTRIBUTE,
  BLOCK_TYPE_SELECTOR,
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
    [BLOCK_SELECTED_ATTRIBUTE, BLOCK_SELECTED_SELECTOR, "data-selected"],
    [BLOCK_TYPE_ATTRIBUTE, BLOCK_TYPE_SELECTOR, "data-block-type"],
  ])("keeps %s aligned with its JSX attribute and selector", (attribute, selector, expected) => {
    expect(attribute).toBe(expected);
    expect(selector).toBe(`[${attribute}]`);
  });
});
