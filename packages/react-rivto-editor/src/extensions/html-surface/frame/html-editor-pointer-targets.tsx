/**
 * Transparent targets laid over a widget's editor pointer regions, so presses
 * there reach the editor surface instead of the widget.
 *
 * @module
 */
import { BLOCK_SELECTION_ANCHOR_ATTRIBUTE, editorControlProps } from "../../../constants";
import type { HtmlEditorPointerRegion } from "../types";

/** Props for {@link HtmlEditorPointerTargets}. */
export interface HtmlEditorPointerTargetsProps {
  /** Regions reported by the widget, as fractions of the iframe viewport, already clipped. */
  readonly regions: readonly HtmlEditorPointerRegion[];
  /** Whether the targets act as Page block-selection anchors. True for Page blocks. */
  readonly blockSelectionAnchor?: boolean;
}

/**
 * Places one transparent pointer target over each editor pointer region of a widget.
 *
 * An iframe swallows pointer events, so a press on a widget's background would
 * never reach Page or the canvas. These targets sit above the iframe at the
 * reported regions, so the surrounding surface receives the press as an
 * ordinary DOM event and does what it does on its own background. They do not
 * synthesize events or write to the document.
 *
 * What the press then does depends on the surface:
 * - Canvas: a click selects the element and a drag moves it, so the targets
 *   show the `grab` cursor.
 * - Page (block-selection anchors): a plain click does nothing, a modifier
 *   click toggles block selection, and a drag starts a range block selection.
 *   The block does not move, so the targets keep the default cursor.
 *
 * The parent element must be positioned and exactly cover the iframe.
 *
 * @param props - Regions and the anchor flag.
 * @param props.regions - Regions as fractions of the iframe viewport.
 * @param props.blockSelectionAnchor - Whether the targets act as block-selection anchors.
 * @returns One target per region; nothing for an empty list.
 */
export function HtmlEditorPointerTargets({
  regions,
  blockSelectionAnchor = false,
}: HtmlEditorPointerTargetsProps) {
  const anchorProps = blockSelectionAnchor
    ? { ...editorControlProps, [BLOCK_SELECTION_ANCHOR_ATTRIBUTE]: "" }
    : {};
  const cursor = blockSelectionAnchor ? undefined : "grab";
  return regions.map((region, index) => (
    <div
      key={index}
      {...anchorProps}
      aria-hidden="true"
      data-html-editor-pointer=""
      style={{
        position: "absolute",
        left: `${region.x * 100}%`,
        top: `${region.y * 100}%`,
        width: `${region.width * 100}%`,
        height: `${region.height * 100}%`,
        cursor,
      }}
    />
  ));
}
