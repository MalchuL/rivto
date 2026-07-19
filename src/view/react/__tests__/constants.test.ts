import {
  BLOCK_CONTENT_ATTRIBUTE,
  BLOCK_CONTENT_SELECTOR,
  BLOCK_ID_ATTRIBUTE,
  BLOCK_ID_SELECTOR,
  BLOCK_SELECTED_ATTRIBUTE,
  BLOCK_SELECTED_SELECTOR,
} from "../constants";

describe("React block DOM constants", () => {
  it.each([
    [BLOCK_ID_ATTRIBUTE, BLOCK_ID_SELECTOR, "data-block-id"],
    [BLOCK_CONTENT_ATTRIBUTE, BLOCK_CONTENT_SELECTOR, "data-block-content"],
    [BLOCK_SELECTED_ATTRIBUTE, BLOCK_SELECTED_SELECTOR, "data-selected"],
  ])("keeps %s aligned with its JSX attribute and selector", (attribute, selector, expected) => {
    expect(attribute).toBe(expected);
    expect(selector).toBe(`[${attribute}]`);
  });
});
