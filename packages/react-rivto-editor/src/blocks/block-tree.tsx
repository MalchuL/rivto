/**
 * Generic recursive block rendering shared by every document surface.
 *
 * Surfaces supply only the root IDs they own. This component resolves block
 * renderers, structural controls, selection, decorators, and descendants so a
 * block has the same DOM and behavior wherever it is displayed.
 *
 * @module
 */
import { Fragment, useCallback, useSyncExternalStore } from "react";
import { resolveBlockListNumbers } from "../extensions/page/list-properties";
import { useBlock, useBlockSelection, useReactEditor } from "../hooks";
import {
  BlockElementRefBoundary,
  BlockWrapper,
  useBlockElementRef,
  type BlockShellProps,
} from "./block-wrapper";
import { BlockView } from "./block-view";
import { UnknownBlock } from "./unknown-block";

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
      <div className="page-block-row">
        {controls}
        {content}
      </div>
      <BlockElementRefBoundary>{children}</BlockElementRefBoundary>
    </BlockView>
  );
}

/** Resolves and renders one block together with its visible descendants. */
function BlockTreeNode({ blockId }: { readonly blockId: string }) {
  const { block, operations } = useBlock(blockId);
  const reactEditor = useReactEditor();
  const selection = useBlockSelection(blockId);
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
  const parentId = reactEditor.editor.blocks.getParentId(block.id);
  const siblingIds = parentId === null
    ? reactEditor.editor.blocks.getRootIds()
    : parentId === undefined ? [] : reactEditor.editor.blocks.getChildIds(parentId);
  const siblings = siblingIds.flatMap((id) => {
    const sibling = reactEditor.editor.blocks.getBlock(id);
    return sibling ? [sibling] : [];
  });
  const listActive = reactEditor.blocks.hasListProps("list");
  const collapseActive = reactEditor.blocks.hasListProps("collapse");
  const listNumber = listActive ? resolveBlockListNumbers(siblings).get(block.id) : undefined;
  const marker = listActive && block.listProps.type === "checkbox" ? (
    <input
      type="checkbox"
      className="page-list-checkbox"
      aria-label={`Mark block as ${block.listProps.checked ? "incomplete" : "complete"}: ${block.content || block.type}`}
      checked={block.listProps.checked === true}
      onPointerDown={(event) => event.stopPropagation()}
      onChange={(event) => operations.update({ listProps: { checked: event.currentTarget.checked } })}
    />
  ) : listNumber !== undefined ? (
    <span className="page-list-marker" aria-hidden="true">
      {listNumber}.
    </span>
  ) : null;

  return (
    <BlockWrapper
      fallback={BlockTreeShell}
      block={block}
      isSelected={Boolean(selection)}
      data-block-list-type={listActive ? block.listProps.type : undefined}
      data-block-checked={listActive && block.listProps.checked === true ? "true" : undefined}
      controls={(marker || (collapseActive && block.children.length > 0)) && (
        <Fragment>
          {marker}
          {collapseActive && block.children.length > 0 && <button
            type="button"
            className="page-collapse-toggle"
            data-collapse-toggle="true"
            aria-label={`${block.listProps.collapsed === true ? "Expand" : "Collapse"} block: ${block.content || block.type}`}
            aria-expanded={block.listProps.collapsed !== true}
            aria-controls={childrenId}
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onClick={() => operations.update({ listProps: { collapsed: block.listProps.collapsed !== true } })}
          >
            {block.listProps.collapsed === true ? "▸" : "▾"}
          </button>}
        </Fragment>
      )}
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
 * @param props - Ordered root IDs assigned to the active surface container.
 * @returns Block roots and their expanded descendants without an extra DOM wrapper.
 */
export function BlockTree({ blockIds }: BlockTreeProps) {
  return <>{blockIds.map((blockId) => <BlockTreeNode key={blockId} blockId={blockId} />)}</>;
}
