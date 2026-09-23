/**
 * Defines editor-owned block processors and built-in registry validation steps.
 * Document models accept portable blocks without retaining editor configuration.
 */
import type { BlockInput } from "@chulane/document-model";
import type { PipeProcessor } from "../../utils/pipe";

/** Stable id for editor block-property schema validation. */
export const BLOCK_PROPS_PROCESSOR_ID = "rivto.block.props";

/** One editor-owned block validation or transformation step. */
export type BlockProcessor = PipeProcessor<BlockInput>;

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
