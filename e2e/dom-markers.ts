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

/** Matches a host view's blocks, excluding repeated source rows inside embeddings. */
export const HOST_BLOCK_ID_SELECTOR = `${BLOCK_ID_SELECTOR}:not([data-rivto-document-view][role="region"] ${BLOCK_ID_SELECTOR})`;

/** Selects an ID in the host view, where the same block may also be embedded. */
export const hostBlockIdSelector = (id: string): string => `${blockIdSelector(id)}:not([data-rivto-document-view][role="region"] ${BLOCK_ID_SELECTOR})`;
