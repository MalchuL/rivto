import { BlockBody, BlockChildren, BlockContent, BlockRow } from "@chulane/rivto-page";
import { BentoTileItem } from "./bento-tile";

/**
 * Composes a board header and width-aware tiles with data-only insertion edges.
 *
 * The board header participates in flow rather than covering the first tile.
 * Each item owns width and resize resources; Page alone renders its block subtree.
 * Empty boards retain the child host as a drop region, and collapse unmounts tiles.
 * Unoccupied board background appends tiles; native tile edges and physical seams
 * retain their insertion actions without extending them over that background.
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
        targetSize={16}
        dropAxis="grid"
        dropPlacement="outline"
        item={BentoTileItem}
        controlsPlacement="inside"
        dropBackground
        dropGutters={false}
        dropGaps
        emptyDropTarget
      />
    </>
  );
}
