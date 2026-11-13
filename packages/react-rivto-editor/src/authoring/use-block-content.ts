import { useBlockNode, type UseBlockNodeResult } from "../hooks/blocks/use-block";
import {
  useBlockSelectionAnchor,
  type BlockSelectionAnchorAttributes,
} from "../hooks/blocks/use-block-selection-anchor";

/** A block's own snapshot and operations together with its structural selection region. */
export interface UseBlockContentResult<
  Props extends object = Record<string, unknown>,
> extends UseBlockNodeResult<Props> {
  /** Attributes for the renderer's whole selectable body. */
  readonly selectionProps: BlockSelectionAnchorAttributes;
}

/**
 * Subscribes to a block and marks its contentless body for structural selection.
 *
 * The snapshot is detached. Operations target the current document by ID; callbacks
 * depending on current values should read the block again when invoked. Selection
 * props belong on exactly one renderer region, not on a nested editable.
 *
 * @param blockId - Stable ID of the block whose own fields and operations are needed.
 * @returns Its current snapshot, ID-bound operations and selection props; block is undefined after deletion.
 * @throws If called outside an editor panel or embed.
 */
export function useBlockContent<Props extends object = Record<string, unknown>>(
  blockId: string,
): UseBlockContentResult<Props> {
  const result = useBlockNode<Props>(blockId);
  const selectionProps = useBlockSelectionAnchor(blockId);
  return { ...result, selectionProps };
}
