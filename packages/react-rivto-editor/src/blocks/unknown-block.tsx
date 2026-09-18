/**
 * Fallback renderer for persisted block types without a registered renderer.
 *
 * Keeps unknown content visible and selectable so documents authored with
 * extensions the host has not installed still round-trip without data loss.
 *
 * @module
 */
import { useBlockNode } from "../hooks";
import type { BlockRendererProps } from "../managers";

const UNKNOWN_BLOCK_CLASS = "page-unknown-block";

/**
 * Renders readable fallback content when no renderer owns a stored block type.
 *
 * @param props - Renderer context carrying the block identity.
 * @returns A dashed note naming the type and echoing its content.
 */
export function UnknownBlock({ blockId }: BlockRendererProps) {
  const { block } = useBlockNode(blockId);
  if (!block) return null;
  return (
    <div className={`${UNKNOWN_BLOCK_CLASS} rounded-md border border-dashed border-input px-2.5 py-2 text-muted-foreground`} role="note">
      Unsupported block: <strong>{block.type}</strong>
      {block.content && <span> {block.content}</span>}
    </div>
  );
}
