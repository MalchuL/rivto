import {
  BLOCK_ID_ATTRIBUTE,
  BLOCK_ID_SELECTOR,
} from "../packages/react-rivto-editor/src/constants";

export {
  BLOCK_ID_ATTRIBUTE,
  BLOCK_ID_SELECTOR,
};

export const blockIdSelector = (id: string): string => `[${BLOCK_ID_ATTRIBUTE}="${id}"]`;
export const blockTypeSelector = (type: string): string => `[data-block-type="${type}"]`;
