import {
  BlockBody,
  BlockChildren,
  BlockContent,
  BlockItem,
  BlockRow,
  type BlockChildrenItemProps,
  type BlockLayoutProps,
} from "@chulane/rivto-page";
import { KanbanAddCard, KanbanAddColumn } from "./kanban-content";

/**
 * Places one already-rendered card on a background matching its block boundary.
 *
 * No padding or second block shell is added around the child. Its ordinary
 * layout controls text, descendants, hover, selection and vertical placement.
 *
 * @param props - Card identity and the Page-owned block subtree.
 * @param props.children - Existing node, rendered exactly once.
 * @returns A placement item whose visual card has the same bounds as the child.
 */
function KanbanCardItem({ children }: BlockChildrenItemProps) {
  return <BlockItem className="rivto-kanban-card">{children}</BlockItem>;
}

/**
 * Composes the editable lane header, card list, and its declarative footer.
 *
 * The vertical child host remains mounted on collapse while its cards and
 * add-card footer unmount together. Empty lanes retain their native drop area.
 * Populated lanes also accept append drops on free background and footer controls;
 * nested card regions and sibling insertion edges keep their own destinations.
 *
 * @param props - Column identity passed by Page's renderer registration.
 * @param props.blockId - Receiving parent for the footer's insert command.
 * @returns The header, body contributions and one canonical card traversal.
 */
export function KanbanColumnLayout({ blockId }: BlockLayoutProps) {
  return (
    <>
      <BlockRow className="rivto-kanban-lane-header">
        <BlockContent />
      </BlockRow>
      <BlockBody />
      <BlockChildren
        className="rivto-kanban-cards"
        dropAxis="vertical"
        dropPlacement="outline"
        dropBackground
        item={KanbanCardItem}
        controlsPlacement="inside"
        emptyDropTarget
      >
        <KanbanAddCard blockId={blockId} />
      </BlockChildren>
    </>
  );
}

/**
 * Composes the board header and horizontally scrollable columns in normal flow.
 *
 * Page supplies canonical sibling gaps and owns each column shell. The add-column
 * tile is appended as layout JSX and disappears with the children on collapse.
 * The header never overlaps the first column or queries its mounted DOM.
 *
 * @param props - Board identity passed by Page's renderer registration.
 * @param props.blockId - Receiving parent for the add-column command.
 * @returns Header, body contributions and the board's single column host.
 */
export function KanbanLayout({ blockId }: BlockLayoutProps) {
  return (
    <>
      <BlockRow className="rivto-kanban-board-header">
        <BlockContent />
      </BlockRow>
      <BlockBody />
      <BlockChildren
        className="rivto-kanban-columns"
        dropAxis="horizontal"
        dropPlacement="siblings"
        controlsPlacement="inside"
        emptyDropTarget
      >
        <KanbanAddColumn blockId={blockId} />
      </BlockChildren>
    </>
  );
}
