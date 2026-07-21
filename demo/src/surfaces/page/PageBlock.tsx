import {
  useBlock,
  useBlockSelection,
} from "@chulane/rivto";
import { PageDraggableBlock } from "../../plugins/PageDragPlugin";
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
  const { block, getters, operations } = useBlock(blockId);
  const selection = useBlockSelection(blockId);

  if (!block) return null;
  const Content = pageBlockRenderers[block.type] ?? UnknownBlock;
  const collapsed = getters.collapsed;
  const childrenId = `block-children-${block.id}`;

  return (
    <PageDraggableBlock
      block={block}
      selected={Boolean(selection)}
      controls={block.children.length > 0 && (
        <button
          type="button"
          className="page-collapse-toggle"
          data-collapse-toggle="true"
          aria-label={`${collapsed ? "Expand" : "Collapse"} block: ${block.content || block.type}`}
          aria-expanded={!collapsed}
          aria-controls={childrenId}
          onPointerDown={(event) => {
            // The toggle is a control, not a text-selection or drag endpoint.
            event.preventDefault();
            event.stopPropagation();
          }}
          onClick={operations.toggleCollapsed}
        >
          {collapsed ? "▸" : "▾"}
        </button>
      )}
      content={<Content blockId={block.id} />}
    >
      {block.children.length > 0 && !collapsed && (
        <div id={childrenId} className="page-block-children">
          {block.children.map((child) => (
            <PageBlock key={child.id} blockId={child.id} />
          ))}
        </div>
      )}
    </PageDraggableBlock>
  );
}
