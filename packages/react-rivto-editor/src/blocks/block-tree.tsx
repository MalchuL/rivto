/**
 * Generic recursive block rendering shared by every document surface.
 *
 * Surfaces supply only the root IDs they own. This component resolves block
 * renderers, structural controls, selection, decorators, and descendants so a
 * block has the same DOM and behavior wherever it is displayed.
 *
 * @module
 */
import { memo, useCallback, useSyncExternalStore } from "react";
import { useBlock, useBlockSelected, useReactEditor } from "../hooks";
import {
  BlockElementRefBoundary,
  BlockWrapper,
  useBlockElementRef,
  type BlockShellProps,
} from "./block-wrapper";
import { BlockView } from "./block-view";
import { UnknownBlock } from "./unknown-block";
import { BlockSlots } from "./owner-slots";

const BLOCK_ROW_CLASS = "page-block-row";
const BLOCK_CONTENT_FLOW_CLASS = "rivto-block-content-flow";

/** Root block IDs rendered by the shared recursive block tree. */
export interface BlockTreeProps {
  /** Ordered root IDs owned by the surrounding surface or canvas element. */
  readonly blockIds: readonly string[];
}

/** Renders the stable structural shell used by every surface. */
function BlockTreeShell({ block, isSelected, content, controls, children }: BlockShellProps) {
  const blockElementRef = useBlockElementRef();
  return (
    <BlockView
      ref={blockElementRef}
      block={block}
      isSelected={isSelected}
      className="page-block"
    >
      <div className={BLOCK_ROW_CLASS}>
        {controls}
        <BlockSlots block={block} selected={isSelected}>
          <div className={BLOCK_CONTENT_FLOW_CLASS}>{content}</div>
        </BlockSlots>
      </div>
      <BlockElementRefBoundary>{children}</BlockElementRefBoundary>
    </BlockView>
  );
}

/**
 * Resolves and renders one block together with its visible descendants.
 *
 * Selection chrome uses a per-id boolean so caret publishes and range growth
 * do not re-render neighbors whose selected bit stayed the same.
 *
 * @param props - Stable block ID for this node.
 * @param props.blockId - Block to render.
 * @returns The block shell and expanded children, or null after deletion.
 */
function BlockTreeNode({ blockId }: { readonly blockId: string }) {
  const { block } = useBlock(blockId);
  const reactEditor = useReactEditor();
  const selected = useBlockSelected(blockId);
  const subscribeRenderers = useCallback(
    (listener: () => void) => reactEditor.renderers.subscribe(listener),
    [reactEditor],
  );
  useSyncExternalStore(
    subscribeRenderers,
    () => reactEditor.renderers.revision,
    () => reactEditor.renderers.revision,
  );

  if (!block) return null;
  const Content = reactEditor.renderers.get(block.type) ?? UnknownBlock;
  const childrenId = `block-children-${block.id}`;
  const collapseActive = reactEditor.blocks.hasListProps("collapse");

  return (
    <BlockWrapper
      fallback={BlockTreeShell}
      block={block}
      isSelected={selected}
      content={<Content blockId={block.id} />}
    >
      {block.children.length > 0 && (!collapseActive || block.listProps.collapsed !== true) && (
        <div id={childrenId} className="page-block-children">
          {block.children.map((child) => (
            <BlockTreeNode key={child.id} blockId={child.id} />
          ))}
        </div>
      )}
    </BlockWrapper>
  );
}

/**
 * Renders ordered block roots through the same recursive policy in every mode.
 *
 * Memoized so an edgeless card's selection chrome can re-render without
 * rebuilding Markdown when `blockIds` keeps the same reference. Per-block
 * `useBlockSelected` still wakes individual nodes whose selected bit flips.
 *
 * @param props - Ordered root IDs assigned to the active surface container.
 * @returns Block roots and their expanded descendants without an extra DOM wrapper.
 */
export const BlockTree = memo(function BlockTree({ blockIds }: BlockTreeProps) {
  return <>{blockIds.map((blockId) => <BlockTreeNode key={blockId} blockId={blockId} />)}</>;
});
