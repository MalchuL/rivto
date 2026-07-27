/**
 * Recursive rendering policy shared by the page outline and edgeless cards.
 *
 * The surface chooses content and child placement here, then delegates only
 * structural interaction chrome to the active `BlockWrapper`.
 *
 * @module
 */
import {
  useBlock,
  useBlockSelection,
  useReactEditor,
} from "../../hooks";
import {
  BlockElementRefBoundary,
  BlockView,
  BlockWrapper,
  useBlockElementRef,
  type BlockShellProps,
} from "../../blocks";
import { UnknownBlock } from "./block-renderers";

/**
 * Renders the page surface's non-interactive structural block shell.
 *
 * This fallback preserves the stable BlockView markers and page row layout when
 * no plugin contributes handles or decorations. It intentionally does not know
 * about drag-and-drop.
 *
 * @param props - Resolved block, selection state, row slots, and descendants.
 * @returns One page block container with its row followed by nested children.
 */
function PageBlockWrapper({ block, isSelected, content, controls, children }: BlockShellProps) {
  const blockElementRef = useBlockElementRef();
  return (
    <BlockView
      ref={blockElementRef}
      block={block}
      isSelected={isSelected}
      className="page-block"
    >
      <div className="page-block-row">
        {controls}
        {content}
      </div>
      <BlockElementRefBoundary>{children}</BlockElementRefBoundary>
    </BlockView>
  );
}

/** Properties required to render one block subtree on the page surface. */
export interface PageBlockProps {
  /** Stable root ID of the subtree to render. */
  readonly blockId: string;
  /** Render every child and omit page-only collapse controls. */
  readonly ignoreCollapse?: boolean;
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
 *
 * The structural shell is resolved through `BlockWrapper`. Consequently this
 * surface never imports optional plugins: the runtime may substitute a DnD or
 * decoration wrapper while renderer and recursion decisions remain here.
 *
 * @param props - Stable block ID and optional collapse-policy override.
 * @returns The complete rendered block subtree, or null if the block was
 * concurrently removed.
 */
export function PageBlock({ blockId, ignoreCollapse = false }: PageBlockProps) {
  // Hooks resolve from the editor revision so renderers never receive stale
  // snapshots after local commands, remote CRDT changes, undo, or redo.
  const { block, getters, operations } = useBlock(blockId);
  const reactEditor = useReactEditor();
  const selection = useBlockSelection(blockId);

  if (!block) return null;
  // Renderer policy belongs to the surface; BlockView only supplies DOM identity.
  const Content = reactEditor.renderers.get(block.type) ?? UnknownBlock;
  const collapsed = getters.collapsed;
  // The stable relationship lets assistive technology associate the toggle
  // with the descendant container it shows or hides.
  const childrenId = `block-children-${block.id}`;

  return (
    <BlockWrapper
      fallback={PageBlockWrapper}
      block={block}
      isSelected={!ignoreCollapse && Boolean(selection)}
      controls={!ignoreCollapse && block.children.length > 0 && (
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
      {/* Collapse removes descendants from page DOM and navigation. Edgeless
          reuse opts out because each canvas card must expose its full outline. */}
      {block.children.length > 0 && (ignoreCollapse || !collapsed) && (
        <div id={childrenId} className="page-block-children">
          {block.children.map((child) => (
            <PageBlock key={child.id} blockId={child.id} ignoreCollapse={ignoreCollapse} />
          ))}
        </div>
      )}
    </BlockWrapper>
  );
}
