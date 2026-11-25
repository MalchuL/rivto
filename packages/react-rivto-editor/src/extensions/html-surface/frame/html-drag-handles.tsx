/**
 * Transparent pointer targets laid over a widget's background areas.
 *
 * @module
 */
import { BLOCK_SELECTION_ANCHOR_ATTRIBUTE, editorControlProps } from "../../../constants";
import type { HtmlDragHandleRegion } from "../types";

/** Props for {@link HtmlDragHandles}. */
export interface HtmlDragHandlesProps {
  /** Regions reported by the widget, as fractions of the iframe viewport, already clipped. */
  readonly regions: readonly HtmlDragHandleRegion[];
  /** Whether the targets act as Page block-selection anchors. True for Page blocks. */
  readonly blockSelectionAnchor?: boolean;
}

/**
 * Places one transparent pointer target over each drag region of a widget.
 *
 * An iframe swallows pointer events, so a press on a widget's background would
 * never reach Page or the canvas, and the user could not drag the widget. These
 * targets sit above the iframe at the reported regions, so the surrounding
 * surface receives the press as an ordinary DOM event. They do not synthesize
 * events or write to the document.
 *
 * As block-selection anchors (Page blocks), a plain click does not select the
 * whole block, but a range drag or a modifier click does.
 *
 * The parent element must be positioned and exactly cover the iframe.
 *
 * @param props - Regions and the anchor flag.
 * @param props.regions - Regions as fractions of the iframe viewport.
 * @param props.blockSelectionAnchor - Whether the targets act as block-selection anchors.
 * @returns One target per region; nothing for an empty list.
 */
export function HtmlDragHandles({ regions, blockSelectionAnchor = false }: HtmlDragHandlesProps) {
  const anchorProps = blockSelectionAnchor
    ? { ...editorControlProps, [BLOCK_SELECTION_ANCHOR_ATTRIBUTE]: "" }
    : {};
  return regions.map((region, index) => (
    <div
      key={index}
      {...anchorProps}
      aria-hidden="true"
      data-html-drag-handle=""
      style={{
        position: "absolute",
        left: `${region.x * 100}%`,
        top: `${region.y * 100}%`,
        width: `${region.width * 100}%`,
        height: `${region.height * 100}%`,
        cursor: "grab",
      }}
    />
  ));
}
