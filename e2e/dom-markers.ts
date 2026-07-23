import {
  BLOCK_ID_ATTRIBUTE,
  BLOCK_ID_SELECTOR,
  BLOCK_SELECTED_ATTRIBUTE,
  BLOCK_SELECTED_SELECTOR,
  BLOCK_TYPE_ATTRIBUTE,
} from "../packages/react/src/constants";

export {
  BLOCK_ID_ATTRIBUTE,
  BLOCK_ID_SELECTOR,
  BLOCK_SELECTED_ATTRIBUTE,
  BLOCK_SELECTED_SELECTOR,
  BLOCK_TYPE_ATTRIBUTE,
};

export const blockIdSelector = (id: string): string => `[${BLOCK_ID_ATTRIBUTE}="${id}"]`;
export const blockTypeSelector = (type: string): string => `[${BLOCK_TYPE_ATTRIBUTE}="${type}"]`;
