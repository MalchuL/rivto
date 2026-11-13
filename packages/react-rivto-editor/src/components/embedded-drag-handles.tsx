import { BLOCK_SELECTION_ANCHOR_ATTRIBUTE, editorControlProps } from "../constants";
import type { EmbeddedDragHandleRegion } from "./embedded-content-context";

/** Props for drag regions positioned over embedded content. */
export interface EmbeddedDragHandlesProps {
  /** Viewport-relative regions already clipped by the embedding owner. */
  readonly regions: readonly EmbeddedDragHandleRegion[];
  /** Allow Page range gestures and modifier selection without selecting on a plain click. */
  readonly blockSelectionAnchor?: boolean;
  /** Optional host class applied to each pointer target. */
  readonly className?: string;
}

/**
 * Places native pointer targets over embedded drag regions.
 *
 * The containing element must establish a positioned box matching the embedded
 * viewport. The surrounding Page or Edgeless surface owns the gesture; these
 * targets neither synthesize events nor mutate the document.
 *
 * @param props - Regions measured by the embedding owner.
 * @param props.regions - Fractions relative to the containing viewport.
 * @param props.blockSelectionAnchor - Whether the regions belong to a Page block.
 * @param props.className - Optional host class for the pointer targets.
 * @returns Pointer targets, or no elements when no regions are supplied.
 */
export function EmbeddedDragHandles({
  regions,
  blockSelectionAnchor = false,
  className,
}: EmbeddedDragHandlesProps) {
  return regions.map((region, index) => (
    <div
      key={index}
      {...(blockSelectionAnchor ? editorControlProps : {})}
      {...(blockSelectionAnchor ? { [BLOCK_SELECTION_ANCHOR_ATTRIBUTE]: "" } : {})}
      aria-hidden="true"
      className={className}
      data-rivto-embedded-drag-handle=""
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
