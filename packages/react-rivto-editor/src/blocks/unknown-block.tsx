import { useBlock } from "../hooks";
import type { BlockRendererProps } from "../managers";

/** Renders readable fallback content when no renderer owns a stored block type. */
export function UnknownBlock({ blockId }: BlockRendererProps) {
  const { block } = useBlock(blockId);
  if (!block) return null;
  return (
    <div className="page-unknown-block" role="note">
      Unsupported block: <strong>{block.type}</strong>
      {block.content && <span>{block.content}</span>}
    </div>
  );
}
