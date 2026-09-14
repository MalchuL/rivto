/** Public entry point for default writing-block registration and policy. */
export {
  DEFAULT_WRITING_BLOCK_TYPE,
  defaultWritingBlockExtension,
  type DefaultWritingBlockOptions,
} from "./extension";
export {
  createIsEmptyDefaultBlock,
  resolveIsEmptyBlock,
  type CreateDefaultBlock,
  type EmptyBlockCandidate,
  type IsEmptyBlock,
} from "./utils";
