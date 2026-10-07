/** Canonical page-drop placement decoration and indicator rendering. */
import type { CSSProperties } from "react";
import type { DropPlacement } from "../types";

const PAGE_DROP_INDICATOR_CLASS = "page-drop-indicator";

/**
 * Renders unified feedback for a canonical between or inside placement.
 *
 * @param props - Placement and stable DOM host receiving the portal.
 * @returns One inert indicator element.
 */
export function PageDropIndicator({
  placement,
  host,
}: {
  readonly placement: DropPlacement;
  readonly host: HTMLElement;
}) {
  const rect = host.getBoundingClientRect();
  // Absolute CSS coordinates are local to the host, whereas the measured
  // region is in viewport pixels (including an edgeless card's zoom).
  // The containing block starts inside its border; DOM rectangles include it.
  const scale = host.offsetWidth ? rect.width / host.offsetWidth : 1;
  const line = placement.line;
  const style: CSSProperties | undefined = line ? {
    left: (line.x - rect.left) / scale - host.clientLeft,
    top: (line.y - rect.top) / scale - host.clientTop,
    ...(line.axis === "horizontal" ? { width: line.length / scale } : { height: line.length / scale }),
  } : undefined;
  return (
    <span
      className={PAGE_DROP_INDICATOR_CLASS}
      data-kind={placement.kind}
      data-axis={line?.axis}
      style={style}
      aria-hidden="true"
    />
  );
}
