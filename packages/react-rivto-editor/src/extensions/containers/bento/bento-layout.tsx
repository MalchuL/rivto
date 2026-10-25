import { BlockBody, BlockChildren, BlockContent, BlockRow } from "@chulane/rivto-page";
import { BentoTileItem } from "./bento-tile";

/**
 * Composes a board header and width-aware tiles with data-only insertion edges.
 *
 * The board header participates in flow rather than covering the first tile.
 * Each item owns width and resize resources; Page alone renders its block subtree.
 * Empty boards retain the child host as a drop region, and collapse unmounts tiles.
 * Unoccupied board background beyond a 32px tile gutter appends tiles; nearby
 * gutters, native tile edges and physical seams retain their insertion actions.
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
        dropGutterSize={32}
        dropGaps
        emptyDropTarget
      />
    </>
  );
}
