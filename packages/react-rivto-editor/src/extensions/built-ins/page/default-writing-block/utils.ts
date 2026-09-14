/**
 * Host-configurable contracts for creating and recognizing empty writing
 * blocks. Page keyboard extensions consume this policy through ReactEditor
 * instead of hardcoding a native writing type.
 *
 * @module
 */
import type { IsEmptyBlock } from "./types";

export type {
  CreateDefaultBlock,
  EmptyBlockCandidate,
  IsEmptyBlock,
} from "./types";

/**
 * Builds an empty-block predicate for a host-supplied writing type.
 *
 * Callers pass `type` explicitly so this helper never closes over a module
 * constant.
 */
export function createIsEmptyDefaultBlock(type: string): IsEmptyBlock {
  return (block) => block.type === type && block.content === "";
}

/**
 * Resolves the active empty-block predicate.
 *
 * `null` / `undefined` keep {@link createIsEmptyDefaultBlock} for `type`; any
 * other function is used as-is (including wrappers that call the default).
 */
export function resolveIsEmptyBlock(
  isEmptyBlock: IsEmptyBlock | null | undefined,
  type: string,
): IsEmptyBlock {
  return isEmptyBlock ?? createIsEmptyDefaultBlock(type);
}
