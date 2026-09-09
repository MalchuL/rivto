import type { Pipe, PipeProcessor } from "../../../utils/pipe";
import { PIPE_INTERNAL_PRIORITY_MIN } from "../../../utils/pipe";
import type { BlockInput } from "../../types";

/** Stable id for the built-in parent/child placement processor. */
export const BLOCK_PARENT_CONSTRAINT_PROCESSOR_ID = "rivto.block.parent-constraint";
/** Stable id for the built-in block property schema processor. */
export const BLOCK_PROPS_PROCESSOR_ID = "rivto.block.props";

/**
 * Context forwarded to every block pipe processor.
 *
 * `parentType` is the destination parent native type, or `null` at document root.
 */
export interface BlockPipeContext {
  parentType: string | null;
}

/** One block validation or transform step registered on a block pipe. */
export type BlockProcessor = PipeProcessor<BlockInput, BlockPipeContext>;

/** Priority-ordered pipeline that processes portable block instances. */
export type BlockPipe = Pipe<BlockInput, BlockPipeContext>;

/**
 * Creates the built-in parent/child placement processor.
 *
 * @param assertAllowedParent - Registry check that throws when placement is forbidden.
 * @returns A processor registered at the internal priority band.
 */
export function createBlockParentConstraintProcessor(
  assertAllowedParent: (childType: string, parentType: string | null) => void,
): BlockProcessor {
  return {
    id: BLOCK_PARENT_CONSTRAINT_PROCESSOR_ID,
    priority: PIPE_INTERNAL_PRIORITY_MIN,
    processor: (block, context) => {
      assertAllowedParent(block.type, context.parentType);
      return block;
    },
  };
}

/**
 * Creates the built-in block property schema processor.
 *
 * @param validate - Registry check that normalizes complete props for a type.
 * @returns A processor registered at the internal priority band.
 */
export function createBlockPropsProcessor(
  validate: (type: string, props: Record<string, unknown>) => Record<string, unknown>,
): BlockProcessor {
  return {
    id: BLOCK_PROPS_PROCESSOR_ID,
    priority: PIPE_INTERNAL_PRIORITY_MIN + 10,
    processor: (block) => ({
      ...block,
      props: validate(block.type, block.props ?? {}),
    }),
  };
}
