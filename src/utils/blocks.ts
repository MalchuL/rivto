import { BLOCK_COLLAPSED_PROP } from "../blocks/constants";

/**
 * Reads collapse state from a detached block-like value.
 *
 * Prefer `editor.getBlockCollapsed(id)` when an editor is available. This
 * utility exists for pure tree algorithms where passing the complete runtime
 * would add unnecessary coupling.
 *
 * @param block - Detached value exposing persisted native block properties.
 * @returns `true` only for the validated persisted boolean value.
 */
export function isBlockCollapsed(block: { readonly props: Record<string, unknown> }): boolean {
  return block.props[BLOCK_COLLAPSED_PROP] === true;
}
