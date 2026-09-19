/**
 * Defines editor-owned block processors and built-in registry validation steps.
 * Document models accept portable blocks without retaining editor configuration.
 */
import type { BlockInput } from "@chulane/document-model";
import type { PipeProcessor } from "../../utils/pipe";

/** Stable id for editor parent/child placement validation. */
export const BLOCK_PARENT_CONSTRAINT_PROCESSOR_ID = "rivto.block.parent-constraint";
/** Stable id for editor block-property schema validation. */
export const BLOCK_PROPS_PROCESSOR_ID = "rivto.block.props";

/**
 * Destination context supplied while processing a block mutation.
 *
 * A portable block contains its own data but not its structural parent. The
 * parent type therefore travels beside the block so placement processors can
 * enforce editor registry rules during inserts, moves, and snapshot loading.
 */
export interface BlockPipeContext {
  /**
   * Destination parent type, or null at document root.
   * This is the destination rather than necessarily the currently stored
   * parent, which lets the pipe reject an invalid move before document mutation.
   */
  parentType: string | null;
}

/** One editor-owned block validation or transformation step. */
export type BlockProcessor = PipeProcessor<BlockInput, BlockPipeContext>;

/**
 * Creates editor parent-constraint validation.
 * @param assertAllowedParent - Registry validation callback.
 * @returns Parent-constraint processor.
 */
export function createBlockParentConstraintProcessor(
  assertAllowedParent: (childType: string, parentType: string | null) => void,
): BlockProcessor {
  return {
    id: BLOCK_PARENT_CONSTRAINT_PROCESSOR_ID,
    priority: -1_000_000,
    processor: (block, context) => {
      // The block payload cannot answer where it will be placed; context makes
      // the same processor valid for roots, nested inserts, and pending moves.
      assertAllowedParent(block.type, context.parentType);
      return block;
    },
  };
}

/**
 * Creates editor block-property schema validation.
 * @param validate - Registry property validation callback.
 * @returns Property processor.
 */
export function createBlockPropsProcessor(
  validate: (type: string, props: Record<string, unknown>) => Record<string, unknown>,
): BlockProcessor {
  return {
    id: BLOCK_PROPS_PROCESSOR_ID,
    priority: -999_990,
    processor: (block) => ({ ...block, props: validate(block.type, block.props ?? {}) }),
  };
}
