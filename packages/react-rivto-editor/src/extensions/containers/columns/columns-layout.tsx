import {
  BlockBody,
  BlockItem,
  type BlockChildrenItemProps,
  BlockDropTarget,
  BlockChildren,
  BlockContent,
  BlockRow,
  type BlockLayoutProps,
} from "@chulane/rivto-page";
import { HorizontalDropGap } from "../horizontal-drop-gap";
import { useBlockNode } from "../../../hooks/blocks/use-block";

/**
 * Composes a management row and equal-width, headerless content lanes.
 *
 * The preference belongs to the child host: dividers occupy the real gaps,
 * not either column's content or selection area. Page traverses each lane once.
 *
 * @param props - Board identity supplied by Page.
 * @param props.blockId - Board whose divider preference and children are observed.
 * @returns Management row, body contributions and one horizontal child group.
 */
export function ColumnsLayout({ blockId }: BlockLayoutProps) {
  const { block } = useBlockNode(blockId);
  return (
    <>
      <BlockRow
        className="rivto-columns-header"
        data-collapsed={block?.listProps.collapsed === true}
      >
        <BlockContent />
      </BlockRow>
      <BlockBody />
      <BlockChildren
        className="rivto-columns-children"
        item={ColumnBlockItem}
        dropAxis="horizontal"
        dropPlacement="siblings"
        emptyDropTarget
        gap={HorizontalDropGap}
        data-show-dividers={block?.props.showDividers !== false}
      />
    </>
  );
}

/**
 * Places one column child with its controls inside the available lane width.
 *
 * @param props - Existing child subtree supplied by Page.
 * @param props.children - Child shell rendered once without changing its layout.
 * @returns A placement item reserving row space for the child's controls.
 */
function ColumnBlockItem({ children }: BlockChildrenItemProps) {
  return <BlockItem controlsPlacement="inside">{children}</BlockItem>;
}

/**
 * Gives empty and collapsed lanes a control row alongside their ordinary children.
 *
 * Expanded populated lanes omit their own row and its controls, leaving the first
 * writing block reachable without a separate structural header above its content.
 * Empty lanes use the registered writing control; collapse restores the summary row
 * and hides the canonical child host, rather than moving descendants into a renderer.
 * The addressed snapshot observes both child count and collapse changes, including
 * deletion of the last child and expansion of a previously saved collapsed lane.
 *
 * @param props - Lane identity supplied by Page.
 * @param props.blockId - Receiving parent for header and empty-region drops.
 * @returns The lane's controls, body contributions and its single child list.
 */
export function ColumnsColumnLayout({ blockId }: BlockLayoutProps) {
  const { block } = useBlockNode(blockId);
  const showRow = block?.listProps.collapsed === true || block?.childIds.length === 0;
  return (
    <>
      {showRow && (
        <BlockDropTarget asChild destination={{ kind: "inside", parentId: blockId }}>
          <BlockRow className="rivto-columns-lane-header">
            <BlockContent />
          </BlockRow>
        </BlockDropTarget>
      )}
      <BlockBody />
      <BlockChildren
        className="rivto-columns-content"
        dropAxis="vertical"
        dropPlacement="outline"
        renderEmpty={false}
      />
    </>
  );
}
