/** Public entry point for default writing-block registration and policy. */
export {
  DEFAULT_WRITING_BLOCK_TYPE,
} from "./constants";
export type { DefaultWritingBlockOptions } from "./types";
export {
  createIsEmptyDefaultBlock,
  resolveIsEmptyBlock,
  type CreateDefaultBlock,
  type EmptyBlockCandidate,
  type IsEmptyBlock,
} from "./utils";
