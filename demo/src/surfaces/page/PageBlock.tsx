import { BlockView, useBlock } from "@chulane/rivto";
import { pageBlockRenderers, UnknownBlock } from "./block-renderers";

/** Properties required to render one block subtree on the page surface. */
export interface PageBlockProps {
  /** Stable root ID of the subtree to render. */
  readonly blockId: string;
}

/**
 * Resolves and recursively renders one block subtree in document order.
 *
 * PageBlock is the page surface's rendering policy boundary. It selects the
 * content component, places nested blocks, and wraps each block in the shared
 * BlockView DOM contract. BlockView itself remains unaware of traversal and
 * renderer selection.
 *
 * Resolving by ID rather than retaining a parent snapshot ensures this subtree
 * observes the latest editor revision. A concurrently removed block renders
 * nothing instead of leaving a stale container behind.
 */
export function PageBlock({ blockId }: PageBlockProps) {
  const { block } = useBlock(blockId);

  if (!block) return null;
  const Content = pageBlockRenderers[block.type] ?? UnknownBlock;

  return (
    <BlockView block={block} className="page-block">
      <Content blockId={block.id} />

      {block.children.length > 0 && (
        <div className="page-block-children">
          {block.children.map((child) => (
            <PageBlock key={child.id} blockId={child.id} />
          ))}
        </div>
      )}
    </BlockView>
  );
}
