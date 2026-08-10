import { DEFAULT_BLOCK_TYPE } from "@chulane/rivto";

/** Minimal block shape used by empty-block keyboard predicates. */
export interface EmptyBlockCandidate {
  readonly type: string;
  readonly content: string;
}

/** Host or built-in predicate for “empty writing block” keyboard behavior. */
export type IsEmptyBlock = (block: EmptyBlockCandidate) => boolean;

/**
 * True for a default empty writing block (`paragraph` with no text).
 *
 * Shared by Enter outdent and other empty-block keyboard paths so callers do
 * not re-encode the default type / empty-content pair.
 */
export function isEmptyDefaultBlock(block: EmptyBlockCandidate): boolean {
  return block.type === DEFAULT_BLOCK_TYPE && block.content === "";
}

/**
 * Resolves the active empty-block predicate.
 *
 * `null` / `undefined` keep {@link isEmptyDefaultBlock}; any other function is
 * used as-is (including wrappers that call the default).
 */
export function resolveIsEmptyBlock(isEmptyBlock?: IsEmptyBlock | null): IsEmptyBlock {
  return isEmptyBlock ?? isEmptyDefaultBlock;
}
