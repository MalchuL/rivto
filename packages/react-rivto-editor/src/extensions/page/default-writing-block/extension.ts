/**
 * Default writing-block registration for React editors. This extension owns
 * the host-provided renderer, creation policy, emptiness policy, and slash
 * conversion while leaving persisted block invariants in the document model.
 *
 * @module
 */
import type { ReactEditorExtension } from "../../../managers";
import { DEFAULT_WRITING_BLOCK_TYPE } from "./constants";
import { registerDefaultWritingBlock } from "./register";
import type { DefaultWritingBlockOptions } from "./types";

export type { CreateDefaultBlock, DefaultWritingBlockOptions } from "./types";

/**
 * Persisted native type installed by {@link defaultWritingBlockExtension} when
 * `type` is omitted.
 *
 * This module is the only place allowed to hardcode that string. Hosts and
 * plugins may import the constant for seed data or type checks; keyboard and
 * insert paths should still use `createDefaultBlock` / `isEmptyBlock` from the
 * runtime rather than closing over this value inside shared helpers.
 */
export { DEFAULT_WRITING_BLOCK_TYPE } from "./constants";

/**
 * Registers the host writing block (definition, renderer, slash) and installs
 * `ReactEditor.createDefaultBlock` / `ReactEditor.isEmptyBlock`.
 *
 * This is the single React-layer place allowed to default the writing type to
 * {@link DEFAULT_WRITING_BLOCK_TYPE}. Downstream extensions read factories from
 * the runtime or receive them as arguments.
 */
export function defaultWritingBlockExtension(
  options: DefaultWritingBlockOptions = {},
): ReactEditorExtension {
  return {
    id: "block.default-writing",
    setup: (reactEditor) => registerDefaultWritingBlock(reactEditor, options),
  };
}
