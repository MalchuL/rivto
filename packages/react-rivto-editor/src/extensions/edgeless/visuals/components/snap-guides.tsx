import type { SnapGuidesProps } from "./types";

/**
 * Displays alignment and spacing guides inside the canvas world layer.
 *
 * The parent canvas portal owns their placement and removes them when this
 * component unmounts. No document records are changed.
 *
 * @param props - Current guide data in world coordinates.
 * @param props.guides - Alignment or spacing lines for the current placement.
 * @returns Guide elements positioned in the canvas world layer.
 */
export function SnapGuides({ guides }: SnapGuidesProps) {
  return guides.map((guide, index) => (
    <div
      key={index}
      data-edgeless-snap-guide={guide.kind}
      className={`edgeless-snap-guide edgeless-snap-guide-${guide.axis}`}
      style={
        guide.axis === "x"
          ? { left: guide.position, top: guide.from, height: guide.to - guide.from }
          : { top: guide.position, left: guide.from, width: guide.to - guide.from }
      }
    />
  ));
}
