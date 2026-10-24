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
      <BlockRow className="rivto-columns-header">
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
 * Gives each lane its own control row, empty writing target, and ordinary children.
 *
 * Expanded populated lanes have no textual header. Their small control row keeps
 * the lane itself selectable and draggable without overlapping its first child.
 * Empty lanes use the registered writing control; collapse retains that row and
 * hides the canonical child host, rather than moving descendants into a renderer.
 *
 * @param props - Lane identity supplied by Page.
 * @param props.blockId - Receiving parent for header and empty-region drops.
 * @returns The lane's controls, body contributions and its single child list.
 */
export function ColumnsColumnLayout({ blockId }: BlockLayoutProps) {
  return (
    <>
      <BlockDropTarget asChild destination={{ kind: "inside", parentId: blockId }}>
        <BlockRow className="rivto-columns-lane-header">
          <BlockContent />
        </BlockRow>
      </BlockDropTarget>
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
