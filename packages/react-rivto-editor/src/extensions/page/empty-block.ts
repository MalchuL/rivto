import type { EditorBlockInput } from "@chulane/rivto";

/** Minimal block shape used by empty-block keyboard predicates. */
export interface EmptyBlockCandidate {
  readonly type: string;
  readonly content: string;
}

/** Host or built-in predicate for “empty writing block” keyboard behavior. */
export type IsEmptyBlock = (block: EmptyBlockCandidate) => boolean;

/** Creates a detachable writing-block insert payload. */
export type CreateDefaultBlock = () => EditorBlockInput;

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
