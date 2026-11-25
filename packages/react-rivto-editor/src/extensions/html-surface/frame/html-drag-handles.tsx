/**
 * Host pointer targets laid over a widget iframe's drag regions.
 *
 * @module
 */
import { BLOCK_SELECTION_ANCHOR_ATTRIBUTE, editorControlProps } from "../../../constants";
import type { HtmlDragHandleRegion } from "../types";

/** Props for {@link HtmlDragHandles}. */
export interface HtmlDragHandlesProps {
  /** Regions reported by the widget document, already clipped to its viewport. */
  readonly regions: readonly HtmlDragHandleRegion[];
  /** Mark the targets as Page block-selection anchors (range gestures and modifier selection). */
  readonly blockSelectionAnchor?: boolean;
}

/**
 * Places transparent pointer targets over a widget's drag regions.
 *
 * An iframe swallows pointer events, so a press on a widget's background would
 * never reach Page or the canvas. These targets sit above the iframe at the
 * reported regions so the surrounding surface receives the press natively;
 * they neither synthesize events nor write to the document. The parent must
 * be a positioned box matching the iframe viewport.
 *
 * @param props - Regions and the anchor flag.
 * @returns One target per region, or nothing for an empty list.
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
