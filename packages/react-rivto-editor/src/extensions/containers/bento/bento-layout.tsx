import { BlockBody, BlockChildren, BlockContent, BlockRow } from "@chulane/rivto-page";
import { BentoTileItem } from "./bento-tile";

/**
 * Composes a board header and width-aware tiles with data-only insertion edges.
 *
 * The board header participates in flow rather than covering the first tile.
 * Each item owns width and resize resources; Page alone renders its block subtree.
 * Empty boards retain the child host as a drop region, and collapse unmounts tiles.
 *
 * @returns Header, body contributions and the single wrapping tile collection.
 */
export function BentoLayout() {
  return (
    <>
      <BlockRow className="rivto-bento-header">
        <BlockContent />
      </BlockRow>
      <BlockBody />
      <BlockChildren
        className="rivto-bento-tiles"
        dropAxis="grid"
        dropPlacement="siblings"
        item={BentoTileItem}
        controlsPlacement="inside"
        dropBackground
        dropGaps
        emptyDropTarget
      />
    </>
  );
}
